#!/usr/bin/env python3
"""
diff_reports.py -- stretch goal (Part 7.2): diff two report.json runs
against the same target and show what got fixed vs what's new.

Usage:
    python tools/diff_reports.py old/report.json new/report.json
"""
import json
import sys


def load(path):
    with open(path) as fh:
        return json.load(fh)


def by_rule(report):
    return {f["rule_id"]: f for f in report["findings"]}


def main():
    if len(sys.argv) != 3:
        print("usage: diff_reports.py <old report.json> <new report.json>",
              file=sys.stderr)
        return 1

    old, new = load(sys.argv[1]), load(sys.argv[2])
    old_f, new_f = by_rule(old), by_rule(new)

    fixed, regressed, unchanged, new_rules = [], [], [], []

    for rid, nf in new_f.items():
        of = old_f.get(rid)
        if of is None:
            new_rules.append(nf)
        elif of["status"] != nf["status"]:
            if nf["status"] == "PASS" and of["status"] == "FAIL":
                fixed.append((rid, of["status"], nf["status"]))
            else:
                regressed.append((rid, of["status"], nf["status"]))
        else:
            unchanged.append(rid)

    print(f"Target: {old['target']}  ->  {new['target']}")
    print(f"Old run: {old['generated_at']}")
    print(f"New run: {new['generated_at']}")
    print()
    print(f"✅ Fixed ({len(fixed)}):")
    for rid, o, n in fixed:
        print(f"   {rid}: {o} -> {n}")
    print()
    print(f"⚠️  Regressed / new failures ({len(regressed)}):")
    for rid, o, n in regressed:
        print(f"   {rid}: {o} -> {n}")
    print()
    print(f"🆕 New rules since old run ({len(new_rules)}):")
    for nf in new_rules:
        print(f"   {nf['rule_id']}: {nf['status']}")
    print()
    print(f"No change: {len(unchanged)} rule(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
