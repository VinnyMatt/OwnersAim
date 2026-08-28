#!/usr/bin/env node
/*
 * Tax-efficiency checker for built financial plans.
 *
 * Loads a built plan.html headlessly and re-runs the plan's OWN projection
 * engine under every withdrawal-order strategy (all 24 permutations of
 * cash/gia/isa/pension), scoring each on:
 *   1. funding      — total unfunded shortfall across the plan (must not worsen)
 *   2. net legacy   — final net worth MINUS the engine's final-year IHT exposure
 *   3. lifetime tax — total tax paid across the plan (income tax, NI, CGT,
 *                     tax on pension withdrawals)
 * Ranked by (1) asc, then (2) desc, then (3) asc. Because IHT is netted off at
 * 40%, "defer tax into the estate" and "pay a little income tax now" are traded
 * off properly rather than just minimising visible tax.
 *
 * Usage:  node tax_check.js clients/<name>/plan.html [--json]
 *
 * Read-only: it never modifies the plan file or client data — it prints a
 * report and a recommended assumptions.withdrawalOrder to apply to the client
 * data file (then rebuild). Requires playwright-core and a Chromium binary
 * (CHROME_PATH, default /opt/pw-browsers/chromium).
 */
"use strict";
const path = require("path");
const fs = require("fs");

function loadPlaywright() {
  for (const name of ["playwright-core", "playwright"]) {
    try { return require(name); } catch (e) { /* keep looking */ }
  }
  const dir = process.env.PLAYWRIGHT_CORE_DIR;
  if (dir) {
    try { return require(path.join(dir, "node_modules", "playwright-core")); } catch (e) { /* fall through */ }
  }
  console.error("playwright-core not found. `npm i playwright-core`, or set PLAYWRIGHT_CORE_DIR to a directory whose node_modules contains it.");
  process.exit(2);
}

const args = process.argv.slice(2).filter((a) => a !== "--json");
const asJson = process.argv.includes("--json");
if (args.length !== 1) {
  console.error("usage: node tax_check.js clients/<name>/plan.html [--json]");
  process.exit(2);
}
const planPath = path.resolve(args[0]);
if (!fs.existsSync(planPath)) {
  console.error("plan file not found: " + planPath);
  process.exit(2);
}

const { chromium } = loadPlaywright();

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto("file://" + planPath);
  await page.waitForFunction(() => typeof state !== "undefined" && state.proj && state.proj.length > 0);

  const result = await page.evaluate(() => {
    const perms = (xs) => xs.length <= 1 ? [xs] :
      xs.flatMap((x, i) => perms(xs.slice(0, i).concat(xs.slice(i + 1))).map((p) => [x, ...p]));
    const events = state.data.events.some((e) => e.enabled) ? state.data.events : [];
    const original = (state.data.assumptions.withdrawalOrder || ["cash", "gia", "isa", "pension"]).slice();

    const score = (order) => {
      state.data.assumptions.withdrawalOrder = order;
      const rows = runProjection(state.data, events);
      const last = rows[rows.length - 1];
      const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
      const wByType = {};
      for (const r of rows) for (const w of r.withdrawals) wByType[w.type] = (wByType[w.type] || 0) + w.amount;
      const pensionEnd = Object.entries(last.assets).reduce((s, [id, v]) => {
        const a = state.data.assets.find((x) => x.id === id);
        return s + (a && a.type === "pension" ? v : 0);
      }, 0);
      return {
        order: order.join(">"),
        shortfall: sum((r) => r.shortfall),
        shortfallYears: rows.filter((r) => r.shortfall > 0.5).length,
        lifetimeTax: sum((r) => r.taxTotal),
        finalNetWorth: last.netWorth,
        finalIHT: ihtForRow(last).iht,
        netLegacy: last.netWorth - ihtForRow(last).iht,
        pensionEnd,
        wByType,
      };
    };

    const results = perms(["cash", "gia", "isa", "pension"]).map(score);
    // restore — runProjection is pure, but the order lives on state.data
    state.data.assumptions.withdrawalOrder = original;

    const baseline = results.find((r) => r.order === original.join(">"));
    const ranked = results.slice().sort((a, b) =>
      (a.shortfall - b.shortfall) || (b.netLegacy - a.netLegacy) || (a.lifetimeTax - b.lifetimeTax));
    return { baseline, ranked, original: original.join(">"),
             planYears: state.proj.length, title: state.data.plan.title,
             surplusOrder: (state.data.assumptions.surplusOrder || []).join(">") };
  });

  await browser.close();

  if (pageErrors.length) {
    console.error("PAGE ERRORS while evaluating — results unreliable:\n" + pageErrors.join("\n"));
    process.exit(1);
  }

  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

  const gbp = (v) => "£" + Math.round(v).toLocaleString("en-GB");
  const { baseline, ranked, original } = result;
  const best = ranked[0];

  console.log(`Tax-efficiency check — ${result.title} (${result.planYears} projection years)`);
  console.log(`Current withdrawal order: ${original}\n`);
  console.log("rank | order                    | shortfall | lifetime tax | final IHT | net legacy (after IHT)");
  ranked.slice(0, 8).forEach((r, i) => {
    const mark = r.order === original ? "  ← current" : (i === 0 ? "  ← recommended" : "");
    console.log(`${String(i + 1).padStart(4)} | ${r.order.padEnd(24)} | ${gbp(r.shortfall).padStart(9)} | ${gbp(r.lifetimeTax).padStart(12)} | ${gbp(r.finalIHT).padStart(9)} | ${gbp(r.netLegacy).padStart(12)}${mark}`);
  });
  if (!ranked.slice(0, 8).some((r) => r.order === original)) {
    const bi = ranked.findIndex((r) => r.order === original);
    console.log(`${String(bi + 1).padStart(4)} | ${original.padEnd(24)} | ${gbp(baseline.shortfall).padStart(9)} | ${gbp(baseline.lifetimeTax).padStart(12)} | ${gbp(baseline.finalIHT).padStart(9)} | ${gbp(baseline.netLegacy).padStart(12)}  ← current`);
  }

  console.log("");
  if (best.order === original) {
    console.log("The current withdrawal order is already the most tax-efficient of the 24 tested.");
  } else {
    console.log(`Recommended: assumptions.withdrawalOrder = [${best.order.split(">").map((s) => `"${s}"`).join(", ")}]`);
    const cmp = (b, c) => b <= c ? `${gbp(c - b)} lower` : `${gbp(b - c)} higher (outweighed in net legacy)`;
    console.log(`vs current — net legacy ${gbp(best.netLegacy - baseline.netLegacy)} better; lifetime tax ${cmp(best.lifetimeTax, baseline.lifetimeTax)}; final IHT ${cmp(best.finalIHT, baseline.finalIHT)}.`);
    if (best.netLegacy - baseline.netLegacy < 0.001 * Math.abs(baseline.netLegacy)) {
      console.log("(The improvement is marginal — under 0.1% of the legacy. Treat orders this close as equivalent.)");
    }
    console.log("Apply it to the client data file and rebuild, or change it live on the Assumptions tab.");
  }

  // advisory notes the permutation search cannot act on
  const notes = [];
  if (best.pensionEnd > 1000 && best.finalIHT > 1000) {
    notes.push(`Even the best order leaves ${gbp(best.pensionEnd)} in pensions inside a taxable estate (pensions count for IHT from April 2027). Strategies the engine does not automate — e.g. drawing personal-allowance-sized pension income each year from 57/retirement, or gifting from surplus — may beat every order tested; model them as what-if events.`);
  }
  if ((baseline.wByType.pension || 0) < 1 && baseline.finalIHT < 1 && baseline.pensionEnd > 1000) {
    notes.push("Pensions are never drawn and there is no IHT exposure — deferral is costless here, but personal allowances in retirement go unused; small annual pension drawdowns at 0% tax would still beat this if spending ever rises.");
  }
  if (result.surplusOrder && !result.surplusOrder.startsWith("isa")) {
    notes.push(`Surplus order is ${result.surplusOrder} — sweeping surplus into ISAs first is almost always more tax-efficient; consider ["isa","gia","cash"] or a surplus plan with pension contributions.`);
  }
  if (notes.length) {
    console.log("\nAdvisory notes:");
    for (const n of notes) console.log("  • " + n);
  }
})();
