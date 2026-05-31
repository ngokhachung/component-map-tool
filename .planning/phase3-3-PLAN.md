# M5 — Plan 3: HTML assembly (Mermaid section + whole-graph page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Embed the Mermaid subgraph into the existing `cmap query --html` page (offline, with hover tooltips), and build the new whole-graph interactive page (search/filter, pan/zoom, click-highlight + meta panel).

**Architecture:** Two tasks. T4 = `render/assets.ts` (`mermaidRuntime()` reads the installed Mermaid UMD bundle to inline) + extend `cli/html.ts` `renderHtml` with an optional "Dependency graph" section (Mermaid def + inlined runtime + tooltip init). T5 = `cli/render-html.ts` `renderWholeHtml(graph)` (SVG from Plan 2 + inlined client JS for interactivity + meta side panel).

**Tech Stack:** TS/Node ESM, vitest. New dep: `mermaid` (browser runtime, inlined into reports; runs client-side only).

---

```yaml
must_haves:
  observable_truths:
    - "renderHtml, when given a mermaidDef, emits a <pre class=\"mermaid\"> with the def, the inlined Mermaid runtime (no CDN URL), and a tooltip init using a CMAP_TIP map; when mermaidDef is absent, the page is unchanged (back-compatible)."
    - "mermaidRuntime() returns a non-empty JS string read from the installed mermaid package."
    - "renderWholeHtml returns a single offline HTML containing the <svg>, a search <input id=\"cmap-search\">, an embedded META map, and the interactivity script (pan/zoom + click)."
    - "tsc --noEmit clean; tests green."
  required_artifacts:
    - "tool/src/render/assets.ts (mermaidRuntime)"
    - "tool/src/cli/html.ts (HtmlData += optional mermaidDef/tips/mermaidRuntime; graph section)"
    - "tool/src/cli/render-html.ts (renderWholeHtml)"
    - "tests for each"
    - "mermaid added to tool/package.json dependencies"
  required_wiring:
    - "cli/index.ts (Plan 4): query --html passes mermaidDef/tips/mermaidRuntime(); render command calls renderWholeHtml."
  key_links:
    - "inlined Mermaid runtime → offline single-file (RND-03)"
    - "data-id/data-from/data-to from Plan 2 → click-highlight + meta panel (RND-05/06)"
```

---

## File Structure

- `tool/src/render/assets.ts` — reads the inlinable Mermaid runtime. One responsibility: provide the offline JS blob.
- `tool/src/cli/html.ts` — the per-component report (existing) + a graph section. One responsibility: query report HTML.
- `tool/src/cli/render-html.ts` — the whole-graph report. One responsibility: whole-graph HTML.
- Tests alongside.

---

## Wave 3: HTML assembly

### Task 4: Mermaid runtime + query-report graph section

<model>sonnet</model>

<read_first>
- `tool/src/cli/html.ts` (whole file — `HtmlData`, `renderHtml`, `esc`), `tool/src/render/mermaid.ts` (Plan 1), `tool/src/query/index.ts` (`ImpactResult`, `AccessPath`)
- RND-03; spec §3 (offline bundling)
</read_first>

**Files:**
- Create: `tool/src/render/assets.ts`
- Modify: `tool/src/cli/html.ts`
- Test: `tool/src/cli/html-graph.test.ts`
- Modify: `tool/package.json` (add `mermaid` dependency)

<action>

- [ ] **Step 1: Install Mermaid** (adds it to `dependencies` + lockfile):

```bash
cd tool && npm install mermaid
```
Then confirm the UMD bundle resolves:
```bash
cd tool && node -e "console.log(require.resolve('mermaid/dist/mermaid.min.js'))"
```
Expected: prints an absolute path to `mermaid.min.js`. (If that exact file is absent, list `node_modules/mermaid/dist/` and use the UMD file named `mermaid.min.js` / `mermaid.js`; adjust the path in Step 3 accordingly and note it.)

- [ ] **Step 2: Write the failing test** — `tool/src/cli/html-graph.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { renderHtml, type HtmlData } from './html.js';
import { mermaidRuntime } from '../render/assets.js';

function baseData(): HtmlData {
  return {
    component: { id: 'T', componentId: null, selector: 't-sel', filePath: 'src/T.ts', standalone: false, module: null },
    impact: { target: 'T', ancestors: ['A'], uncertain: false, uncertainReason: null },
    accessPaths: [{ routeUrl: '/x', componentChain: ['A', 'T'], uncertain: false }],
    images: [],
  };
}

describe('renderHtml graph section', () => {
  it('embeds the mermaid def + inlined runtime + tooltip map when given a mermaidDef', () => {
    const html = renderHtml({ ...baseData(), mermaidDef: 'flowchart TD\n  nT["T"]:::target', tips: { T: 'src/T.ts · t-sel' }, mermaidRuntime: '/*MERMAID-RUNTIME*/' });
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('flowchart TD');
    expect(html).toContain('/*MERMAID-RUNTIME*/');
    expect(html).toContain('CMAP_TIP');
    expect(html).not.toContain('https://');         // offline — no CDN
  });

  it('is unchanged (no graph section) when mermaidDef is absent', () => {
    expect(renderHtml(baseData())).not.toContain('class="mermaid"');
  });
});

describe('mermaidRuntime', () => {
  it('returns a non-empty inlinable runtime', () => {
    expect(mermaidRuntime().length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 3: Implement `tool/src/render/assets.ts`**

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let cached: string | null = null;

// Mermaid's browser UMD runtime, read from the installed package and inlined into reports so
// the HTML stays offline / single-file. Mermaid runs client-side only (never in our analysis).
export function mermaidRuntime(): string {
  if (cached === null) cached = readFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');
  return cached;
}
```

- [ ] **Step 4: Edit `tool/src/cli/html.ts`** — extend `HtmlData` with three OPTIONAL fields (back-compatible) and add a graph section.

(a) In the `HtmlData` interface, add after `images`:
```ts
  mermaidDef?: string;
  tips?: Record<string, string>;
  mermaidRuntime?: string;
```

(b) Inside `renderHtml`, before the final `return`, build the section:
```ts
  const graphSection = data.mermaidDef ? `
<section><h2>Dependency graph</h2>
<pre class="mermaid">${data.mermaidDef}</pre>
<p class="meta">solid = static dep · dashed = dynamic/uncertain · hover a node for its file</p></section>
<script>${data.mermaidRuntime ?? ''}</script>
<script>
  const CMAP_TIP = ${JSON.stringify(data.tips ?? {})};
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    mermaid.run({ querySelector: '.mermaid' }).then(function () {
      document.querySelectorAll('.mermaid .node').forEach(function (el) {
        var label = (el.textContent || '').trim();
        var tip = CMAP_TIP[label];
        if (tip) { var t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = tip; el.appendChild(t); }
      });
    });
  }
</script>` : '';
```

(c) Inject `${graphSection}` into the returned HTML immediately before `</body></html>` (place it after the existing `<section>` for UI access paths). The existing return template ends with:
```
<section><h2>UI access paths</h2>${paths}</section>
</body></html>`;
```
Change it to:
```
<section><h2>UI access paths</h2>${paths}</section>
${graphSection}
</body></html>`;
```

(d) Add `.mermaid { margin:.5rem 0; }` to the `<style>` block (append to the existing style rules).

- [ ] **Step 5: Run, verify PASS** (3 tests): `cd tool && npx vitest run src/cli/html-graph.test.ts`

- [ ] **Step 6: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (existing html/query tests must still pass — the new fields are optional).

- [ ] **Step 7: Commit**

```bash
cd tool && git add src/render/assets.ts src/cli/html.ts src/cli/html-graph.test.ts package.json package-lock.json
git commit -m "feat(tool): embed offline Mermaid subgraph in query --html report (RND-03)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. With a `mermaidDef`, the report carries `class="mermaid"` + the def + the inlined runtime + `CMAP_TIP` and no CDN URL; without it, the report is unchanged.
</verify>

<done>
`cmap query --html` can render an offline Mermaid neighborhood diagram. T5 builds the whole-graph page. Plan 4 wires both.
</done>

---

### Task 5: Whole-graph interactive page

<model>sonnet</model>

<read_first>
- `tool/src/render/svg.ts` (Plan 2 — `wholeGraphSvg`, the `data-id`/`data-from`/`data-to` hooks), `tool/src/types.ts` (Graph, ComponentNode)
- RND-05, RND-06; spec §2/§3
</read_first>

**Files:**
- Create: `tool/src/cli/render-html.ts`
- Test: `tool/src/cli/render-html.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/render-html.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { renderWholeHtml } from './render-html.js';
import type { Graph, ComponentNode, Edge } from '../types.js';

function node(id: string): ComponentNode {
  return { id, componentId: null, className: id, selector: null, filePath: `src/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
const E = (from: string, to: string): Edge => ({ from, to, kind: 'resolved', via: 'template', reason: null });
const graph: Graph = { schemaVersion: 2, components: ['Root', 'Leaf'].map(node), edges: [E('Root', 'Leaf')], routes: [] };

describe('renderWholeHtml', () => {
  it('produces an offline single-file page with svg, search, meta map, and interactivity', () => {
    const html = renderWholeHtml(graph);
    expect(html).toContain('<svg');
    expect(html).toContain('id="cmap-search"');
    expect(html).toContain('const META');
    expect(html).toContain('data-id="Root"');
    expect(html).toContain('data-id="Leaf"');
    expect(html).toContain('addEventListener');     // interactivity present
    expect(html).not.toContain('https://');         // offline
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/render-html.test.ts`

- [ ] **Step 3: Implement `tool/src/cli/render-html.ts`**

```ts
import type { Graph } from '../types.js';
import { wholeGraphSvg } from '../render/svg.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderWholeHtml(graph: Graph): string {
  const { svg } = wholeGraphSvg(graph);
  const meta: Record<string, { filePath: string; selector: string | null; module: string | null; standalone: boolean }> = {};
  for (const c of graph.components) meta[c.id] = { filePath: c.filePath, selector: c.selector, module: c.module, standalone: c.standalone };
  const resolvedEdges = graph.edges.filter((e) => e.kind === 'resolved' && e.to).length;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Component map — whole graph</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; }
  header { padding: .5rem 1rem; border-bottom: 1px solid #ddd; display: flex; gap: 1rem; align-items: center; }
  #cmap-search { padding: .25rem .5rem; min-width: 16rem; }
  #cmap-stage { overflow: hidden; height: calc(100vh - 3rem); cursor: grab; }
  #cmap-graph { transform-origin: 0 0; }
  .cmap-node rect { fill: #eef; stroke: #88a; }
  .cmap-node text { font-size: 12px; fill: #223; }
  #cmap-edges line { stroke: #bbb; }
  .cmap-dim { opacity: .12; }
  .cmap-node.cmap-sel rect { fill: #ffe08a; stroke: #b8860b; stroke-width: 2px; }
  #cmap-edges line.cmap-hot { stroke: #b8860b; stroke-width: 2px; }
  #cmap-meta { position: fixed; right: 0; top: 3rem; width: 22rem; max-height: calc(100vh - 3rem); overflow: auto; padding: 1rem; border-left: 1px solid #ddd; background: #fff; }
  #cmap-meta code { background: #f4f4f4; padding: 0 .2rem; }
</style></head><body>
<header>
  <strong>Component map</strong>
  <input id="cmap-search" placeholder="filter components…"/>
  <span>${graph.components.length} components · ${resolvedEdges} resolved edges</span>
</header>
<div id="cmap-stage">${svg}</div>
<aside id="cmap-meta">Click a node for details.</aside>
<script>
  const META = ${JSON.stringify(meta)};
  const stage = document.getElementById('cmap-stage');
  const svgEl = document.getElementById('cmap-graph');
  const nodes = Array.prototype.slice.call(document.querySelectorAll('.cmap-node'));
  const lines = Array.prototype.slice.call(document.querySelectorAll('#cmap-edges line'));

  // search/filter
  document.getElementById('cmap-search').addEventListener('input', function (e) {
    const q = e.target.value.trim().toLowerCase();
    nodes.forEach(function (n) {
      const id = (n.getAttribute('data-id') || '').toLowerCase();
      n.classList.toggle('cmap-dim', q !== '' && id.indexOf(q) === -1);
    });
  });

  // click → select + highlight incident edges + meta panel
  document.getElementById('cmap-nodes').addEventListener('click', function (e) {
    const g = e.target.closest('.cmap-node'); if (!g) return;
    const id = g.getAttribute('data-id');
    nodes.forEach(function (n) { n.classList.toggle('cmap-sel', n === g); });
    lines.forEach(function (l) {
      const hot = l.getAttribute('data-from') === id || l.getAttribute('data-to') === id;
      l.classList.toggle('cmap-hot', hot);
    });
    const m = META[id] || {};
    document.getElementById('cmap-meta').innerHTML =
      '<h3>' + id + '</h3>' +
      '<p><code>' + (m.filePath || '') + '</code></p>' +
      '<p>selector: <code>' + (m.selector || '—') + '</code><br/>standalone: ' + (!!m.standalone) +
      '<br/>module: ' + (m.module || '—') + '</p>';
  });

  // pan + zoom
  let scale = 1, tx = 0, ty = 0, panning = false, sx = 0, sy = 0;
  function apply() { svgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
  stage.addEventListener('wheel', function (e) { e.preventDefault(); scale = Math.min(4, Math.max(0.1, scale * (e.deltaY < 0 ? 1.1 : 0.9))); apply(); }, { passive: false });
  stage.addEventListener('mousedown', function (e) { panning = true; sx = e.clientX - tx; sy = e.clientY - ty; stage.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', function () { panning = false; stage.style.cursor = 'grab'; });
  window.addEventListener('mousemove', function (e) { if (!panning) return; tx = e.clientX - sx; ty = e.clientY - sy; apply(); });
</script>
</body></html>`;
}
```

- [ ] **Step 4: Run, verify PASS** (1 test).

- [ ] **Step 5: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (expect green + clean).

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/cli/render-html.ts src/cli/render-html.test.ts
git commit -m "feat(tool): whole-graph interactive HTML — search/pan-zoom/click + meta panel (RND-05)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. Single offline page with `<svg>`, `#cmap-search`, embedded `META`, per-component `data-id`, interactivity script; no CDN URL.
</verify>

<done>
Both report pages exist. Plan 4 wires `cmap query --html` (subgraph) and adds `cmap render --html` (whole graph), with real-sample integration.
</done>

---

## Self-Review (Plan 3)

- **Spec coverage:** RND-03 (query report Mermaid section, inlined offline runtime, tooltips, back-compatible), RND-05 (whole-graph interactivity: search/pan-zoom/click+meta). RND-06 command itself is Plan 4 (`renderWholeHtml` built here). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `HtmlData` new fields OPTIONAL (existing callers/tests unaffected); test builds `HtmlData` with the real `ImpactResult`/`AccessPath` shapes; `renderWholeHtml(graph)` consumes `wholeGraphSvg` + `data-id/data-from/data-to` from Plan 2; `META` keyed by component id; client JS uses `.cmap-node`/`#cmap-nodes`/`#cmap-edges` matching Plan 2's SVG. NodeNext `.js`. ✓
- **Verify bounds:** both tasks <60s. ✓
