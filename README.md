# CIS Audit Agent

A read-only agent that connects to a Linux host (SSH or `docker exec`), runs
a fixed allowlist of read-only commands, evaluates ~10 CIS-Benchmark-style
rules against the output, and produces a prioritized, grounded, copy-paste
remediation report (`report.json` + `report.md`).

Every fix-list item traces back to one `rule_id` and one piece of captured
command evidence — nothing is invented. See `audit_agent/rules.py` for the
parsers and `audit_agent/prioritizer.py` for the grounded fix templates.

## Install

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install -e .          # installs the `audit-agent` CLI command
```

## Run against a Docker test target (fastest way to try it)

```bash
cd test-targets
docker compose build
docker compose up -d

cd ..
audit-agent --target cis-vulnerable-target --transport docker
audit-agent --target cis-clean-target      --transport docker

cat reports/report.md
```

## Run against a real SSH host (throwaway VM only — see handout 2.1)

```bash
audit-agent \
  --target 10.0.0.42 \
  --transport ssh \
  --user ubuntu \
  --key-file ~/.ssh/id_ed25519 \
  --output-dir ./reports/prod-check-2026-08-14
```

Strict host-key checking is on by default. Only pass `--insecure` against a
disposable workshop target — the report will loudly flag it if you do.

## Verify no-drift (Part 5)

```bash
chmod +x tools/check_no_drift.sh
./tools/check_no_drift.sh cis-vulnerable-target docker
```

## Test the "broken" degradation path (Part 2.3 / hostile input)

```bash
# Permission-denied scenario: run as a non-root user so /etc/shadow,
# /etc/sudoers etc. come back "Permission denied" -> UNKNOWN, not a crash.
audit-agent --target cis-vulnerable-target --transport docker \
  --docker-exec-user nopass_user

# Unreachable-target scenario: point at a container that doesn't exist.
audit-agent --target does-not-exist --transport docker
echo "exit code: $?"   # should be 2, per Requirement 9
```

## Re-audit diff (stretch)

```bash
python3 tools/diff_reports.py reports/run1/report.json reports/run2/report.json
```

## Project layout

```
audit_agent/
  connector.py     read-only SSH (paramiko) + docker exec transports
  collector.py     THE fixed, versioned command allowlist
  rules.py         ~10 CIS-style rules, deterministic parsers, PASS/FAIL/UNKNOWN
  prioritizer.py   StaticPrioritizer (default, deterministic) + optional LLMPrioritizer
  report.py        report.json / report.md generation
  cli.py           `audit-agent` entrypoint
test-targets/
  Dockerfile.clean        hardened target -- should pass almost everything
  Dockerfile.vulnerable   misconfigured target -- fails most rules by design
  docker-compose.yml
tools/
  check_no_drift.sh   runs the agent twice, diffs the reports
  diff_reports.py     re-audit diff between two report.json files
```

## Design notes (see REPORT.md for the full writeup)

- **Command allowlist**: one dict in `collector.py`. Nothing else in the
  codebase builds a command string from rule/user/LLM input.
- **Grounding**: the default `StaticPrioritizer` has zero generative step —
  every fix-list item comes from a human-reviewed template keyed by
  `rule_id`, with the actual captured evidence interpolated in. This makes
  grounding and no-drift trivially true by construction rather than
  something to test for after the fact.
- **Optional LLM path**: `--llm` swaps in `LLMPrioritizer`, which is given
  only structured findings + evidence (never a live shell/credentials),
  called at `temperature=0`, and has a deterministic tie-break sort applied
  after the call so ordering doesn't depend on the model's phrasing.
