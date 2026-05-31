# Roadmap

## Active Milestone

**M4: Phase 2b — MD Migration + Enforcement**
Status: in_progress (STEP 6 plans written; awaiting approval → execute)
Goal: `cmap migrate` (repo-scale scaffold + baseline + coverage) + `cmap lint` MANDATORY CI gate blocking NEW doc debt (baseline-grandfather rollout; waiver + accept escape hatches). Re-grounded vs read-only MD (tool never writes MD). Spec `docs/specs/2026-05-31-phase2b-md-migration-enforcement-design.md`; plans `.planning/phase2b-{1..5}-PLAN.md`.

## Completed Milestones

| Milestone | Completed | Summary |
|---|---|---|
| M1: Phase 0 — POC Validation | 2026-05-29 | GO — ts-morph + @angular/compiler@19 validated for component/routing/template parsing; throwaway POC in `poc/`, FEASIBILITY-REPORT.md = GO. See `.planning/phase0-SUMMARY.md`. |
| M2: Phase 1 — Static Analysis Core | 2026-05-31 | Shipped — `tool/` package: indexer (STND-01) + routes (lazy stitch) + edges (double-count fix) + graph + cache + query (impact + UI access path) + MdIndex + `cmap` CLI/HTML. 78 tests, 97.6% cov, accuracy 19/19 on real v15. See `.planning/phase1-SUMMARY.md`. |
| M3: Phase 2a + 2.5 — MD Overrides + PR Bot | 2026-05-31 | Shipped — tool-owned `.cmap.yaml` overrides (scaffolded, fill `target`) patch dynamic-dep gaps → `via:'override'` edges; `cmap gaps`/`pr`; PR-bot GitHub Action (sticky comment). 110 tests, 98% cov. Manual UAT deferred. See `.planning/phase2-SUMMARY.md`. |

## Planned Milestones

| Milestone | Goal | Priority |
|---|---|---|
| M5: Phase 3 — Renderer & UX | Mermaid + standalone HTML report + CLI UX | medium |
| M6: Phase 4 — Long-term Maintenance | Quarterly audit job, Angular upgrade buffer, schema evolution | low |

## Last updated

2026-05-31
