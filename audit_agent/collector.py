"""
collector.py

The ONE place in this codebase that lists every command the agent is allowed
to run on a target. This is a fixed, versioned allowlist (ALLOWLIST_VERSION
below) -- nothing else in the codebase constructs a command string from rule
input, user input, or LLM output. If a rule ever needs "just one more
command", it gets added here deliberately, by a human, in a commit.

Every command is:
    - read-only (no writes, no service actions, no package operations)
    - non-interactive (no prompts, no pagers -- we pipe through `cat` /
      redirect stderr so nothing blocks waiting on a TTY)
    - tolerant of the target tool being absent (redirects 2>&1 or 2>/dev/null
      so a missing binary shows up as a normal non-zero exit + message
      instead of the whole run blowing up)
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

from .connector import BaseConnector, CommandResult

ALLOWLIST_VERSION = "2026-08-14.1"

# command_id -> exact shell string. FIXED. Do not interpolate anything into
# these at runtime.
ALLOWLIST: dict[str, str] = {
    "whoami": "whoami",
    "sshd_config": "cat /etc/ssh/sshd_config 2>&1",
    "login_defs": "cat /etc/login.defs 2>&1",
    "passwd_stat": "stat -c '%a %U:%G' /etc/passwd 2>&1",
    "shadow_stat": "stat -c '%a %U:%G' /etc/shadow 2>&1",
    "shadow_cat": "cat /etc/shadow 2>&1",
    "world_writable": (
        "find /etc /usr/bin /usr/sbin /usr/local/bin /bin /sbin "
        "-xdev -type f -perm -0002 2>/dev/null | head -n 50"
    ),
    "firewall_ufw": "ufw status 2>&1",
    "firewall_firewalld": "firewall-cmd --state 2>&1",
    "firewall_iptables": "iptables -L -n 2>&1",
    "auto_updates_deb": "cat /etc/apt/apt.conf.d/20auto-upgrades 2>&1",
    "auto_updates_rpm": "cat /etc/dnf/automatic.conf 2>&1",
    "sudoers_main": "cat /etc/sudoers 2>&1",
    "sudoers_d": (
        "for f in /etc/sudoers.d/*; do "
        "[ -f \"$f\" ] && echo \"--- $f ---\" && cat \"$f\" 2>&1; done"
    ),
    "listening_sockets": "ss -tulnp 2>&1 || netstat -tulnp 2>&1",
}


@dataclass
class CollectedCommand:
    command_id: str
    command: str
    stdout: str
    stderr: str
    exit_code: int
    duration_s: float
    error: str | None = None  # set if the connector itself failed (not the cmd)

    def to_dict(self):
        return asdict(self)

    @property
    def ok(self) -> bool:
        return self.error is None


def run_all(connector: BaseConnector, timeout: int = 20) -> dict[str, CollectedCommand]:
    """
    Run every allowlisted command against the connected target. A single
    command failing (missing binary, permission denied, timeout) never
    aborts the run -- it's captured and handed to the rule engine, which
    is responsible for turning that into an UNKNOWN verdict with a reason.
    """
    results: dict[str, CollectedCommand] = {}
    for cmd_id, cmd_str in ALLOWLIST.items():
        try:
            r: CommandResult = connector.run(cmd_str, timeout=timeout)
            results[cmd_id] = CollectedCommand(
                command_id=cmd_id,
                command=cmd_str,
                stdout=r.stdout,
                stderr=r.stderr,
                exit_code=r.exit_code,
                duration_s=r.duration_s,
            )
        except Exception as e:  # noqa: BLE001
            # Connector-level failure for this one command (e.g. transport
            # hiccup mid-run). Logged with a reason, not fatal to the whole
            # audit -- degrades to UNKNOWN for any rule depending on it.
            results[cmd_id] = CollectedCommand(
                command_id=cmd_id,
                command=cmd_str,
                stdout="",
                stderr="",
                exit_code=-1,
                duration_s=0.0,
                error=str(e),
            )
    return results
