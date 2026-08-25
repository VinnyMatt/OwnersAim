#!/usr/bin/env python3
"""Build a self-contained interactive financial plan HTML from a client data file.

Usage:
    python3 build_plan.py clients/<name>/client-data.json [-o clients/<name>/plan.html]

Merges the client data and the current UK tax rules (reference/uk-tax-data.json)
into templates/plan-template.html. The output is a single local HTML file with
everything embedded — it makes no network requests and holds all client data
inline, so it must be treated as confidential.
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = SKILL_DIR.parent.parent.parent
TEMPLATE = SKILL_DIR / "templates" / "plan-template.html"
TAX_DATA = REPO_ROOT / "reference" / "uk-tax-data.json"


def strip_notes(node):
    """Drop `_`-prefixed helper keys from the template so they never ship in a plan."""
    if isinstance(node, dict):
        return {k: strip_notes(v) for k, v in node.items() if not k.startswith("_")}
    if isinstance(node, list):
        return [strip_notes(v) for v in node]
    return node


def validate(data):
    problems = []
    for key in ("plan", "people", "incomes", "expenditure", "assets"):
        if key not in data:
            problems.append(f"missing top-level '{key}'")
    people_ids = {p.get("id") for p in data.get("people", [])}
    if not people_ids:
        problems.append("at least one person is required")
    for inc in data.get("incomes", []):
        if inc.get("ownerId") not in people_ids:
            problems.append(f"income '{inc.get('id')}' ownerId '{inc.get('ownerId')}' matches no person")
    for asset in data.get("assets", []):
        owner = asset.get("ownerId")
        if owner not in people_ids and owner != "joint":
            problems.append(f"asset '{asset.get('id')}' ownerId '{owner}' matches no person (use a person id or 'joint')")
    seen = set()
    for coll in ("incomes", "expenditure", "assets", "liabilities"):
        for item in data.get(coll, []):
            item_id = item.get("id")
            if item_id in seen:
                problems.append(f"duplicate id '{item_id}'")
            seen.add(item_id)
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("client_data", help="path to client-data.json")
    ap.add_argument("-o", "--output", help="output HTML path (default: plan.html beside the data file)")
    args = ap.parse_args()

    data_path = Path(args.client_data)
    client = strip_notes(json.loads(data_path.read_text()))
    tax = strip_notes(json.loads(TAX_DATA.read_text()))
    template = TEMPLATE.read_text()

    problems = validate(client)
    if problems:
        print("client data problems:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)

    html = (
        template
        .replace("/*__CLIENT_DATA__*/{}", json.dumps(client, indent=1))
        .replace("/*__TAX_DATA__*/{}", json.dumps(tax, indent=1))
        .replace("__BUILD_DATE__", date.today().isoformat())
        .replace("__TAX_YEAR__", tax.get("taxYear", "?"))
    )
    for marker in ("/*__CLIENT_DATA__*/", "/*__TAX_DATA__*/"):
        if marker in html:
            print(f"template placeholder {marker} not fully replaced", file=sys.stderr)
            sys.exit(1)

    out = Path(args.output) if args.output else data_path.with_name("plan.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB) — tax year {tax.get('taxYear')}")


if __name__ == "__main__":
    main()
