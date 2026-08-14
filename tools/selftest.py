#!/usr/bin/env python3
"""
Offline pipeline self-test: feeds synthetic (but realistic) command output
straight into the rule engine + prioritizer + report generator, bypassing
the connector entirely. This validates parsing logic and the no-drift /
grounding guarantees without needing a live SSH host or Docker daemon.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from audit_agent.collector import CollectedCommand, ALLOWLIST
from audit_agent.rules import evaluate_all, PASS, FAIL, UNKNOWN
from audit_agent.prioritizer import StaticPrioritizer
from audit_agent.report import build_report, render_markdown

VULNERABLE_OUTPUT = {
    "sshd_config": "PermitRootLogin yes\nPasswordAuthentication yes\nSubsystem sftp /usr/lib/openssh/sftp-server\n",
    "login_defs": "UMASK 022\n# PASS_MIN_LEN not set\n",
    "passwd_stat": "666 root:root\n",
    "shadow_stat": "644 root:root\n",
    "shadow_cat": "root:*:19000:0:99999:7:::\nnopass_user::19000:0:99999:7:::\nsyslog:!:19000:0:99999:7:::\n",
    "world_writable": "/usr/bin/oops-world-writable\n",
    "firewall_ufw": "sh: 1: ufw: command not found\n",
    "firewall_firewalld": "sh: 1: firewall-cmd: command not found\n",
    "firewall_iptables": "iptables v1.8.7 (legacy): can't initialize iptables table `filter': Permission denied\n",
    "auto_updates_deb": "cat: /etc/apt/apt.conf.d/20auto-upgrades: No such file or directory\n",
    "auto_updates_rpm": "cat: /etc/dnf/automatic.conf: No such file or directory\n",
    "sudoers_main": "root ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL\n",
    "sudoers_d": "--- /etc/sudoers.d/wildcard ---\nALL ALL=(ALL) NOPASSWD: ALL\n",
    "listening_sockets": "Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port\ntcp   LISTEN 0      128    0.0.0.0:4444       0.0.0.0:*\ntcp   LISTEN 0      128    0.0.0.0:22         0.0.0.0:*\n",
    "whoami": "root\n",
}

CLEAN_OUTPUT = {
    "sshd_config": "PermitRootLogin no\nPasswordAuthentication no\n",
    "login_defs": "UMASK 022\nPASS_MIN_LEN 14\n",
    "passwd_stat": "644 root:root\n",
    "shadow_stat": "640 root:shadow\n",
    "shadow_cat": "root:*:19000:0:99999:7:::\nsyslog:!:19000:0:99999:7:::\n",
    "world_writable": "",
    "firewall_ufw": "Status: active\nTo  Action From\n",
    "firewall_firewalld": "not running\n",
    "firewall_iptables": "Chain INPUT (policy ACCEPT)\n",
    "auto_updates_deb": 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n',
    "auto_updates_rpm": "cat: /etc/dnf/automatic.conf: No such file or directory\n",
    "sudoers_main": "root ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL\n",
    "sudoers_d": "--- /etc/sudoers.d/demo ---\ndemo ALL=(ALL) /usr/bin/apt-get update\n",
    "listening_sockets": "Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port\ntcp   LISTEN 0      128    127.0.0.1:22        0.0.0.0:*\n",
    "whoami": "root\n",
}


def to_collected(output_map):
    collected = {}
    for cmd_id, cmd_str in ALLOWLIST.items():
        stdout = output_map.get(cmd_id, "")
        is_error_text = ("No such file" in stdout or "command not found" in stdout
                          or "Permission denied" in stdout)
        collected[cmd_id] = CollectedCommand(
            command_id=cmd_id, command=cmd_str,
            stdout=stdout, stderr="", exit_code=(1 if is_error_text else 0),
            duration_s=0.01,
        )
    return collected


def run_scenario(name, output_map, expect_fail_count=None):
    print(f"\n{'='*70}\nSCENARIO: {name}\n{'='*70}")
    collected = to_collected(output_map)
    findings = evaluate_all(collected)
    fix_list = StaticPrioritizer().build(findings)

    for f in findings:
        print(f"  [{f.status:7}] {f.rule_id:14} {f.title}  -- {f.evidence}")

    report = build_report("synthetic-target", "docker", findings, fix_list, collected)
    print(f"\n  Summary: {report['summary']}")
    print(f"  Fix list has {len(fix_list)} item(s), priority order: "
          f"{[i.rule_id for i in fix_list]}")

    if expect_fail_count is not None:
        actual = report["summary"]["FAIL"]
        assert actual == expect_fail_count, (
            f"expected {expect_fail_count} FAILs, got {actual}")
        print(f"  ✅ FAIL count matches expectation ({expect_fail_count})")

    md = render_markdown(report)
    assert "## Prioritized Fix List" in md
    assert "## Evidence Appendix" in md
    print("  ✅ report.md rendered without error")
    return report, fix_list


def check_no_drift(output_map):
    print(f"\n{'='*70}\nNO-DRIFT CHECK (run twice, compare)\n{'='*70}")
    r1, fl1 = run_scenario("drift-check run 1", output_map)
    r2, fl2 = run_scenario("drift-check run 2", output_map)
    # strip timestamp before comparing
    r1c, r2c = dict(r1), dict(r2)
    r1c.pop("generated_at"); r2c.pop("generated_at")
    assert r1c == r2c, "DRIFT DETECTED between two identical runs!"
    print("\n✅ NO DRIFT: two runs on identical input produced byte-identical output "
          "(besides timestamp).")


def check_grounding(fix_list, findings):
    print(f"\n{'='*70}\nGROUNDING CHECK\n{'='*70}")
    fail_ids = {f.rule_id for f in findings if f.status == FAIL}
    for item in fix_list:
        assert item.rule_id in fail_ids, f"{item.rule_id} not a real FAIL finding!"
        assert item.evidence_ref == item.rule_id
    assert len(fix_list) == len(fail_ids), "fix list count doesn't match FAIL count"
    print(f"✅ Every fix-list item ({len(fix_list)}) traces to a real FAIL rule_id, "
          f"1:1, no extras, no omissions.")


if __name__ == "__main__":
    r_clean, fl_clean = run_scenario(
        "clean target (should mostly PASS)", CLEAN_OUTPUT, expect_fail_count=0)
    r_vuln, fl_vuln = run_scenario(
        "vulnerable target (should mostly FAIL)", VULNERABLE_OUTPUT, expect_fail_count=9)

    check_no_drift(VULNERABLE_OUTPUT)

    collected = to_collected(VULNERABLE_OUTPUT)
    findings = evaluate_all(collected)
    check_grounding(fl_vuln, findings)

    print(f"\n{'='*70}\nALL SELF-TESTS PASSED\n{'='*70}")
