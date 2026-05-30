# Roadmap

## Active Milestone

**M3: Phase 2a + 2.5 — MD Schema + PR Bot**
Status: not_started
Goal: Optional MD UI-access schema + tolerant full parser (builds on Phase 1 `MdIndex`), merge into the graph, and an early-value PR bot commenting affected parents/routes on component-file changes. Carry-forward in `.planning/phase1-SUMMARY.md`.

## Completed Milestones

| Milestone | Completed | Summary |
|---|---|---|
| M1: Phase 0 — POC Validation | 2026-05-29 | GO — ts-morph + @angular/compiler@19 validated for component/routing/template parsing; throwaway POC in `poc/`, FEASIBILITY-REPORT.md = GO. See `.planning/phase0-SUMMARY.md`. |
| M2: Phase 1 — Static Analysis Core | 2026-05-31 | Shipped — `tool/` package: indexer (STND-01) + routes (lazy stitch) + edges (double-count fix) + graph + cache + query (impact + UI access path) + MdIndex + `cmap` CLI/HTML. 78 tests, 97.6% cov, accuracy 19/19 on real v15. See `.planning/phase1-SUMMARY.md`. |

## Planned Milestones

| Milestone | Goal | Priority |
|---|---|---|
| M4: Phase 2b — MD Migration + Enforcement | Auto-generate skeleton MD for all components; mandatory CI linter | medium |
| M5: Phase 3 — Renderer & UX | Mermaid + standalone HTML report + CLI UX | medium |
| M6: Phase 4 — Long-term Maintenance | Quarterly audit job, Angular upgrade buffer, schema evolution | low |

## Last updated

2026-05-31
