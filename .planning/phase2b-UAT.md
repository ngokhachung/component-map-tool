# M4 (Phase 2b) — UAT

**Milestone:** M4 — MD Migration + Enforcement · **Date:** 2026-05-31
**Branch:** feature/phase2b-md-migration-enforcement-2026-05-31
Run from `tool/` (`cd tool`; or `npm --prefix tool ...` from repo root). AI does not mark M4 done until you confirm.

---

## 1. Tests + coverage
```
npm run test:cov
```
**Expected:** 132 tests pass (35 files); coverage ≈98% lines / 89% branch / 100% func; exit 0.

## 2. Typecheck
```
npx tsc --noEmit
```
**Expected:** no output (clean).

## 3. `cmap migrate` — prepare a repo for enforcement
```
npm run cmap -- migrate --root ../poc/real-sample/src --overrides ../poc/real-sample/.cmap-test --baseline ../poc/real-sample/.cmap-baseline.json --coverage ../poc/real-sample/cmap-coverage.md
```
**Expected:** `migrate complete:` — scaffolds `.cmap.yaml` for componentId-bearing gap components (real-sample has none with a project MD → 0 scaffolded + "no componentId" warnings, correct); writes `.cmap-baseline.json` (every component carries `missing-md`, ReportDashboardPage also `gap:ngComponentOutlet`) and `cmap-coverage.md` + `.json` (0/18 have MD). Note line reminds baseline keys are relative to `--root`. (Clean up the three generated paths after.)

## 4. `cmap lint` — gate blocks NEW debt
```
npm run cmap -- lint --root ../poc/real-sample/src --changed data-table.component.ts
```
**Expected (no baseline):** exit code **1**, `✗ cmap lint: ... new documentation debt` listing `data-table.component.ts → missing-md`, plus the fix-path hint.

## 5. Grandfather via baseline
```
npm run cmap -- lint --root ../poc/real-sample/src --changed data-table.component.ts --accept --baseline ../poc/real-sample/.cmap-baseline.json
npm run cmap -- lint --root ../poc/real-sample/src --changed data-table.component.ts --baseline ../poc/real-sample/.cmap-baseline.json
```
**Expected:** first (`--accept`) writes the baseline → `accepted N component(s)`; second exits **0** (`✓ no new documentation debt`). (Clean up the baseline file after.)

## 6. Waiver closes a gap (the escape hatch)
Proven automatically in `src/cli/lint-integration.test.ts`: a real `ngComponentOutlet` gap on ReportDashboardPage is removed from `cmap gaps`/lint once a `.cmap.yaml` entry sets `waived: true` for that construct.

## 7. The CI gate
`.github/workflows/component-map-pr.yml` now has a fail-able **lint gate** step after the comment step: it runs `cmap lint --changed "$CHANGED_FILES" --baseline .cmap-baseline.json` (CHANGED_FILES via env). The PR comment posts first; the gate then blocks merge on new debt. Adapt `CMAP_ROOT/CMAP_DOCS/CMAP_OVERRIDES` and commit a `.cmap-baseline.json` (from step 3, **same `--root` as CI**) before enabling.

---

## UAT Checklist (tick when verified)

- [ ] **Tests + coverage** — `npm run test:cov` → 132 pass, coverage ≥80% (≈98%/89%), exit 0.
- [ ] **Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **migrate** — writes baseline + coverage md/json + (for real-sample) "no componentId, cannot scaffold" warnings; coverage shows 0/18 MD.
- [ ] **lint blocks new debt** — `cmap lint --changed data-table.component.ts` (no baseline) → exit 1, lists `missing-md`.
- [ ] **grandfather** — `cmap lint ... --accept --baseline <p>` then re-run with `--baseline <p>` → exit 0.
- [ ] **regression** — change a real-sample `.component.ts`'s template to add an `ngComponentOutlet` (new gap), lint against the old baseline → exit 1 (clean→dirty blocks).
- [ ] **waiver** — add a `.cmap.yaml` for a gap component with `waived: true` on its construct → that component drops out of `cmap gaps` and lint passes.
- [ ] **workflow** — open `.github/workflows/component-map-pr.yml`: lint step after the github-script comment step; `--changed "$CHANGED_FILES"` via env (no `${{ }}` on that line); `--baseline .cmap-baseline.json`; no `pull_request_target`; the `CMAP_ROOT`/baseline same-root note is present.

## Confirm
When green, reply **"confirmed"** → ship. Or describe any difference (command + expected vs actual) and AI fixes first.

> **Status: UAT DEFERRED** (user runs later, as with M2/M3). Goal-backward verification already PASS (`phase2b-VERIFICATION.md`, 7/7 REQ); final holistic review APPROVED. Run this checklist against a real Angular repo before enabling the CI gate in production.
