# M4 — Phase 2b: Goal-Backward Verification

**Milestone:** M4 — MD Migration + Enforcement · **Date:** 2026-05-31
**Branch:** feature/phase2b-md-migration-enforcement-2026-05-31
**Method:** cross-reference each plan's `must_haves` (observable truths / artifacts / key links) + each REQ-ID against the shipped implementation + tests.

---

## REQ coverage (7/7)

| REQ-ID | Requirement | Implementation | Test evidence | ✔ |
|---|---|---|---|---|
| MIG-01 | `cmap migrate` bulk-scaffolds `.cmap.yaml` for gap-components with a componentId | `cli/migrate.ts` `migrate()` calls `scaffoldGaps` (M3) repo-wide; CLI `migrate` branch in `cli/index.ts` | `migrate.test.ts`, `migrate-lint-cli.test.ts` (writes override dir) | ✅ |
| MIG-02 | `.cmap-baseline.json` snapshot of debt, keyed by repo-relative filePath | `cli/baseline.ts` (`BaselineFile`, read/write/`acceptInto`); `migrate()` snapshots `computeIssues` | `baseline.test.ts` (4), `migrate.test.ts` (baseline == computeIssues) | ✅ |
| MIG-03 | Coverage report (md+json) + missing-MD list | `migrate.ts` `computeCoverage`/`renderCoverageMd`; writes `.md`+`.json` | `migrate.test.ts` (coverage math + both files exist) | ✅ |
| ENF-01 | `cmap lint --changed --baseline` blocks ①②③ + regression, warns ④, exit≠0 + fix messages | `cli/lint.ts` (`computeIssues`/`lintChanged`/`renderLint`); CLI `lint` branch (code 1 when not ok) | `lint.test.ts` (6: new debt, grandfather, regression, unchanged-ignored, stale-warn), `migrate-lint-cli.test.ts` (exit 1→0) | ✅ |
| ENF-02 | Waiver: `waived` in schema; gaps + merge treat as covered | `schema.ts` `DynamicDep.waived?`; `gaps.coveredReasons`; `merge.applyOverrides` skip | `waiver.test.ts` (3), `lint-integration.test.ts` (real waiver closes gap) | ✅ |
| ENF-03 | `cmap lint --accept` records current violations into baseline | CLI `lint --accept` branch → `acceptInto` + `writeBaseline` | `migrate-lint-cli.test.ts` (accept → code 0), `lint-integration.test.ts` (accept grandfathers) | ✅ |
| ENF-04 | Wire `cmap lint` into M3 PR workflow as fail-able step, M3 hardening kept | `.github/workflows/component-map-pr.yml` lint step after comment, env-routed | `workflow-lint.test.ts` (3: lint+baseline, env not `${{}}`, no `pull_request_target`) | ✅ |

## must_haves — per plan

- **Plan 1 (waiver):** validate accepts waived ✅; findGaps excludes waived ✅; applyOverrides no edge/warning ✅; existing v1 files unaffected (no version bump) ✅; suite+tsc clean ✅.
- **Plan 2 (baseline+lint):** readBaseline missing→empty + roundtrip + deterministic ✅; newViolations only-unseen ✅; acceptInto union ✅; computeIssues 3 code families ✅; lintChanged block/grandfather/regression/ignore-unchanged/stale-warn ✅.
- **Plan 3 (migrate):** computeCoverage totals/needingDoc/documented/missingMd ✅; migrate writes baseline==computeIssues + coverage md/json ✅; all-missing-MD → withMd 0 ✅.
- **Plan 4 (CLI+CI):** lint exit 1→accept→0→grandfathered ✅; migrate writes baseline+coverage exit 0 ✅; workflow lint step env-routed, comment intact, no `_target` ✅.
- **Plan 5 (integration+coverage):** real-sample missing-md grandfather ✅; real `ngComponentOutlet` gap closed by waiver ✅; ≥80% coverage gate ✅.

## End-to-end coherence (final review, opus)

- `migrate` and `lint` share the **single** `computeIssues` → baseline codes are byte-identical to lint-diff codes ⇒ grandfathering cannot silently break. ✅
- Waiver honored in `findGaps` + `computeIssues` + `applyOverrides` consistently. ✅
- Security: workflow `on: pull_request` (not `_target`); `$CHANGED_FILES` via env (no `${{ }}` in run). ✅
- No regression: index/query/gaps/pr unchanged; `OVERRIDE_SCHEMA_VERSION` unbumped (additive `waived?`). ✅

## Metrics

- **132 tests** / 35 files green. `tsc --noEmit` clean.
- Coverage **98.28% lines / 89.13% branch / 100% func / 98.28% stmt** (gate ≥80%).

## Open items (carried to QA / rollout, non-blocking)

- **Important (mitigated):** baseline keys are relative to `--root`; `migrate` (local) and CI `cmap lint` must use the same root → fail-*safe* (over-blocks). Documented in workflow comment + migrate output (commit after 2f6c894).
- Suggestions (QA backlog): share construct-filter between `migrate.ts` and `gaps.ts`; `=== null` guard consistency in `computeIssues`; guard `.md`→`.json` no-op; baseline schemaVersion migration when v2 lands; add combined missing-md+gap unit test.

## Verdict

**PASS — 7/7 REQ implemented and verified on real Angular 15 source; final holistic review APPROVED.**
