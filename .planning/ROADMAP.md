# Roadmap

## Active Milestone

**M6: Phase 4 — Long-term Maintenance**
Status: not_started
Goal: Quarterly audit job, Angular-upgrade buffer (parser version bumps), schema evolution. Carry-forward in `.planning/phase3-SUMMARY.md`.

## Completed Milestones

| Milestone | Completed | Summary |
|---|---|---|
| M1: Phase 0 — POC Validation | 2026-05-29 | GO — ts-morph + @angular/compiler@19 validated for component/routing/template parsing; throwaway POC in `poc/`, FEASIBILITY-REPORT.md = GO. See `.planning/phase0-SUMMARY.md`. |
| M2: Phase 1 — Static Analysis Core | 2026-05-31 | Shipped — `tool/` package: indexer (STND-01) + routes (lazy stitch) + edges (double-count fix) + graph + cache + query (impact + UI access path) + MdIndex + `cmap` CLI/HTML. 78 tests, 97.6% cov, accuracy 19/19 on real v15. See `.planning/phase1-SUMMARY.md`. |
| M3: Phase 2a + 2.5 — MD Overrides + PR Bot | 2026-05-31 | Shipped — tool-owned `.cmap.yaml` overrides (scaffolded, fill `target`) patch dynamic-dep gaps → `via:'override'` edges; `cmap gaps`/`pr`; PR-bot GitHub Action (sticky comment). 110 tests, 98% cov. Manual UAT deferred. See `.planning/phase2-SUMMARY.md`. |
| M4: Phase 2b — MD Migration + Enforcement | 2026-05-31 | Shipped — `cmap migrate` (repo-scale scaffold + `.cmap-baseline.json` + coverage report) + `cmap lint` MANDATORY CI gate (blocks NEW doc debt; baseline-grandfather; `waived` + `--accept` escape hatches); fail-able lint step in PR workflow. 132 tests, 98% cov. Manual UAT deferred. See `.planning/phase2b-SUMMARY.md`. |
| M5: Phase 3 — Renderer & UX | 2026-05-31 | Shipped — `cmap query --html` embeds an offline interactive Mermaid neighborhood diagram (dashed=dynamic, hover=file); `cmap render --html` = searchable/pannable whole-graph SVG + click-highlight + meta panel. Mermaid inlined (offline, client-only). 146 tests, 98% cov. Manual UAT deferred. See `.planning/phase3-SUMMARY.md`. |

## Planned Milestones

_(none — M6 is the final planned milestone)_

## Last updated

2026-05-31 (M5 shipped)
