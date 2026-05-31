# M5 — Phase 3: Goal-Backward Verification

**Milestone:** M5 — Renderer & UX · **Date:** 2026-05-31
**Branch:** feature/phase3-renderer-ux-2026-05-31
**Method:** cross-reference each plan's `must_haves` + each REQ-ID against the shipped implementation + tests.

---

## REQ coverage (6/6)

| REQ-ID | Requirement | Implementation | Test evidence | ✔ |
|---|---|---|---|---|
| RND-01 | `focusedSubgraph(graph,id)` — target+ancestors(+direct dynamic predecessor)+children+route nodes, per-edge dynamic flag | `render/subgraph.ts` | `subgraph.test.ts` (kinds, dynamic edges, route wiring, title) | ✅ |
| RND-02 | `toMermaid(subgraph)` — flowchart def, sanitized ids, dashed dynamic, classDef, deterministic | `render/mermaid.ts` | `mermaid.test.ts` | ✅ |
| RND-03 | `cmap query --html` embeds Mermaid subgraph (runtime inlined, offline) + hover tooltips; existing sections kept | `cli/html.ts` (optional fields + graph section) + `render/assets.ts` (`mermaidRuntime`) + `cli/index.ts` wiring | `html-graph.test.ts`, `render-integration.test.ts` (real-sample query embeds `flowchart TD`) | ✅ |
| RND-04 | `wholeGraphSvg(graph)` — hand-rolled SVG, all components, resolved edges, modest layout, `data-*` hooks | `render/svg.ts` | `svg.test.ts` (node-per-component, resolved-only edges, layering) | ✅ |
| RND-05 | Whole-graph interactivity — search/filter + pan/zoom + click-highlight + meta panel (inlined JS) | `cli/render-html.ts` | `render-html.test.ts` (markers) | ✅ |
| RND-06 | `cmap render --html <file>` — whole-graph offline single-file; prints counts; guard without `--html` | `cli/index.ts` render branch | `render-integration.test.ts` (svg page ≥18 nodes; no-`--html` → exit 1) | ✅ |

## must_haves — per plan

- **Plan 1 (subgraph+mermaid):** node kinds + dynamic edges + title ✅; flowchart def, dashed dynamic, sanitized ids, deterministic ✅.
- **Plan 2 (svg):** one node/component + viewBox ✅; resolved-only `<line data-from/to>` ✅; left-to-right layering + deterministic ✅.
- **Plan 3 (html+render-html):** mermaid section + inlined runtime + CMAP_TIP, back-compatible ✅; `mermaidRuntime()` non-empty ✅; whole-graph page with svg + search + META + interactivity, offline ✅.
- **Plan 4 (CLI+integration):** query --html embeds flowchart for the queried component ✅; `cmap render --html` writes svg page covering all components + counts ✅; render w/o --html exits 1 ✅; coverage ≥80% ✅.

## End-to-end coherence (final review, opus)

- query path `focusedSubgraph → toMermaid → renderHtml(tips + inlined runtime)`; render path `wholeGraphSvg → renderWholeHtml`. Cross-module keys line up: `tips` keyed by node label ↔ tooltip init reads label; svg `data-id/data-from/data-to` ↔ render-html JS. ✅
- **Offline guarantee verified against the actual 3.3 MB Mermaid bundle** — no CDN/fetch/font network reached by `initialize()`+`run()` on a `flowchart`; only `http://www.w3.org/...` SVG namespace literal (not a fetch). ✅
- **No analysis-pipeline contamination:** `import 'mermaid'` nowhere; mermaid enters only as a file read in `assets.ts`, emitted as an inert client `<script>`. ✅
- **No regression:** index/query(JSON)/gaps/pr/migrate/lint byte-for-byte unchanged; only deletion is the USAGE string (to add `render`). SCHEMA_VERSION untouched. ✅
- **Determinism:** mermaid sorted (kind,id)/(from,to); svg sorted by id into layers → diff-stable reports. ✅

## Metrics

- **146 tests / 41 files** green. `tsc --noEmit` clean.
- Coverage **98.25% lines / 89.19% branch / 98.55% func / 98.25% stmt** (gate ≥80%).

## Open items (QA backlog / out-of-scope, non-blocking)

- Suggestions: `esc()` the META values in render-html's meta-panel `innerHTML` + escape `</script>` in JSON-into-`<script>` (both theoretical — Angular classNames/posix filePaths can't contain HTML metachars); Set-based `pushEdge` dedup; share `SHAPE` lambda; whole-graph node-count guard for very large graphs; `render` doesn't embed images (by design).
- Layering is a relaxation-BFS (under-assigns depth on diamonds) — acceptable for the modest overview; comment corrected in code.

## Verdict

**PASS — 6/6 REQ implemented and verified on real Angular 15 source; final holistic review APPROVED (0 Critical/Important).**
