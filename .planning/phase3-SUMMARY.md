# M5 — Phase 3 (Renderer & UX): Summary

**Milestone:** M5 — Renderer & UX
**Date:** 2026-05-31
**Branch:** feature/phase3-renderer-ux-2026-05-31 → merged to master
**Outcome:** ✅ **Shipped** — two offline single-file HTML views: an interactive Mermaid neighborhood diagram per `cmap query`, and a searchable/pannable whole-graph overview via `cmap render`. (Manual UAT deferred; verification + final review passed.)

## What shipped

Built on M2's `cmap query --html` preview:

- **Focused subgraph** (`render/subgraph.ts`): `focusedSubgraph(graph, id)` → target + impact ancestors (+ any direct dynamic predecessor) + immediate forward children + one route-entry node per UI access path; each edge carries a `dynamic` flag.
- **Mermaid serialization** (`render/mermaid.ts`): `toMermaid(sub)` → a deterministic `flowchart TD` (sanitized ids, per-kind `classDef`, `-->` static / `-.->` dynamic).
- **Query report enhancement** (`cli/html.ts` + `render/assets.ts`): `cmap query --html` now embeds the Mermaid subgraph with the Mermaid runtime **inlined** (offline single-file) + hover tooltips (file·selector via SVG `<title>`); existing meta/images/impact/access-path sections unchanged. New `HtmlData` fields are optional (back-compatible).
- **Whole-graph SVG** (`render/svg.ts`): `wholeGraphSvg(graph)` → hand-rolled layered SVG (all components, resolved edges) with stable `data-id`/`data-from`/`data-to` hooks.
- **Whole-graph page** (`cli/render-html.ts`): `renderWholeHtml(graph)` → offline page with search/filter, pan/zoom, click-highlight + a meta side panel.
- **CLI** (`cli/index.ts`): `query --html` wires the subgraph; new `cmap render --html <file>` (prints component/edge counts; guards missing `--html`).
- **Dep:** `mermaid` added — used **only** as an inlined client runtime (file-read in `assets.ts`), never imported/executed in the analysis pipeline.

## Requirements (M5)

| REQ-ID | Status |
|---|---|
| RND-01 focusedSubgraph · RND-02 toMermaid | ✅ |
| RND-03 query --html Mermaid (offline) + tooltips · RND-04 wholeGraphSvg | ✅ |
| RND-05 whole-graph interactivity · RND-06 cmap render | ✅ |

## Verification

- **146 tests / 41 files**, `tsc --noEmit` clean, coverage **98.25% lines / 89.19% branch / 98.55% func / 98.25% stmt** (gate ≥80%).
- **End-to-end on real Angular 15**: `query DataTableComponent --html` embeds a `flowchart TD` neighborhood; `render --html` emits an SVG covering all 18 components.
- **Goal-backward verification:** PASS (6/6 REQ — `phase3-VERIFICATION.md`).
- **Final holistic review (opus):** APPROVED — 0 Critical / 0 Important. Verified the **offline guarantee against the real 3.3 MB Mermaid bundle** (no CDN/fetch reached by flowchart init), no analysis-pipeline contamination, purely additive diff (only deletion = USAGE string), deterministic output.
- **Manual UAT: deferred** — checklist in `.planning/phase3-UAT.md` (requires opening the HTML offline in a browser).

## Key design decisions

- Surface = **offline single-file HTML** (no VSCode/CLI-ASCII — the "don't build all 3" decision).
- **Mermaid** for the focused subgraph (inlined ~3 MB/report; client-side only) + **hand-rolled SVG** for the whole-graph overview (perf/size control).
- Whole-graph layout is a **modest** relaxation-BFS layering (cycle-safe; under-assigns depth on diamonds — acceptable; readability via search/pan-zoom, not auto-layout).
- Read-focused interactivity; no cross-file navigation (single-file constraint).
- No Phase -1 UX research existed (greenfield) → UX decided in the M5 brainstorm.

## Carry to M6 (Phase 4) / backlog

- QA suggestions: `esc()` the meta-panel `innerHTML` values + escape `</script>` in JSON-into-`<script>` (both theoretical — Angular classNames/posix filePaths can't contain HTML metachars); Set-based `pushEdge` dedup; share the `SHAPE` lambda; whole-graph node-count guard for very large graphs.
- **UAT debt:** run `phase3-UAT.md` + the still-pending `phase2-UAT.md` (M3) / `phase2b-UAT.md` (M4) against a real Angular repo; commit a `.cmap-baseline.json` before enabling the M4 CI lint gate in production.
- **M6 — Phase 4:** quarterly audit job, Angular-upgrade buffer, schema evolution.

## Decision

M5 (Renderer & UX) is **complete and shipped**. Next: **M6 — Phase 4 (Long-term Maintenance)** when ready.
