"""
rules.py

~10 CIS-Benchmark-style checks. Each rule function:
    - reads ONLY from the already-captured CollectedCommand dict (never
      touches the network/target directly -- rules cannot run commands)
    - returns a finding dict matching the Findings contract in the handout:
      {rule_id, title, command, status, evidence, severity_hint}
    - status is one of PASS / FAIL / UNKNOWN
    - UNKNOWN is used whenever the evidence needed isn't available (missing
      tool, permission denied, target unreachable for that command) --
      never guessed at.

Parsers are deliberately boring: regex / exact-match against known-good
patterns, as instructed in the handout. No fuzzy logic, no LLM in this file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict

from .collector import CollectedCommand

PASS, FAIL, UNKNOWN = "PASS", "FAIL", "UNKNOWN"


@dataclass
class Finding:
    rule_id: str
    title: str
    command: str
    status: str
    evidence: str
    severity_hint: str  # critical | high | medium | low

    def to_dict(self):
        return asdict(self)


def _unavailable(cc: CollectedCommand) -> str | None:
    """Returns a human reason string if this command's output can't be
    trusted as evidence, else None."""
    if cc is None:
        return "command was not part of this collection run"
    if cc.error:
        return f"connector error: {cc.error}"
    combined = (cc.stdout or "") + (cc.stderr or "")
    if re.search(r"permission denied", combined, re.I):
        return "permission denied reading required file (audit user lacks access)"
    if re.search(r"no such file or directory", combined, re.I):
        return "required file/tool not present on target"
    if re.search(r"\bcommand\s+not\s+found\b|:\s*not\s+found\b", combined, re.I):
        return "required tool not installed on target"
    return None


def _first_directive(text: str, name: str) -> str | None:
    """First non-commented `Name value` line from an sshd_config-style file."""
    pattern = re.compile(rf"^\s*{name}\s+(\S+)", re.IGNORECASE | re.MULTILINE)
    for line in text.splitlines():
        if line.strip().startswith("#"):
            continue
        m = pattern.match(line)
        if m:
            return m.group(1).strip()
    return None


# ---------------------------------------------------------------------------
# Rule 1
def rule_ssh_root_login(results: dict) -> Finding:
    rid, title = "CIS-5.2.10", "SSH root login disabled"
    cc = results.get("sshd_config")
    cmd = cc.command if cc else "cat /etc/ssh/sshd_config"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "high")
    val = _first_directive(cc.stdout, "PermitRootLogin")
    if val is None:
        return Finding(rid, title, cmd, PASS,
                        "PermitRootLogin not explicitly set; modern OpenSSH "
                        "default is 'prohibit-password'", "high")
    if val.lower() == "yes":
        return Finding(rid, title, cmd, FAIL, f"PermitRootLogin {val}", "high")
    return Finding(rid, title, cmd, PASS, f"PermitRootLogin {val}", "high")


# ---------------------------------------------------------------------------
# Rule 2
def rule_ssh_password_auth(results: dict) -> Finding:
    rid, title = "CIS-5.2.11", "SSH password authentication disabled (key-only)"
    cc = results.get("sshd_config")
    cmd = cc.command if cc else "cat /etc/ssh/sshd_config"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "high")
    val = _first_directive(cc.stdout, "PasswordAuthentication")
    if val is None:
        return Finding(rid, title, cmd, UNKNOWN,
                        "PasswordAuthentication not explicitly set; effective "
                        "value depends on distro compile default, cannot "
                        "verify without root (sshd -T)", "high")
    if val.lower() == "yes":
        return Finding(rid, title, cmd, FAIL, f"PasswordAuthentication {val}", "high")
    return Finding(rid, title, cmd, PASS, f"PasswordAuthentication {val}", "high")


# ---------------------------------------------------------------------------
# Rule 3
def rule_password_min_len(results: dict) -> Finding:
    rid, title = "CIS-5.4.1", "Minimum password length policy is set (>=14)"
    cc = results.get("login_defs")
    cmd = cc.command if cc else "cat /etc/login.defs"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "medium")
    m = re.search(r"^\s*PASS_MIN_LEN\s+(\d+)", cc.stdout, re.MULTILINE)
    if not m:
        return Finding(rid, title, cmd, FAIL,
                        "PASS_MIN_LEN not set in /etc/login.defs", "medium")
    n = int(m.group(1))
    status = PASS if n >= 14 else FAIL
    return Finding(rid, title, cmd, status, f"PASS_MIN_LEN {n}", "medium")


# ---------------------------------------------------------------------------
# Rule 4
def rule_world_writable(results: dict) -> Finding:
    rid, title = "CIS-6.1.9", "No world-writable files in sensitive system paths"
    cc = results.get("world_writable")
    cmd = cc.command if cc else "find ... -perm -0002"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "high")
    hits = [l for l in cc.stdout.splitlines() if l.strip()]
    if hits:
        evidence = f"{len(hits)} world-writable file(s), e.g. {hits[0]}"
        return Finding(rid, title, cmd, FAIL, evidence, "high")
    return Finding(rid, title, cmd, PASS, "no world-writable files found in "
                                           "scanned paths", "high")


# ---------------------------------------------------------------------------
# Rule 5
def rule_passwd_perms(results: dict) -> Finding:
    rid, title = "CIS-6.1.3", "/etc/passwd has correct ownership and permissions"
    cc = results.get("passwd_stat")
    cmd = cc.command if cc else "stat /etc/passwd"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "high")
    parts = cc.stdout.strip().split()
    if len(parts) != 2:
        return Finding(rid, title, cmd, UNKNOWN,
                        f"unexpected stat output: {cc.stdout.strip()!r}", "high")
    perm, owner = parts
    ok = owner == "root:root" and perm in {"644", "600"}
    evidence = f"perm={perm} owner={owner}"
    return Finding(rid, title, cmd, PASS if ok else FAIL, evidence, "high")


# ---------------------------------------------------------------------------
# Rule 6
def rule_shadow_perms(results: dict) -> Finding:
    rid, title = "CIS-6.1.4", "/etc/shadow has correct ownership and permissions"
    cc = results.get("shadow_stat")
    cmd = cc.command if cc else "stat /etc/shadow"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "high")
    parts = cc.stdout.strip().split()
    if len(parts) != 2:
        return Finding(rid, title, cmd, UNKNOWN,
                        f"unexpected stat output: {cc.stdout.strip()!r}", "high")
    perm, owner = parts
    try:
        perm_ok = int(perm) <= 640
    except ValueError:
        perm_ok = False
    owner_ok = owner in {"root:shadow", "root:root"}
    evidence = f"perm={perm} owner={owner}"
    return Finding(rid, title, cmd, PASS if (perm_ok and owner_ok) else FAIL,
                    evidence, "high")


# ---------------------------------------------------------------------------
# Rule 7
def rule_firewall_active(results: dict) -> Finding:
    rid, title = "CIS-3.5.1", "A host firewall is active"
    ufw, firewalld, iptables = (results.get("firewall_ufw"),
                                 results.get("firewall_firewalld"),
                                 results.get("firewall_iptables"))
    cmd = "ufw status || firewall-cmd --state || iptables -L -n"

    if ufw and not ufw.error and re.search(r"Status:\s*active", ufw.stdout, re.I):
        return Finding(rid, title, ufw.command, PASS, ufw.stdout.strip().splitlines()[0], "medium")

    if firewalld and not firewalld.error and "running" in firewalld.stdout.lower():
        return Finding(rid, title, firewalld.command, PASS,
                        firewalld.stdout.strip(), "medium")

    if iptables and not iptables.error and re.search(r"permission denied", iptables.stdout, re.I) is None \
            and "command not found" not in iptables.stdout.lower():
        chains = re.findall(r"^Chain (\S+) \(policy (\S+)\)", iptables.stdout, re.MULTILINE)
        has_rules = bool(re.search(r"^(ACCEPT|DROP|REJECT|LOG)\s", iptables.stdout, re.MULTILINE))
        non_accept_policy = any(pol != "ACCEPT" for _, pol in chains)
        if has_rules or non_accept_policy:
            return Finding(rid, title, iptables.command, PASS,
                            f"iptables has active policy/rules: {chains}", "medium")
        if chains:
            return Finding(rid, title, iptables.command, FAIL,
                            f"iptables loaded with no rules, default-ACCEPT: {chains}",
                            "medium")

    reasons = [r for r in (_unavailable(ufw), _unavailable(firewalld), _unavailable(iptables))]
    if all(reasons):
        return Finding(rid, title, cmd, UNKNOWN,
                        "no firewall tool (ufw/firewalld/iptables) usable: "
                        + "; ".join(x for x in reasons if x), "medium")
    return Finding(rid, title, cmd, FAIL, "no firewall reported as active", "medium")


# ---------------------------------------------------------------------------
# Rule 8
def rule_auto_updates(results: dict) -> Finding:
    rid, title = "CIS-1.2.2", "Automatic security updates are enabled"
    deb, rpm = results.get("auto_updates_deb"), results.get("auto_updates_rpm")

    if deb and not deb.error:
        if re.search(r'APT::Periodic::Unattended-Upgrade\s+"1"', deb.stdout):
            return Finding(rid, title, deb.command, PASS, deb.stdout.strip(), "medium")
        if _unavailable(deb) is None and deb.stdout.strip():
            return Finding(rid, title, deb.command, FAIL,
                            "20auto-upgrades present but Unattended-Upgrade not "
                            "set to 1", "medium")

    if rpm and not rpm.error:
        m = re.search(r"^\s*apply_updates\s*=\s*(yes|no)", rpm.stdout,
                       re.IGNORECASE | re.MULTILINE)
        if m:
            status = PASS if m.group(1).lower() == "yes" else FAIL
            return Finding(rid, title, rpm.command, status, m.group(0).strip(), "medium")

    deb_reason, rpm_reason = _unavailable(deb), _unavailable(rpm)
    if deb_reason and rpm_reason:
        return Finding(rid, title, "apt 20auto-upgrades / dnf automatic.conf",
                        UNKNOWN,
                        f"neither package-manager auto-update config found "
                        f"(deb: {deb_reason}; rpm: {rpm_reason})", "medium")
    return Finding(rid, title, "apt 20auto-upgrades / dnf automatic.conf", FAIL,
                    "auto-update config present but not enabled", "medium")


# ---------------------------------------------------------------------------
# Rule 9
def rule_empty_passwords(results: dict) -> Finding:
    rid, title = "CIS-6.2.9", "No accounts have an empty password"
    cc = results.get("shadow_cat")
    cmd = cc.command if cc else "cat /etc/shadow"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "critical")
    empty_accts = []
    for line in cc.stdout.splitlines():
        fields = line.split(":")
        if len(fields) >= 2 and fields[1] == "":
            empty_accts.append(fields[0])
    if empty_accts:
        return Finding(rid, title, cmd, FAIL,
                        f"account(s) with empty password field: {empty_accts}",
                        "critical")
    return Finding(rid, title, cmd, PASS, "no empty password fields in /etc/shadow",
                    "critical")


# ---------------------------------------------------------------------------
# Rule 10
def rule_sudoers_nopasswd_wildcard(results: dict) -> Finding:
    rid, title = "CIS-5.3.1", "sudoers contains no blanket NOPASSWD:ALL wildcard"
    main, d = results.get("sudoers_main"), results.get("sudoers_d")
    cmd = "cat /etc/sudoers /etc/sudoers.d/*"
    main_reason, d_reason = _unavailable(main), _unavailable(d)
    if main_reason and d_reason:
        return Finding(rid, title, cmd, UNKNOWN,
                        f"could not read sudoers files (main: {main_reason}; "
                        f"sudoers.d: {d_reason})", "critical")

    pattern = re.compile(
        r"^\s*(ALL|%\S+|\S+)\s+ALL\s*=\s*\(\s*ALL(?::ALL)?\s*\)\s*NOPASSWD:\s*ALL",
        re.IGNORECASE | re.MULTILINE,
    )
    text = ""
    if main and not main.error:
        text += main.stdout + "\n"
    if d and not d.error:
        text += d.stdout + "\n"

    m = pattern.search(text)
    if m:
        return Finding(rid, title, cmd, FAIL, m.group(0).strip(), "critical")
    return Finding(rid, title, cmd, PASS,
                    "no blanket 'ALL ALL=(ALL) NOPASSWD:ALL' entry found",
                    "critical")


# ---------------------------------------------------------------------------
# Stretch rule 11 (bonus -- widen coverage once the core 10 are solid)
def rule_listening_all_interfaces(results: dict) -> Finding:
    rid, title = "CIS-9.1.1", "No unexpected service listening on all interfaces"
    cc = results.get("listening_sockets")
    cmd = cc.command if cc else "ss -tulnp"
    reason = _unavailable(cc)
    if reason:
        return Finding(rid, title, cmd, UNKNOWN, reason, "medium")
    # Known-benign local services on 0.0.0.0 / :: can be added here as they're
    # confirmed on a given fleet; kept minimal/boring on purpose.
    allowlisted_ports = {"22"}
    hits = []
    for line in cc.stdout.splitlines():
        m = re.search(r"(?:0\.0\.0\.0|\*|\[::\]):(\d+)", line)
        if m and m.group(1) not in allowlisted_ports:
            hits.append(line.strip())
    if hits:
        return Finding(rid, title, cmd, FAIL,
                        f"{len(hits)} socket(s) bound to all interfaces, e.g. "
                        f"{hits[0]}", "medium")
    return Finding(rid, title, cmd, PASS,
                    "no unexpected services bound to all interfaces", "medium")


# Order here IS the deterministic tie-break order used before severity
# sorting in the prioritizer -- keep it stable, don't reorder casually.
ALL_RULES = [
    rule_ssh_root_login,
    rule_ssh_password_auth,
    rule_password_min_len,
    rule_world_writable,
    rule_passwd_perms,
    rule_shadow_perms,
    rule_firewall_active,
    rule_auto_updates,
    rule_empty_passwords,
    rule_sudoers_nopasswd_wildcard,
    rule_listening_all_interfaces,  # stretch / bonus, rule 11
]


def evaluate_all(results: dict) -> list[Finding]:
    return [rule_fn(results) for rule_fn in ALL_RULES]
