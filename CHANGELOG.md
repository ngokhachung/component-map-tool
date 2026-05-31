# Changelog

All notable changes to the Component Map Tool. Schema versions: graph=2, override=1, baseline=1.

## M6 — Phase 4: Long-term Maintenance (2026-05-31)
- `cmap audit` — git-based stale docs + coverage + override orphans + open gaps (markdown/json).
- Azure DevOps Pipelines **replace** the GitHub Actions workflow: PR pipeline (sticky comment + lint gate) + quarterly scheduled audit pipeline.
- Docs: compatibility matrix + upgrade checklist, schema-evolution policy, accuracy-sampling checklist.

## M5 — Phase 3: Renderer & UX (2026-05-31)
- `cmap query --html` embeds an offline interactive Mermaid neighborhood diagram; `cmap render --html` whole-graph SVG (search/pan-zoom/click).

## M4 — Phase 2b: MD Migration + Enforcement (2026-05-31)
- `cmap migrate` (repo-scale scaffold + `.cmap-baseline.json` + coverage); `cmap lint` mandatory gate (baseline-grandfather; `waived` + `--accept`). **baseline schema v1.**

## M3 — Phase 2a + 2.5: MD Overrides + PR Bot (2026-05-31)
- Tool-owned `.cmap.yaml` overrides → `via:'override'` edges; `cmap gaps`/`pr`; PR bot. **override schema v1; graph schema → 2** (`Edge.via`+'override', `ComponentNode.description`).

## M2 — Phase 1: Static Analysis Core (2026-05-31)
- `tool/` package: indexer (STND-01) + routes + edges + graph + cache + query + MdIndex + `cmap` CLI/HTML. **graph schema v1.**

## M1 — Phase 0: POC Validation (2026-05-29)
- ts-morph + `@angular/compiler@19` feasibility validated (GO).
