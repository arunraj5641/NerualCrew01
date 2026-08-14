"""
cli.py

Entry point: `audit-agent --target <host-or-container> --transport ssh|docker ...`

Exit codes (Requirement 9 -- fail loudly if the connector can't connect):
    0  -- session established and report generated (regardless of how many
          rules FAILed -- FAILs are expected output, not agent errors)
    1  -- bad arguments / usage error
    2  -- connector could not establish a session at all (fatal)
    3  -- unexpected internal error after connecting (bug, not a target issue)
"""

from __future__ import annotations

import argparse
import os
import sys

from .connector import SSHConnector, DockerConnector, ConnectorError
from .collector import run_all
from .rules import evaluate_all
from .prioritizer import StaticPrioritizer, LLMPrioritizer
from .report import build_report, write_json, write_markdown


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        prog="audit-agent",
        description="Read-only CIS-benchmark-style audit agent for Linux hosts.",
    )
    p.add_argument("--target", required=True,
                    help="SSH host, or container name if --transport docker")
    p.add_argument("--transport", choices=["ssh", "docker"], default="ssh")

    ssh_group = p.add_argument_group("SSH transport options")
    ssh_group.add_argument("--user", help="SSH username")
    ssh_group.add_argument("--port", type=int, default=22)
    ssh_group.add_argument("--key-file", help="Path to SSH private key")
    ssh_group.add_argument(
        "--insecure", action="store_true",
        help="Disable strict SSH host-key checking. Only for throwaway "
             "workshop targets -- the report will loudly flag this run.",
    )

    p.add_argument(
        "--docker-exec-user",
        help="Run as this user inside the container (docker transport only). "
             "Useful for exercising graceful UNKNOWN handling on "
             "permission-gated checks like /etc/shadow.",
    )
    p.add_argument("--timeout", type=int, default=20,
                    help="Per-command timeout in seconds")
    p.add_argument("--output-dir", default="./reports",
                    help="Directory to write report.json / report.md into")
    p.add_argument(
        "--llm", action="store_true",
        help="Use the LLM prioritizer instead of the default deterministic "
             "static one. Requires ANTHROPIC_API_KEY in the environment. "
             "Only use if your event/organisers permit an LLM (see handout "
             "PART 12 FAQ).",
    )
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.transport == "ssh" and not args.user:
        print("error: --user is required for --transport ssh", file=sys.stderr)
        return 1

    if args.transport == "ssh":
        connector = SSHConnector(
            host=args.target, user=args.user, port=args.port,
            key_file=args.key_file, insecure=args.insecure,
        )
    else:
        connector = DockerConnector(container=args.target,
                                     exec_user=args.docker_exec_user)

    try:
        connector.connect()
    except ConnectorError as e:
        # Requirement 9: fail loudly, non-zero exit, if we can't even open
        # a session. This is NOT the same as a rule failing.
        print(f"FATAL: could not establish session: {e}", file=sys.stderr)
        return 2

    try:
        print(f"[+] Session established with {args.target} via {args.transport}",
              file=sys.stderr)
        collected = run_all(connector, timeout=args.timeout)
        print(f"[+] Ran {len(collected)} allowlisted commands", file=sys.stderr)

        findings = evaluate_all(collected)
        print(f"[+] Evaluated {len(findings)} rules", file=sys.stderr)

        if args.llm:
            prioritizer = LLMPrioritizer()
            prioritizer_name = f"llm:{prioritizer.model}"
        else:
            prioritizer = StaticPrioritizer()
            prioritizer_name = "static"

        fix_list = prioritizer.build(findings)
        print(f"[+] Fix list: {len(fix_list)} item(s)", file=sys.stderr)

        report = build_report(
            target=args.target,
            transport=args.transport,
            findings=findings,
            fix_list=fix_list,
            collected=collected,
            insecure_host_key=(args.transport == "ssh" and args.insecure),
            prioritizer_name=prioritizer_name,
        )

        json_path = os.path.join(args.output_dir, "report.json")
        md_path = os.path.join(args.output_dir, "report.md")
        write_json(report, json_path)
        write_markdown(report, md_path)
        print(f"[+] Wrote {json_path}")
        print(f"[+] Wrote {md_path}")

        fails = report["summary"]["FAIL"]
        if fails:
            print(f"[!] {fails} rule(s) FAILED -- see fix list in {md_path}",
                  file=sys.stderr)
        return 0
    except ConnectorError as e:
        print(f"FATAL: connector failed mid-run: {e}", file=sys.stderr)
        return 2
    except Exception as e:  # noqa: BLE001
        print(f"INTERNAL ERROR: {e}", file=sys.stderr)
        return 3
    finally:
        connector.close()


if __name__ == "__main__":
    sys.exit(main())
