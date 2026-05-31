# M6 (Phase 4) — UAT

**Milestone:** M6 — Long-term Maintenance · **Date:** 2026-05-31
**Branch:** feature/phase4-maintenance-2026-05-31
Run from `tool/` (`cd tool`; or `npm --prefix tool ...`). AI does not mark M6 done until you confirm.

---

## 1. Tests + coverage
```
npm run test:cov
```
**Expected:** 161 tests pass (45 files); coverage ≈98% lines / 89% branch; exit 0.

## 2. Typecheck
```
npx tsc --noEmit
```
**Expected:** no output (clean).

## 3. `cmap audit` — maintenance report (stdout)
```
npm run cmap -- audit --root ../poc/real-sample/src
```
**Expected:** a markdown report with `# Component Map — Audit` and `## Stale docs` / `## Coverage` / `## Orphans` / `## Open gaps`. On real-sample (no project MD): Coverage shows `With project MD: 0 / 18`; Open gaps lists the dynamic-construct components (e.g. ReportDashboardPage `ngComponentOutlet`); Stale = none (no docs). Exit 0.

## 4. `cmap audit --report` — files
```
npm run cmap -- audit --root ../poc/real-sample/src --report ../poc/real-sample/audit
```
**Expected:** prints `wrote …/audit.md + …/audit.json (…)`; both files exist; `audit.json` has `coverage.withMd: 0` and a `gaps` array. (Clean up the two files after.)

## 5. Git-based staleness (the new signal) — run against a repo WITH project MD
On a real Angular repo where components have linked MD docs (or override `.cmap.yaml`), staleness fires when a **component file was committed more recently than its doc**:
```
cmap audit --root <src> --docs <docs-dir> --overrides <override-dir>
```
**Expected:** the `## Stale docs` section lists components whose `.ts` is newer (by git last-commit-time) than their MD / `.cmap.yaml`. (real-sample has no MD, so this is verified there only via the unit tests `src/audit/report.test.ts`; confirm on a real repo.)

## 6. Azure Pipelines (open the YAMLs)
- `azure-pipelines-pr.yml` — on PRs touching `*.component.ts`: posts a sticky PR-thread comment + runs a fail-able `cmap lint` gate. **Prereqs:** enable "Allow scripts to access the OAuth token"; grant the build service "Contribute to pull requests"; add as a **Build Validation** branch policy. Adapt `CMAP_ROOT/CMAP_DOCS/CMAP_OVERRIDES`.
- `azure-pipelines-audit.yml` — quarterly cron → `cmap audit` → build summary + artifact.
- The GitHub workflow `.github/workflows/component-map-pr.yml` has been **removed** (Azure-only).
> Live Azure behavior (PR comment posting via REST) is text-validated in tests; verify it for real on a first PR in your Azure DevOps project.

## 7. Docs
Open `docs/COMPATIBILITY.md`, `docs/SCHEMA.md`, `CHANGELOG.md`, `docs/accuracy-sampling-checklist.md`, and the README "CI & maintenance" section — confirm they read correctly for your team.

---

## UAT Checklist (tick when verified)

- [ ] **Tests + coverage** — `npm run test:cov` → 161 pass, ≥80% cov, exit 0.
- [ ] **Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **audit (stdout)** — `cmap audit --root ../poc/real-sample/src` → Audit md with the 4 sections; Coverage 0/18 MD; gaps listed.
- [ ] **audit --report** — writes `audit.md` + `audit.json` (coverage.withMd 0).
- [ ] **staleness on a real repo** — component newer than its doc → appears under `## Stale docs`.
- [ ] **Azure PR pipeline** — open `azure-pipelines-pr.yml`: PR trigger on `*.component.ts`, comment + fail-able lint gate, token via env, sticky marker. Configure prereqs + branch policy; verify on a first PR.
- [ ] **Azure audit pipeline** — open `azure-pipelines-audit.yml`: quarterly cron, `cmap audit`, summary + artifact.
- [ ] **GitHub workflow removed** — `.github/workflows/component-map-pr.yml` is gone.
- [ ] **Docs** — compatibility matrix / schema policy / CHANGELOG / accuracy checklist / README all read correctly.

## Confirm
When green, reply **"confirmed"** → M6 (and the planned project roadmap) is complete. Or describe any difference and AI fixes first.

> **Status: UAT DEFERRED** (user runs later, as with M2–M5). Goal-backward verification PASS (`phase4-VERIFICATION.md`, 6/6 REQ); final review Critical fixed + re-review RESOLVED. **Azure pipelines + git-staleness need live verification on a real Azure DevOps repo before production.**
