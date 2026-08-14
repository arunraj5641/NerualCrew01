"""
prioritizer.py

Turns FAIL findings into a ranked, explained fix list. The prioritizer NEVER
decides PASS/FAIL -- that verdict already came from rules.py and is treated
here as ground truth. This module only ranks, explains, and writes the exact
remediation command.

Two implementations are provided:

  1. StaticPrioritizer (default, used by the CLI unless --llm is passed).
     Every explanation and fix command comes from a small, human-reviewed
     template table below. This is fully deterministic by construction --
     it trivially satisfies the no-drift requirement in Part 5, and every
     item is 100% traceable to the rule_id it came from (Part 1 grounding
     requirement), because there's no generative step at all.

  2. LLMPrioritizer (optional, only meaningful if your event permits an
     LLM/API key -- see PART 12 FAQ in the handout). It is given ONLY the
     structured findings + evidence snippets, never a live shell, and is
     instructed to return structured JSON. Temperature is pinned to 0 and
     a deterministic tie-break sort is applied *after* the call, so that
     two runs against an unchanged host still produce the same ordering
     even if the LLM's ranking reasoning text varies slightly. If you use
     this path, treat the FIX_TEMPLATES table as a cross-check: any
     LLM-proposed fix_command that materially differs from the known-good
     template for that rule_id should be flagged for human review before
     it ships in a report (this is the stretch-goal "known-good table"
     mentioned in Part 7.2).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict

from .rules import Finding, FAIL

SEVERITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}


@dataclass
class FixListItem:
    priority: int
    rule_id: str
    category: str
    finding: str
    why_it_matters: str
    fix_command: str
    evidence_ref: str

    def to_dict(self):
        return asdict(self)


# rule_id -> (category, finding template, why_it_matters, fix_command)
# `finding` and `fix_command` may reference {evidence} which is filled in
# from the actual captured evidence at build time -- this is what keeps
# every item grounded in real output rather than generic advice.
FIX_TEMPLATES = {
    "CIS-5.2.10": (
        "SSH hardening",
        "Root login over SSH is permitted ({evidence}).",
        "A leaked or brute-forced root credential grants full remote access "
        "with no separate privilege-escalation step.",
        "sudo sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' "
        "/etc/ssh/sshd_config && sudo systemctl reload sshd",
    ),
    "CIS-5.2.11": (
        "SSH hardening",
        "SSH password authentication is enabled ({evidence}).",
        "Password auth is exposed to online brute-force/credential-stuffing; "
        "key-only auth removes that entire attack surface.",
        "sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' "
        "/etc/ssh/sshd_config && sudo systemctl reload sshd",
    ),
    "CIS-5.4.1": (
        "Password policy",
        "Minimum password length policy is missing or too short ({evidence}).",
        "Short minimum lengths make offline and online password guessing "
        "dramatically cheaper.",
        "sudo sed -i '/^PASS_MIN_LEN/d' /etc/login.defs && "
        "echo 'PASS_MIN_LEN 14' | sudo tee -a /etc/login.defs",
    ),
    "CIS-6.1.9": (
        "Filesystem hardening",
        "World-writable file(s) found in sensitive system paths ({evidence}).",
        "Any local user (or compromised low-priv process) can modify these "
        "files, which is a direct path to privilege escalation or persistence.",
        "sudo find /etc /usr/bin /usr/sbin /usr/local/bin /bin /sbin -xdev "
        "-type f -perm -0002 -exec chmod o-w {{}} \\;",
    ),
    "CIS-6.1.3": (
        "Filesystem hardening",
        "/etc/passwd has incorrect ownership or permissions ({evidence}).",
        "Overly permissive access to /etc/passwd allows tampering with the "
        "system's account list.",
        "sudo chown root:root /etc/passwd && sudo chmod 644 /etc/passwd",
    ),
    "CIS-6.1.4": (
        "Filesystem hardening",
        "/etc/shadow has incorrect ownership or permissions ({evidence}).",
        "Loose permissions on /etc/shadow expose password hashes to offline "
        "cracking by any local user.",
        "sudo chown root:shadow /etc/shadow && sudo chmod 640 /etc/shadow",
    ),
    "CIS-3.5.1": (
        "Network hardening",
        "No active host firewall was detected ({evidence}).",
        "Without a host firewall, every listening service is reachable from "
        "anywhere the network route allows, regardless of intent.",
        "sudo ufw default deny incoming && sudo ufw allow OpenSSH && "
        "sudo ufw enable",
    ),
    "CIS-1.2.2": (
        "Patch management",
        "Automatic security updates are not enabled ({evidence}).",
        "Known-CVE patches only land if updates are applied; unattended "
        "security updates close the gap between disclosure and patching.",
        "sudo apt-get install -y unattended-upgrades && "
        "sudo dpkg-reconfigure -plow unattended-upgrades",
    ),
    "CIS-6.2.9": (
        "Account hardening",
        "Account(s) with an empty password field found ({evidence}).",
        "An empty password field allows login with no password at all under "
        "common PAM configurations -- this is a direct, unauthenticated "
        "compromise path.",
        "sudo passwd -l <account>   # lock immediately, then set a real "
        "password with: sudo passwd <account>",
    ),
    "CIS-5.3.1": (
        "Privilege management",
        "sudoers contains a blanket NOPASSWD:ALL wildcard ({evidence}).",
        "Any account matching that rule can become root with no password "
        "prompt -- a single stolen session is a full compromise.",
        "sudo visudo   # remove the offending 'ALL ALL=(ALL) NOPASSWD:ALL' "
        "line and replace with scoped, command-specific NOPASSWD entries "
        "only where justified",
    ),
    "CIS-9.1.1": (
        "Network hardening",
        "Service(s) listening on all interfaces unexpectedly ({evidence}).",
        "Binding to 0.0.0.0 exposes the service to every network the host "
        "is attached to, not just localhost/intended peers.",
        "# identify the owning process from the evidence (ss -tulnp), then "
        "either bind it to 127.0.0.1/a specific interface in its config, or "
        "sudo systemctl disable --now <service> if it's not needed",
    ),
}


class StaticPrioritizer:
    """Deterministic, template-driven. Default and recommended path."""

    def build(self, findings: list[Finding]) -> list[FixListItem]:
        fails = [f for f in findings if f.status == FAIL]
        # Deterministic sort: severity weight descending, then rule_id
        # ascending as the tie-break. This ordering is stable across runs
        # by construction -- no randomness, no LLM, nothing time-dependent.
        fails.sort(key=lambda f: (-SEVERITY_WEIGHT.get(f.severity_hint, 0), f.rule_id))

        items = []
        for priority, f in enumerate(fails, start=1):
            template = FIX_TEMPLATES.get(f.rule_id)
            if template is None:
                # Should never happen if every rule has a template, but fail
                # loudly rather than silently emitting an ungrounded item.
                raise ValueError(f"No fix template registered for {f.rule_id}")
            category, finding_tpl, why, fix_cmd = template
            items.append(FixListItem(
                priority=priority,
                rule_id=f.rule_id,
                category=category,
                finding=finding_tpl.format(evidence=f.evidence),
                why_it_matters=why,
                fix_command=fix_cmd,
                evidence_ref=f.rule_id,
            ))
        return items


class LLMPrioritizer:
    """
    Optional. Only use this if your event permits calling an LLM/API key
    (see handout PART 12). Findings + evidence only are sent -- never a
    live shell or credentials. temperature=0 and a deterministic tie-break
    sort are applied so repeated runs on an unchanged host stay stable.
    """

    def __init__(self, model="claude-sonnet-4-6", api_key_env="ANTHROPIC_API_KEY"):
        self.model = model
        self.api_key = os.environ.get(api_key_env)
        if not self.api_key:
            raise RuntimeError(
                f"{api_key_env} not set. Store the key in the environment, "
                f"never in code."
            )

    def build(self, findings: list[Finding]) -> list[FixListItem]:
        import anthropic  # imported lazily so it's only a hard dep if used

        fails = [f for f in findings if f.status == FAIL]
        if not fails:
            return []

        client = anthropic.Anthropic(api_key=self.api_key)
        findings_json = json.dumps([f.to_dict() for f in fails], indent=2)

        system = (
            "You are a remediation-prioritization assistant for a Linux CIS "
            "audit tool. You will be given a JSON array of FAIL findings, "
            "each with rule_id, title, command, status, evidence, and "
            "severity_hint. You do NOT have shell access and must not "
            "invent findings. For each finding, output one fix-list item "
            "with: rule_id, category, finding (referencing the given "
            "evidence), why_it_matters, fix_command (exact, runnable), and "
            "evidence_ref (must equal rule_id). Rank items by real-world "
            "risk. Return ONLY a JSON array, no prose, no markdown fences."
        )

        resp = client.messages.create(
            model=self.model,
            max_tokens=2000,
            temperature=0,
            system=system,
            messages=[{"role": "user", "content": findings_json}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        raw_items = json.loads(text)

        valid_rule_ids = {f.rule_id for f in fails}
        items = []
        for obj in raw_items:
            if obj.get("rule_id") not in valid_rule_ids:
                # Refuse to include anything not traceable to a real
                # finding -- this is the grounding guarantee even on the
                # LLM path.
                continue
            items.append(FixListItem(
                priority=0,  # reassigned below
                rule_id=obj["rule_id"],
                category=obj.get("category", "General"),
                finding=obj.get("finding", ""),
                why_it_matters=obj.get("why_it_matters", ""),
                fix_command=obj.get("fix_command", ""),
                evidence_ref=obj["rule_id"],
            ))

        sev_by_rule = {f.rule_id: SEVERITY_WEIGHT.get(f.severity_hint, 0) for f in fails}
        items.sort(key=lambda it: (-sev_by_rule.get(it.rule_id, 0), it.rule_id))
        for i, it in enumerate(items, start=1):
            it.priority = i
        return items
