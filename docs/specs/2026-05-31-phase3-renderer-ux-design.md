# M5 — Phase 3: Renderer & UX — Design Spec

**Milestone:** M5 — Phase 3
**Date:** 2026-05-31
**Brainstorm:** 2026-05-31 (this session)
**Builds on:** M2 (`cmap query --html` single-component preview), M3 (overrides → `via:'override'` edges), M4 (no runtime dependency)
**Status:** Approved (design) — pending spec review + mode gate → writing-plans

---

## 0. Context

M2 shipped `cmap query <locator> --html <file>`: a self-contained offline HTML page for ONE component (metadata, MD images base64-embedded, impact ancestors as a text list, UI access paths as a text list). No graph *visualization*, no whole-graph view, no interactivity.

The original v2 plan (`specs/component-map-plan-v2.md`, Phase 3) said "apply UX research from Phase -1." This project started at Phase 0 (greenfield) — there is **no Phase -1 artifact**; the UX decisions are made in this brainstorm instead.

## 1. Scope (brainstorm decisions)

- **Surface:** extend the existing offline single-file HTML. NOT VSCode, NOT CLI-ASCII (the "don't build all 3" decision → HTML).
- **Two views:** (a) **focused subgraph per `cmap query`** (primary); (b) **whole-graph overview** (secondary).
- **Render tech:** **Mermaid** (inlined) for the query subgraph; **hand-rolled SVG** for the whole-graph (perf/size control; the 500-node layout is kept *modest + filterable*, not force-directed).
- **Interactivity:** read-focused. No server, no cross-file navigation (offline single-file).

## 2. Commands

- **`cmap query <locator> --html <file>`** *(enhance)* — keeps current sections (meta, images, impact list, access-path list) and adds a **"Dependency graph"** section: a Mermaid `flowchart` of the focused neighborhood — target centered, **ancestors** (impact / upstream) above, **immediate forward children** below, **route-entry** nodes for each UI access path. Dynamic/uncertain edges dashed; hover shows filePath/selector.
- **`cmap render --html <file>`** *(new)* — whole-graph overview: a hand-rolled SVG of all components + resolved edges, with a search/filter box (highlight matches, dim the rest), pan/zoom, click-node → highlight adjacent edges + show a meta side panel.

## 3. Architecture / files

**New (pure, unit-tested):**
- `tool/src/render/subgraph.ts` — `focusedSubgraph(graph, id): FocusedSubgraph` where `FocusedSubgraph = { nodes: SubNode[]; edges: SubEdge[] }`. Computes target + ancestors (reuse impact reverse-BFS *or* immediate-only — see §6) + immediate forward children + one route-entry node per access path. `SubNode = { id; label; kind: 'target'|'ancestor'|'child'|'route' }`, `SubEdge = { from; to; dynamic: boolean }`.
- `tool/src/render/mermaid.ts` — `toMermaid(sub: FocusedSubgraph): string` → a `flowchart TD` definition. Sanitizes node ids to Mermaid-safe tokens, keeps a human label, renders `dynamic` edges with the dashed `-.->` arrow and resolved edges with `-->`. Deterministic ordering.
- `tool/src/render/svg.ts` — `wholeGraphSvg(graph): { svg: string; nodes: { id: string; x: number; y: number }[] }`. Modest deterministic layout (e.g., layered by longest-path depth or grouped into columns), nodes as `<rect>`+`<text>`, resolved edges as `<line>`/`<path>`. Emits stable `data-id` attributes so the client JS can wire search/click.
- `tool/src/cli/render-html.ts` — `renderWholeHtml(graph): string`. Assembles the whole-graph page: the SVG, an inlined client `<script>` (search/filter, pan/zoom, click-highlight + meta panel), a search `<input>`, and a meta side-panel container. Offline single file.

**Modified:**
- `tool/src/cli/html.ts` — `HtmlData` gains `mermaidDef: string`. `renderHtml` adds the "Dependency graph" section: the Mermaid definition in a `<pre class="mermaid">`, the **inlined** Mermaid runtime + an init script + tooltip wiring. Existing sections unchanged.
- `tool/src/cli/index.ts` — `query --html` computes `focusedSubgraph` → `toMermaid` and passes `mermaidDef`; add the `render` command (reuses `--root/--docs/--overrides/--out/--html`).

**Mermaid offline bundling:** add `mermaid` as a dependency; at render time read its `dist/mermaid.min.js` (via a resolved module path) and inline it into the output so the file stays a self-contained offline single file (~3 MB per query report — acceptable for a report artifact). Mermaid runs client-side in the report only, never in the analysis pipeline. *Decision (approved):* npm dep + inline (not in-repo vendoring).

## 4. Data flow

- **query:** `buildEnriched → resolveLocator → impact + uiAccessPaths + focusedSubgraph → toMermaid → renderHtml(HtmlData{…, mermaidDef}) → writeFileSync`.
- **render:** `buildEnriched → wholeGraphSvg → renderWholeHtml → writeFileSync`.

## 5. Testing

- **Unit (pure):** `focusedSubgraph` (correct node kinds + edges + dynamic flags from a synthetic graph); `toMermaid` (flowchart header, dashed `-.->` for dynamic, sanitized ids, deterministic order); `wholeGraphSvg` (one node per component, edges present, coordinates assigned, `data-id` stable).
- **HTML assembly (markers, offline-text style — same as M3 workflow test):** `renderHtml` output contains `class="mermaid"` + the flowchart def + an inlined mermaid script (no CDN URL); `renderWholeHtml` contains `<svg`, a search `<input`, and the interactivity script.
- **Integration on `poc/real-sample`:** `query <c> --html` produces a Mermaid def whose nodes include the component's real ancestors/children; `render --html` emits an SVG containing all 18 components. No browser/E2E.
- Coverage gate ≥80% held.

## 6. Error handling / limits / decisions

- Labels escaped (reuse `esc` from `html.ts`); Mermaid node text wrapped so special chars don't break the def.
- **Ancestor depth in the subgraph:** to keep the Mermaid diagram readable, the focused subgraph uses the **full** impact ancestor set (matches the existing text list) but renders edges only between graph-adjacent nodes present in the subgraph (no synthetic transitive edges). If this proves cluttered on large fan-ins, a future iteration can cap depth — not in M5.
- **Whole-graph size:** still render all nodes, but the page leads with the search/filter; the `render` CLI prints the node/edge count so the user knows the scale. No silent truncation.
- Dynamic-edge styling reuses the existing `edge.kind !== 'resolved'` signal (covers `indirect` + `unresolved-static`); `via:'override'` edges are `resolved` and render solid (correct — they are documented).
- No `SCHEMA_VERSION` change (renderer is read-only over the existing graph).

## 7. Requirements (M5)

| REQ-ID | Requirement |
|---|---|
| RND-01 | `focusedSubgraph(graph, id)` — target + ancestors + immediate children + route-entry nodes, with per-edge `dynamic` flag (pure) |
| RND-02 | `toMermaid(subgraph)` — `flowchart` def: sanitized ids, human labels, dashed dynamic edges, deterministic order |
| RND-03 | Enhance `cmap query --html` — embed the Mermaid subgraph (Mermaid runtime **inlined**, offline) + hover tooltips; keep all existing sections |
| RND-04 | `wholeGraphSvg(graph)` — hand-rolled SVG, all components + resolved edges, modest deterministic layout, stable `data-id`s |
| RND-05 | Whole-graph interactivity — inlined client JS: search/filter highlight, pan/zoom, click-node highlight + meta side panel |
| RND-06 | `cmap render --html <file>` — whole-graph offline single-file report; prints node/edge counts |

## 8. Out of scope

- VSCode extension; multi-page/navigable reports; force-directed/beautiful auto-layout; live server/dev mode; CLI ASCII rendering; in-repo vendoring of Mermaid.

## 9. Acceptance

- `cmap query <c> --html` opens offline (no network) and shows an interactive Mermaid neighborhood diagram + the existing sections.
- `cmap render --html` opens offline and shows the whole graph with working search/filter, pan/zoom, and click-highlight + meta panel.
- Pure renderers unit-tested; integration green on real-sample; full suite + `tsc --noEmit` clean; coverage ≥80%.
