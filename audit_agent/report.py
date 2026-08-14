"""
report.py

Produces report.json (machine-readable, used for the re-audit diff stretch
goal and for automated grading) and report.md (human-readable summary).

Everything except the `generated_at` timestamp is deterministic given the
same findings/fix-list input -- this is what the no-drift rule (Part 5)
requires: two runs against an unchanged host must differ ONLY in timestamp.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from .rules import Finding, PASS, FAIL, UNKNOWN
from .prioritizer import FixListItem
from .collector import CollectedCommand, ALLOWLIST_VERSION
from . import __version__ as AGENT_VERSION

SEVERITY_ORDER = ["critical", "high", "medium", "low"]


def build_report(
    target: str,
    transport: str,
    findings: list[Finding],
    fix_list: list[FixListItem],
    collected: dict[str, CollectedCommand],
    insecure_host_key: bool = False,
    prioritizer_name: str = "static",
) -> dict:
    summary = {"PASS": 0, "FAIL": 0, "UNKNOWN": 0}
    severity_counts = {s: 0 for s in SEVERITY_ORDER}
    for f in findings:
        summary[f.status] += 1
        if f.status == FAIL:
            severity_counts[f.severity_hint] = severity_counts.get(f.severity_hint, 0) + 1

    report = {
        "agent_version": AGENT_VERSION,
        "allowlist_version": ALLOWLIST_VERSION,
        "target": target,
        "transport": transport,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "insecure_host_key_checking": insecure_host_key,
        "prioritizer": prioritizer_name,
        "summary": summary,
        "severity_counts_failed": severity_counts,
        "findings": [f.to_dict() for f in findings],
        "fix_list": [i.to_dict() for i in fix_list],
        "evidence": {cid: cc.to_dict() for cid, cc in collected.items()},
    }
    return report


def write_json(report: dict, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(report, fh, indent=2, sort_keys=False)


def render_markdown(report: dict) -> str:
    lines = []
    lines.append(f"# CIS Audit Report — {report['target']}")
    lines.append("")
    lines.append(f"- **Generated:** {report['generated_at']}")
    lines.append(f"- **Transport:** {report['transport']}")
    lines.append(f"- **Agent version:** {report['agent_version']}  "
                 f"**Allowlist version:** {report['allowlist_version']}")
    lines.append(f"- **Prioritizer:** {report['prioritizer']}")
    if report.get("insecure_host_key_checking"):
        lines.append(
            "- ⚠️ **Host-key verification was DISABLED for this run "
            "(`--insecure`).** Do not use this flag against a real target; "
            "it was only acceptable here because this was a throwaway "
            "workshop/test target. Man-in-the-middle risk is not mitigated "
            "on this run."
        )
    lines.append("")

    s = report["summary"]
    sev = report["severity_counts_failed"]
    lines.append("## Summary")
    lines.append("")
    lines.append(f"**{s['FAIL']} FAIL** / {s['PASS']} PASS / {s['UNKNOWN']} UNKNOWN "
                  f"out of {s['FAIL'] + s['PASS'] + s['UNKNOWN']} rules checked.")
    lines.append("")
    lines.append(
        f"Failures by severity — critical: {sev.get('critical', 0)}, "
        f"high: {sev.get('high', 0)}, medium: {sev.get('medium', 0)}, "
        f"low: {sev.get('low', 0)}"
    )
    lines.append("")

    lines.append("## Findings")
    lines.append("")
    lines.append("| Rule ID | Title | Status | Evidence |")
    lines.append("|---|---|---|---|")
    for f in report["findings"]:
        evidence = f["evidence"].replace("|", "\\|").replace("\n", " ")
        if len(evidence) > 100:
            evidence = evidence[:97] + "..."
        lines.append(f"| {f['rule_id']} | {f['title']} | {f['status']} | {evidence} |")
    lines.append("")

    lines.append("## Prioritized Fix List")
    lines.append("")
    if not report["fix_list"]:
        lines.append("Nothing to fix — every checked rule passed or was UNKNOWN. 🎉")
    for item in report["fix_list"]:
        lines.append(f"### {item['priority']}. [{item['rule_id']}] {item['category']}")
        lines.append("")
        lines.append(f"**Finding:** {item['finding']}")
        lines.append("")
        lines.append(f"**Why it matters:** {item['why_it_matters']}")
        lines.append("")
        lines.append("**Fix:**")
        lines.append("```bash")
        lines.append(item["fix_command"])
        lines.append("```")
        lines.append("")
        lines.append(f"*Evidence ref: `{item['evidence_ref']}` — see Findings table "
                      f"and Evidence Appendix above/below for the raw command output "
                      f"this was derived from.*")
        lines.append("")

    unknowns = [f for f in report["findings"] if f["status"] == "UNKNOWN"]
    if unknowns:
        lines.append("## Skipped / Unknown Checks")
        lines.append("")
        lines.append("These rules could not be verified on this run — treated as "
                      "UNKNOWN rather than guessed at:")
        lines.append("")
        for f in unknowns:
            lines.append(f"- **{f['rule_id']}** ({f['title']}): {f['evidence']}")
        lines.append("")

    lines.append("## Evidence Appendix (raw command output)")
    lines.append("")
    for cid, cc in report["evidence"].items():
        lines.append(f"### `{cid}`")
        lines.append("")
        lines.append(f"Command: `{cc['command']}`")
        lines.append("")
        if cc.get("error"):
            lines.append(f"Connector error: {cc['error']}")
        else:
            lines.append(f"Exit code: {cc['exit_code']}")
            lines.append("")
            lines.append("```")
            out = cc["stdout"] or "(empty)"
            if len(out) > 2000:
                out = out[:2000] + "\n... (truncated)"
            lines.append(out)
            lines.append("```")
        lines.append("")

    return "\n".join(lines)


def write_markdown(report: dict, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write(render_markdown(report))
