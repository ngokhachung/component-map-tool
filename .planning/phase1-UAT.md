# Phase 1 — UAT (User Acceptance Test)

**Milestone:** M2 — Phase 1 (Static Analysis Core) · **Date:** 2026-05-31
**Branch:** feature/phase1-static-analysis-2026-05-30
**How:** run each command, compare to "Expected", then confirm or describe any difference. (AI does not mark Phase 1 done until you confirm.)

All commands run from the `tool/` directory: `cd tool` first. One-time: `npm install` (already done).

---

## 1. Automated tests + coverage
```
npm run test:cov
```
**Expected:** 76 tests pass (21 files); coverage ~96% lines / 88% branch / 99% func; exit 0.

## 2. Build index on the real Angular 15 sample
```
npm run cmap -- index --root ../poc/real-sample/src
```
**Expected:** JSON summary like `{ "components": 18, "edges": 28, "routes": 2, "parseErrorComponents": 0, "mdWarnings": 0, "fromCache": false }`. Re-running shows `"fromCache": true`. Writes `tool/.cmap/graph.json` + `manifest.json`.

## 3. Impact query (who is affected if I change this component)
```
npm run cmap -- query app-data-table --root ../poc/real-sample/src
```
**Expected:** JSON with `component.id = "DataTableComponent"`, `standalone:false`, an `impact.ancestors` list (e.g. InvoiceListPage, ReportDashboardPage, InvoiceManagementComponent…), `impact.uncertain: true` (dynamic deps exist), and `accessPaths` including `finance/invoices` and `finance/reports`.

## 4. UI access path for a page/feature component
```
npm run cmap -- query InvoiceManagementComponent --root ../poc/real-sample/src
```
**Expected:** `accessPaths` reaching `finance/invoices` with a `componentChain` like `InvoiceListPage › InvoiceManagementComponent`; impact ancestors include `InvoiceListPage`.

## 5. Locator flexibility (same component, 3 ways)
```
npm run cmap -- query DataTableComponent      --root ../poc/real-sample/src
npm run cmap -- query data-table.component.ts --root ../poc/real-sample/src
npm run cmap -- query app-data-table          --root ../poc/real-sample/src
```
**Expected:** all three resolve to the same `DataTableComponent`. A bad locator (`npm run cmap -- query Nope --root ../poc/real-sample/src`) prints "no component found" and exits non-zero.

## 6. HTML preview (image-display ask)
```
npm run cmap -- query app-data-table --root ../poc/real-sample/src --html preview.html
```
**Expected:** writes `tool/preview.html` — open it in a browser; it's a single self-contained page showing the component, its impact ancestors, and UI access paths. (Images appear only when run with `--docs <your real docs folder>` whose MD source paths match the code; the sample `C000011` doc points elsewhere, so it won't link here — that's expected.)

## 7. componentId via MD (optional, needs matching docs)
`cmap query <componentId>` works once you point `--docs` at your real component-doc folder whose `## ソースパス` paths match the analyzed code. On `poc/real-sample` the only MD (`C000011`) is a format sample for a different component, so `--docs ../docs/components` will emit an orphan warning — expected.

---

## Confirm
Please reply with one of:
- **"confirmed"** — behavior matches; proceed to QA Gate (STEP 9) + ship.
- **describe any difference** — what you ran, expected vs actual; AI infers severity and fixes (back to STEP 7) before proceeding.

(Goal-backward verification already PASS — see `phase1-VERIFICATION.md`: all 13 REQ-IDs covered, accuracy 19/19 on real v15.)
