# OwnersAim — Interactive Financial Planning Tool

A Claude Code skill that generates **fully interactive, self-contained HTML financial
plans** for clients, in the style of Voyant-type lifetime cash-flow modelling software.

Each generated plan is a single `.html` file you can open in any browser, present to a
client live, and hand over — with **no server, no internet connection, and no data ever
leaving the file**.

## What a generated plan contains

| Section | What it does |
|---|---|
| **Overview** | Headline position: net worth today, projected at retirement, plan health |
| **Tax** | Year-by-year personal tax table (income tax, NI, dividends, CGT, HICBC) responding live to wage-growth assumptions — single rate or edited year-by-year |
| **Net worth** | Stacked chart of each individual asset growing over time under bespoke per-asset growth assumptions |
| **Cash flow** | Lifetime cash-flow chart (income vs expenditure to plan end age); click any year to open its full breakdown |
| **What-if** | Add, toggle, and customize life events — retirement changes, property moves, inheritances, school fees, career breaks, death of a partner, redundancy, gifts, or fully custom events — and see the whole plan re-project against the baseline |
| **Assumptions** | Inflation, wage growth, per-asset growth; every rate editable globally or year-by-year |
| **Report** | One-click **PDF report** of all charts, tables and summaries (print-to-PDF), plus CSV / PNG / JSON export |

Everything is interlinked: change a number anywhere and every chart, table and summary
recomputes instantly.

## How to use it

1. Open this repo in Claude Code and run the **`/financial-plan`** skill.
2. Give Claude the client's details in chat — income, assets, liabilities, goals — and
   paste the categorised expenditure output from your bank-statement tool when prompted.
3. Claude fills in a `client-data.json` from the template, runs the build script, and
   writes `clients/<client-name>/plan.html`.
4. Open the file in a browser. Present it, tweak assumptions live, run what-ifs, and
   export the PDF report for the client.

You can also run the build yourself:

```bash
python3 .claude/skills/financial-plan/scripts/build_plan.py \
    clients/smith/client-data.json \
    -o clients/smith/plan.html
```

## Privacy

- **Client data never leaves your machine.** Plans are plain local files; the generated
  HTML performs zero network requests and embeds all data and code inline.
- **`clients/` is git-ignored** — real client data is never committed or pushed.
- Nothing is published to claude.ai hosting, and per Anthropic's commercial terms,
  data you provide in Claude Code sessions is not used to train models. Keep sessions
  to the minimum client data needed.
- The only fictional dataset in version control is `examples/demo-client.json`.

## Repository layout

```
.claude/skills/financial-plan/
  SKILL.md                      ← the skill Claude follows
  templates/plan-template.html  ← the interactive app (data placeholders inside)
  templates/client-data.template.json
  scripts/build_plan.py         ← merges data + tax rules into the template
reference/
  uk-tax-legislation.md         ← current UK tax rates & rules (human-readable, sourced)
  uk-tax-data.json              ← the same figures, machine-readable (engine reads this)
  cii-financial-planning-foundations.md  ← CII Diploma/Advanced Diploma methodology
examples/demo-client.json       ← fictional demo household
clients/                        ← real client data & plans (GIT-IGNORED, local only)
```

## Keeping tax rules current

`reference/uk-tax-data.json` and `reference/uk-tax-legislation.md` hold the current tax
year's figures. At the start of each tax year (or after a Budget), ask Claude to
*"update the UK tax reference files for the new tax year"* — it re-verifies every figure
against gov.uk and regenerates both files. Existing plans keep the rules they were built
with (stamped inside the file); rebuild a plan to pick up new rules.

## Disclaimer

Plans produced by this tool are **illustrative cash-flow models, not financial advice**.
Projections depend entirely on the assumptions entered, are not guaranteed, and actual
outcomes will differ. Tax treatment depends on individual circumstances and may change.
