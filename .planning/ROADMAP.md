# Roadmap

## Active Milestone

**M2: Phase 1 — Static Analysis Core**
Status: in_progress (started 2026-05-30; Wave 1 of 7 executing)
Goal: Indexer + dependency edge builder + route parser + graph store + caching; component-id → parents + UI access path query. Builds on the proven Phase 0 entry points. Carry-forward notes in `.planning/phase0-SUMMARY.md`.

## Completed Milestones

| Milestone | Completed | Summary |
|---|---|---|
| M1: Phase 0 — POC Validation | 2026-05-29 | GO — ts-morph + @angular/compiler@19 validated for component/routing/template parsing; throwaway POC in `poc/`, FEASIBILITY-REPORT.md = GO. See `.planning/phase0-SUMMARY.md`. |

## Planned Milestones

| Milestone | Goal | Priority |
|---|---|---|
| M3: Phase 2a + 2.5 — MD Schema + PR Bot | Optional MD UI-access schema, tolerant parser, early-value PR bot | high |
| M4: Phase 2b — MD Migration + Enforcement | Auto-generate skeleton MD for all components; mandatory CI linter | medium |
| M5: Phase 3 — Renderer & UX | Mermaid + standalone HTML report + CLI UX | medium |
| M6: Phase 4 — Long-term Maintenance | Quarterly audit job, Angular upgrade buffer, schema evolution | low |

## Last updated

2026-05-30
