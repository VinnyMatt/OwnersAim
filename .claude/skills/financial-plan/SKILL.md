---
name: financial-plan
description: Create or update an interactive client financial plan — a self-contained local HTML file with a personal tax table, net worth projection, lifetime cash-flow chart, what-if life events and a PDF report. Use whenever the user wants to build, refresh or amend a client's financial plan, add a client, or model their finances.
---

# Financial plan generator

You are helping a UK financial-planning professional produce an **interactive, Voyant-style
lifetime cash-flow plan** for a client. The output is a single local HTML file built from
`templates/plan-template.html` by `scripts/build_plan.py`.

## Privacy rules (non-negotiable)

- Client data lives ONLY in `clients/<client-name>/` — this directory is git-ignored.
  **Never** commit, push, publish or transmit real client data anywhere. Never publish a
  client plan as a Claude Artifact or to any hosting; the deliverable is the local file.
- Use the minimum personal data needed. Don't echo long verbatim dumps of client data back
  into chat when a summary will do.
- The generated HTML embeds the data and runs entirely offline — tell the user to treat the
  file itself as confidential.

## Foundational references — read before modelling

1. `reference/cii-financial-planning-foundations.md` — CII Diploma / Advanced Diploma
   methodology: the planning process, assumption-setting, stress-testing, disclaimer
   standards. Follow its modelling principles.
2. `reference/uk-tax-legislation.md` — current UK tax rules with sources (human-readable).
3. `reference/uk-tax-data.json` — the same figures machine-readable; **this is what the
   engine calculates with**. If the user mentions a Budget/new tax year, offer to re-verify
   these files online and update both before building.

## Workflow for a new client

1. **Gather the facts** conversationally (a fact-find, per the CII process). You need:
   - People: names, dates of birth, intended retirement age, State Pension age; children's
     birth years and whether child benefit is claimed.
   - Income per person: salary/self-employment (gross), dividends, rental, DB pensions
     (amount + start age).
   - Expenditure: the user has a separate bank-statement tool and will paste its
     categorised output into chat — map its categories into expenditure rows
     (essential / lifestyle / one-off). If nothing is pasted, ask for rough monthly
     essential + lifestyle figures.
   - Assets: cash, ISAs, GIAs, pensions (with member/employer contribution % and the salary
     they're linked to), property. Current value + any bespoke growth rate the user wants.
   - Liabilities: mortgages/loans — balance, rate, annual payment.
   - Assumptions: default inflation 2.5%, wage growth 3.5%, growth per asset class
     (cash ~3.5%, invested ~5%, property ~3%) unless the user specifies otherwise. State
     the assumptions you've used and invite correction.
2. **Populate the data file**: copy `templates/client-data.template.json` to
   `clients/<client-name>/client-data.json` and fill it in. Delete unused template entries
   and every `_`-prefixed helper key you don't need (the build strips them anyway).
   Amounts are ANNUAL. Use `null` growthRate to inherit global assumptions.
3. **Build**: `python3 .claude/skills/financial-plan/scripts/build_plan.py clients/<client-name>/client-data.json`
   — it validates the data (fix any reported problems) and writes `plan.html` next to it.
4. **Sanity-check the output**: reopen the numbers — does year-1 tax look right for the
   salary? Does retirement income switch on at the right age? If anything looks wrong,
   fix the data or report the discrepancy honestly.
5. **Hand over**: tell the user where the file is, that it opens in any browser, that
   "PDF report" prints all charts/tables, and that "Save data" exports edits made live
   (assumption tweaks, what-if events) back to JSON — offer to merge a saved JSON back
   into `client-data.json` when they return.

## Updating an existing client

Load `clients/<client-name>/client-data.json` (or a JSON the user saved from the plan UI),
apply the changes discussed, rebuild. Never regenerate from scratch if a data file exists —
you'd lose their saved events and overrides.

## What the generated plan itself can do (don't rebuild for these)

Live in the browser: change global/per-year inflation, wage growth and per-asset growth;
add/edit/toggle what-if life events (retirement age, salary changes, career breaks, property
purchase/sale, windfalls, school fees, gifts, death of a partner, redundancy, care costs,
fully custom events, mortgage overpayments); use the Debts tab's overpayment calculator
and per-mortgage offset-savings option; click any cash-flow year for its full breakdown;
view year-by-year inheritance-tax exposure (Inheritance tax tab); export CSV/JSON; print
the PDF report. Rebuild only when the underlying facts or tax rules change.

## Engine approximations (be transparent if asked)

- Ages are calendar-year approximations; the year runs as a tax year.
- Employment/SE income grows with wage growth; spending, DB pensions with inflation; the
  State Pension with a triple-lock proxy (max of 2.5%, inflation, wage growth).
- Pension contributions: net-pay treatment (deducted before income tax); NI is only saved
  when `salarySacrifice: true`. Tax relief is therefore automatic at marginal rate.
- Cash interest is taxed via the personal savings allowance; ISA growth is tax-free; GIA
  withdrawals realise a proportionate gain taxed through the CGT annual exempt amount at
  18%/24%; pension withdrawals are 25% tax-free with the rest taxed as income at the
  owner's computed marginal position (drawdown, no annuity modelling).
- Shortfalls are funded in the assumptions' withdrawal order; surpluses top up the cash
  buffer then fill ISA (respecting the annual allowance) then GIA.
- HICBC is charged on the higher earner while any child is under 18.
- The Inheritance tax tab shows year-by-year exposure (spouse exemption + transferable
  NRB/RNRB with taper, pensions in the estate from April 2027); it does NOT deduct IHT
  inside the projection on a death what-if, and gifts/trusts/BPR are not modelled.
- Scottish income tax bands, student loans and annual-allowance charges are NOT modelled
  in v1 — say so if relevant, and consult `reference/uk-tax-legislation.md` for manual
  guidance. From April 2027 savings/property income get dedicated rates — flag this for
  long plans until the engine is updated.

## Keeping tax rules current

When asked to update for a new tax year: research current gov.uk figures online, update
`reference/uk-tax-legislation.md` (with sources and access dates) and
`reference/uk-tax-data.json` (same figures, engine schema — update `taxYear` and
`compiled`), then offer to rebuild active clients' plans.
