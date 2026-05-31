# M3 (Phase 2a + 2.5) — UAT

**Milestone:** M3 — MD Overrides + PR Bot · **Date:** 2026-05-31
**Branch:** feature/phase2-md-overrides-pr-bot-2026-05-31
Run from `tool/` (`cd tool`; or `npm --prefix tool ...` from the repo root — avoids the bash backslash-path issue). AI does not mark M3 done until you confirm.

---

## 1. Tests + coverage
```
npm run test:cov
```
**Expected:** 109 tests pass (28 files); coverage ~98% lines / 89% branch; exit 0.

## 2. Gap report on a codebase with dynamic deps
```
npm run cmap -- gaps --root ../poc/real-sample/src
```
**Expected:** lists components whose dynamic constructs are undocumented — e.g. `ReportDashboardPage … ngComponentOutlet`, plus the `@ViewChild`/`createComponent`/`ng-content` cases on other components. (Components with no dynamic deps don't appear.)

## 3. Scaffold the override skeletons
```
npm run cmap -- gaps --write --root ../poc/real-sample/src --docs ../docs/components --overrides ../docs/component-map
```
**Expected:** since real-sample components mostly lack a project-MD `componentId`, you'll see "has dynamic deps but no componentId … cannot scaffold" warnings (correct — scaffolding needs a componentId from MD). For a component that DOES have an MD componentId, it writes `docs/component-map/<id>.cmap.yaml` with `dynamicDeps: [{ target: "", reason: ... }]` for you to fill. (The end-to-end override→resolved flow is proven in `src/overrides/integration.test.ts`.)

## 4. Query reflects a documented override
After you create a `docs/component-map/<id>.cmap.yaml` and fill a `target`, re-run:
```
npm run cmap -- query <id> --root ../poc/real-sample/src --docs ../docs/components --overrides ../docs/component-map
```
**Expected:** the impact/access-path now include the documented dynamic target (a `via:"override"` edge); that component drops out of `cmap gaps`.

## 5. PR comment preview (what the bot posts)
```
npm run cmap -- pr --root ../poc/real-sample/src --changed app/shared/components/data-table/data-table.component.ts
```
**Expected:** a Markdown block starting with `<!-- cmap-pr-bot -->`, a section for `DataTableComponent` listing affected ancestors + UI access paths (+ any gaps), capped/uncertain-flagged. This is exactly what the GitHub Action comments on a PR.

## 6. The Action itself
`.github/workflows/component-map-pr.yml` is the PR bot. It triggers on PRs touching `*.component.ts`, builds the graph, runs `cmap pr`, and posts a sticky comment. Adapt `CMAP_ROOT/CMAP_DOCS/CMAP_OVERRIDES` (job `env`) to your real Angular repo's paths before enabling.

---

## UAT Checklist (tick when verified)

Run from `tool/` (or `npm --prefix tool ...` from repo root).

- [ ] **Tests + coverage** — `npm run test:cov` → 109 tests pass (28 files), coverage ≥80% (≈98%/89%), exit 0.
- [ ] **Typecheck** — `npx tsc --noEmit` → no output (clean).
- [ ] **gaps lists undocumented dynamic deps** — `npm run cmap -- gaps --root ../poc/real-sample/src` → shows e.g. `ReportDashboardPage … ngComponentOutlet`, `ModalContainerComponent … createComponent / @ViewChild query`, `…ng-content`. Components with no dynamic deps are absent.
- [ ] **gaps --write scaffolds (and warns on missing componentId)** — `npm run cmap -- gaps --write --root ../poc/real-sample/src --overrides ../poc/real-sample/.cmap-test` → for componentId-less components, prints "has dynamic deps but no componentId … cannot scaffold"; (clean up `.cmap-test` after).
- [ ] **override closes a gap (the core flow)** — create a project MD giving a component a `componentId` + a `docs/component-map/<id>.cmap.yaml` with a filled `target`, then `npm run cmap -- query <id> --docs … --overrides …` → impact/access-path includes the documented target (a `via:"override"` edge); that component no longer appears in `cmap gaps`. (This is auto-proven in `tool/src/overrides/integration.test.ts`.)
- [ ] **PR comment preview** — `npm run cmap -- pr --root ../poc/real-sample/src --changed app/shared/components/data-table/data-table.component.ts` → markdown starting with `<!-- cmap-pr-bot -->`, a `DataTableComponent` section with affected ancestors + UI access paths, capped/uncertain-flagged.
- [ ] **PR comment: no-match** — `npm run cmap -- pr --root ../poc/real-sample/src --changed nope/none.ts` → marker + "_No mapped component changes._".
- [ ] **Workflow sanity** — open `.github/workflows/component-map-pr.yml`: triggers on `pull_request` (paths `**/*.component.ts`), `permissions: pull-requests: write`, `concurrency`, `fetch-depth: 0`, runs `cmap -- pr`, posts via `actions/github-script`, no `pull_request_target`. Adapt `CMAP_ROOT/CMAP_DOCS/CMAP_OVERRIDES` to your real repo before enabling.

## Confirm
When the checklist is green, reply **"confirmed"** → proceed to STEP 9 QA Gate + ship (merge to master). Or describe any difference (command + expected vs actual) and AI fixes before proceeding.

> **Status: UAT DEFERRED** (user will run later). Code pushed + demo branch `demo/5-phase2-md-overrides-pr-bot` created. Goal-backward verification already PASS (`phase2-VERIFICATION.md`).

(Goal-backward verification already PASS — see `phase2-VERIFICATION.md`: 7/7 REQ, override flow proven on real v15.)
