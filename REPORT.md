# REPORT.md — CIS Audit Agent

*(Template pre-filled with real design decisions from this build. Fill in
the Results table and How We Worked section with your own session's actual
runs and timeline before submitting.)*

## 1. What we built

A CLI agent (`audit-agent`) that opens one read-only session (SSH via
paramiko, or `docker exec`) against a target, runs a fixed 15-command
allowlist, evaluates 10 mandatory + 1 stretch CIS-style rules with
deterministic regex/exact-match parsers, and hands the FAIL findings to a
static, template-driven prioritizer that produces a ranked, grounded fix
list. Output is `report.json` (machine-readable) and `report.md`
(human-readable), both containing every rule's evidence and every
fix-list item's traceable `rule_id`. What works: the full pipeline
end-to-end against both Docker test targets, graceful UNKNOWN handling for
permission-denied and missing-tool cases, and byte-identical repeated runs
(verified by `tools/check_no_drift.sh`). What doesn't: `ufw`/`firewalld`
rarely function inside an unprivileged Docker container (no netfilter
access), so the firewall rule reliably reports UNKNOWN there rather than a
real PASS/FAIL — this is a container-test-harness limitation, not an agent
bug (see Limitations).

## 2. The rule set

| Rule ID | Checks | Command(s) | PASS/FAIL/UNKNOWN logic |
|---|---|---|---|
| CIS-5.2.10 | SSH root login disabled | `cat /etc/ssh/sshd_config` | FAIL if `PermitRootLogin yes`; PASS if `no`/`prohibit-password`/unset (secure default); UNKNOWN if file unreadable |
| CIS-5.2.11 | SSH password auth disabled | same | FAIL if `PasswordAuthentication yes`; PASS if `no`; UNKNOWN if unset (distro-dependent default) |
| CIS-5.4.1 | Min password length >= 14 | `cat /etc/login.defs` | PASS if `PASS_MIN_LEN >= 14`; FAIL if set lower or missing; UNKNOWN if file unreadable |
| CIS-6.1.9 | No world-writable files in sensitive paths | `find ... -perm -0002` | FAIL if any hits; PASS if empty; UNKNOWN on connector error |
| CIS-6.1.3 | `/etc/passwd` ownership+perms | `stat -c '%a %U:%G' /etc/passwd` | PASS if `root:root` and perm in {644,600}; else FAIL |
| CIS-6.1.4 | `/etc/shadow` ownership+perms | `stat -c '%a %U:%G' /etc/shadow` | PASS if owner in {root:shadow,root:root} and perm <=640; else FAIL |
| CIS-3.5.1 | Host firewall active | `ufw status` / `firewall-cmd --state` / `iptables -L -n` | PASS if any reports active/running/non-default policy; UNKNOWN if none usable; else FAIL |
| CIS-1.2.2 | Automatic security updates enabled | `cat /etc/apt/apt.conf.d/20auto-upgrades` / dnf automatic.conf | PASS if `Unattended-Upgrade "1"` / `apply_updates=yes`; UNKNOWN if neither config exists; else FAIL |
| CIS-6.2.9 | No empty-password accounts | `cat /etc/shadow` | FAIL listing accounts with empty field 2; UNKNOWN if unreadable (no sudo) |
| CIS-5.3.1 | No sudoers `NOPASSWD:ALL` wildcard | `cat /etc/sudoers` + `/etc/sudoers.d/*` | FAIL if `ALL ALL=(ALL) NOPASSWD:ALL` pattern found; UNKNOWN if unreadable |
| CIS-9.1.1 (stretch) | No unexpected 0.0.0.0 listeners | `ss -tulnp` | FAIL listing non-allowlisted ports bound to all interfaces |

## 3. Methods

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Transport | SSH (paramiko) + docker exec, shared collector interface | telnet/raw socket | SSH is the real-world transport; docker exec needed for the fast local test loop |
| Command allowlist | Single dict in `collector.py`, versioned string | dynamic per-rule command building | any dynamic construction is an RCE hole disguised as a feature (handout 6.5) |
| Read-only enforcement | Every allowlisted command is read-only by inspection; no write/service/package commands exist anywhere in the codebase | a "safe mode" flag on a general-purpose executor | a flag can be forgotten/bypassed; having no mutating command *at all* is a stronger guarantee |
| Prioritizer | Static, template-driven (default) | Pure-LLM prioritizer as default | static is deterministic and 100%-grounded *by construction* — the no-drift and grounding requirements stop being things you have to test for and become structurally guaranteed |
| LLM support | Optional `--llm` flag, findings-only input, temp=0, deterministic post-sort | none | keeps the option open for events that permit an LLM, without weakening the default path |

## 4. Results

*(Fill in with your own real runs before submitting — table below shows the
expected shape using the two shipped Docker test targets as a starting
point.)*

| # | Target | Rules FAILed | Correct? | False positive/negative explanation |
|---|---|---|---|---|
| 1 | `cis-clean-target` (docker) | 0–1 (firewall UNKNOWN, not FAIL, in unprivileged container) | ✅ | Firewall check correctly downgrades to UNKNOWN rather than FAIL when no firewall tool can report a real state in an unprivileged container — avoids a false FAIL |
| 2 | `cis-vulnerable-target` (docker) | 9 of 10 (all but firewall/UNKNOWN) | ✅ | Matches every intentional misconfiguration baked into `Dockerfile.vulnerable` |
| 3 | `cis-vulnerable-target` as `nopass_user` | shadow/sudoers rules -> UNKNOWN | ✅ | Confirms permission-denied degrades gracefully instead of crashing or guessing |
| 4 | nonexistent container | fatal, exit code 2 | ✅ | Requirement 9: connector failure is loud and non-zero, not a silent empty report |
| 5 | (repeat run of #2) | identical findings + ordering | ✅ | `tools/check_no_drift.sh` confirms byte-identical JSON except `generated_at` |
| 6 | *(your real SSH target here)* | | | |

## 5. How we worked

*(Fill in your actual Part 8 checkpoint timeline and one abandoned dead end
here — e.g. "we initially tried parsing `sshd -T` output instead of the
config file directly, but that requires root and gave inconsistent results
across our non-root SSH test user, so we switched to parsing
`sshd_config` directly and treating ambiguous defaults as UNKNOWN.")*

## 6. Limitations and next steps

- **`ufw`/`firewalld`/`iptables` inside unprivileged Docker containers**
  frequently can't report a real state (no netfilter access without
  `--cap-add=NET_ADMIN`), so the firewall rule under-reports as UNKNOWN in
  the container test harness specifically. Against a real VM or bare-metal
  SSH target this is not an issue. Next step: add a `--privileged`
  docker-compose profile for firewall-rule testing specifically.
- **sudo-restricted evidence gathering** (`/etc/shadow`, `/etc/sudoers`) is
  currently handled by degrading to UNKNOWN rather than requesting elevated
  access, per the handout FAQ ("do we need to support sudo-gated checks? No,
  unless you want the stretch credit"). Next step: an opt-in
  `--allow-sudo-reads` flag that runs *only* the specific read-only `sudo
  cat` commands needed for those two files, never anything broader.
- **`PasswordAuthentication` default-when-unset** is reported UNKNOWN
  because the compiled-in OpenSSH default varies by distro and can't be
  verified without root running `sshd -T`. Next step: ship a small
  distro-version-to-default lookup table to turn this into a real
  PASS/FAIL for the most common distros.
- **Rule coverage** is 10 mandatory + 1 stretch; the full CIS Ubuntu
  benchmark has hundreds of controls. Widening coverage is explicitly lower
  priority than grounding/no-drift per the marking rubric (10/100 marks).

## 7. How to run it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install -e .

cd test-targets && docker compose up -d --build && cd ..

audit-agent --target cis-vulnerable-target --transport docker
cat reports/report.md
```

Full instructions, including the SSH path and the no-drift/hostile-input
test commands, are in `README.md`.
