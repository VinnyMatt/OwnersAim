# CLAUDE.md — OwnersAim financial planning tool

Voyant-style lifetime cash-flow planner for a UK financial-planning professional.
One repo = one tool: the `/financial-plan` skill turns a client data JSON into a
self-contained, offline, interactive HTML plan.

## The one rule that outranks everything

**Real client data lives only in `clients/` and is git-ignored. Never commit, push,
publish, or transmit it. Never publish a client plan as an Artifact.** The only
committed dataset is the fictional one in `examples/` (plus fictional training data
the user pastes in chat, e.g. the "Smith" family in `clients/testvincent/`, which
still stays uncommitted).

## Architecture (read this before editing)

```
.claude/skills/financial-plan/
  SKILL.md                        ← workflow + engine approximations (keep in sync!)
  templates/plan-template.html    ← THE product: ~3.5k lines, all CSS/JS inline
  templates/client-data.template.json  ← documented data schema (_-prefixed keys are stripped)
  scripts/build_plan.py           ← injects client JSON + tax JSON into the template
  scripts/tax_check.js            ← headless tax-efficiency checker: ranks all 24
                                    withdrawal orders by shortfall → net legacy after
                                    IHT → lifetime tax. RUN IT AFTER EVERY NEW BUILD
                                    (SKILL.md step 5) and apply the winning order.
reference/
  uk-tax-data.json                ← machine-readable tax rules THE ENGINE CALCULATES WITH
  uk-tax-legislation.md           ← same figures, human-readable, with gov.uk sources
  cii-financial-planning-foundations.md  ← CII methodology the skill follows
clients/<name>/client-data.json + plan.html   ← LOCAL ONLY (git-ignored)
```

`plan-template.html` is a single file by design (privacy: zero network calls except
Google Fonts, which sends no data and falls back offline). Structure inside it:
CSS tokens (Let's Model it ledger brand: paper #FBF8F2 / ink #17140F,
green #1E4D3B + rust #A63B20 accents, hairline rules, square corners, Fraunces +
IBM Plex Mono; print also light) → HTML panes (one per tab)
→ JS: helpers → tax engine (`taxCore`) → what-if templates/compiler → projection
engine (`runProjection`) → chart library (`renderStackedChart`) → per-tab renderers
→ exports/PDF report → boot.

Data placeholders `/*__CLIENT_DATA__*/{}` and `/*__TAX_DATA__*/{}` and the strings
`__TAX_YEAR__` / `__BUILD_DATE__` are replaced by `build_plan.py` — never remove them.

## Engine invariants

- One projection per state change: `recompute()` runs baseline (no events) +
  scenario (enabled events) and re-renders every tab. All views read `state.proj`.
- Tax is per person per year via `taxCore` (income tax incl. PA taper, property
  stream with dedicated 22/42/47 rates from 2027/28, savings starting rate + PSA,
  dividends, NI). Amounts are ANNUAL; rates are decimals in JSON, percentages in
  most event params (divide by 100 at the boundary — check which side you're on).
- Asset `growthRate` is GROSS; `annualFeePct` is deducted in `assetGrowthFor`.
- Year indexes: `i` = years since plan start. Event fields of type `year` are
  selects (safe); raw-number year fields must accept calendar years too
  (`> 1000 → value − startYear`) — a user typing "2060" must never be a silent no-op.
- Money leaving/entering must be visible: sales/windfalls → `saleProceeds`/lumps →
  "One-off in/out"; withdrawals → `assetOut` + `withdrawals`; company flows →
  dividends through `perPerson` (so they get taxed) — never credit household cash
  without routing through income or lumps.
- What-if assets get ids `evt-btl-*` / `evt-prop-*` / `biz-*`; name/colour lookups
  for them live in `assetSeries` and `ihtForRow` — extend those when adding a new
  event that creates assets.

## Charts

Follow the dataviz conventions already in the file: stacked bars with per-column
`<g class="col">` (Voyant hover lift), 8 series slots `--s1..--s8` (validated
palette — don't invent hues), same-class assets share a hue with stepped opacity,
one axis only, tooltips list every series. `cfg.tooltipRows(i)` overrides the
default tooltip (see the IHT chart).

## Build & verify (do this every change)

```bash
# 1. syntax-check the embedded JS (fast, catches most slips)
node -e "const h=require('fs').readFileSync('.claude/skills/financial-plan/templates/plan-template.html','utf8');new Function(h.split('<script>')[1].split('</script>')[0].replace(/const CLIENT = .*/,'const CLIENT={};').replace(/const TAX = .*/,'const TAX={};'));console.log('ok')"
# 2. rebuild the working test plan
python3 .claude/skills/financial-plan/scripts/build_plan.py clients/testvincent/client-data.json
# 3. headless verification (playwright-core + /opt/pw-browsers/chromium):
#    load the plan file://, capture pageerror, page.evaluate() against `state.proj`
#    to assert figures, screenshot changed tabs and LOOK at them.
```

Verify tax/engine changes **by hand to the pound** against a manual calculation
before claiming them correct — every figure in this codebase so far has been
validated that way, and regressions are checked by re-asserting year-0 tax
(James: IT £19,960 / NI £3,731 on the Smith test data) stays unchanged unless
the change is meant to move it.

## Updating for a new tax year / Budget

Research figures online (gov.uk first; the egress proxy blocks some domains —
cross-verify via ICAEW/Deloitte/Commons Library and say so), update BOTH
`reference/uk-tax-legislation.md` (sources + access dates) and
`reference/uk-tax-data.json` (`taxYear`, `compiled`, figures), then rebuild plans.
Announced-but-future rules (e.g. pensions in IHT from 2027, savings/property rates,
cash-ISA cap) belong in the engine with a start year, not in prose only.

## Conventions

- Branch: work on `claude/financial-planning-tool-t1c3nk`; commit with clear
  messages; push after each verified feature. `git status` must never show
  anything under `clients/`.
- Keep `SKILL.md`'s approximations section honest — every simplification the
  engine makes is listed there; add yours.
- UK spellings and plain English in all client-facing text; every educational
  page ends with an education-not-advice note. The PDF report always prints light.
- After each delivered change: rebuild the test plan and send it to the user with
  `SendUserFile` (attach, not render).

## Known limits (v1)

Scottish income tax bands, student loans, pension annual-allowance charges,
IHT deduction inside death what-ifs, BPR/APR, CT marginal relief, and the
S24-credit-at-22% question are not modelled — flag rather than guess.
