#!/usr/bin/env bash
# Verifies Part 5's no-drift rule: two runs against an unchanged target must
# produce identical findings and identical fix-list ordering (everything
# except `generated_at` must match byte-for-byte).
#
# Usage: ./tools/check_no_drift.sh <target> <transport: ssh|docker> [extra audit-agent args...]

set -euo pipefail

TARGET="$1"
TRANSPORT="$2"
shift 2

RUN1=$(mktemp -d)
RUN2=$(mktemp -d)

echo "[*] Run 1..."
audit-agent --target "$TARGET" --transport "$TRANSPORT" --output-dir "$RUN1" "$@"

echo "[*] Run 2..."
audit-agent --target "$TARGET" --transport "$TRANSPORT" --output-dir "$RUN2" "$@"

echo "[*] Comparing (ignoring generated_at + duration_s + agent timing fields)..."

python3 - "$RUN1/report.json" "$RUN2/report.json" <<'EOF'
import json, sys

def strip_volatile(report):
    report = dict(report)
    report.pop("generated_at", None)
    for cid, cc in report.get("evidence", {}).items():
        cc.pop("duration_s", None)
    return report

a = strip_volatile(json.load(open(sys.argv[1])))
b = strip_volatile(json.load(open(sys.argv[2])))

if a == b:
    print("PASS: two runs produced identical findings and fix-list ordering.")
    sys.exit(0)
else:
    print("FAIL: drift detected between the two runs.")
    import difflib
    a_lines = json.dumps(a, indent=2, sort_keys=True).splitlines()
    b_lines = json.dumps(b, indent=2, sort_keys=True).splitlines()
    for line in difflib.unified_diff(a_lines, b_lines, lineterm=""):
        print(line)
    sys.exit(1)
EOF
