# M5 — Plan 2: Whole-graph SVG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Generate a hand-rolled SVG of the whole component graph — every component as a node, every resolved edge as a line — with a modest deterministic layered layout and stable `data-id`/`data-from`/`data-to` hooks for client-side interactivity.

**Architecture:** One pure task, one new module `render/svg.ts`. `wholeGraphSvg(graph)` assigns each component a layer (longest distance from a resolved-edge root; cycles/unreachable → layer 0), positions nodes in columns, draws `<rect>+<text>` nodes and `<line>` edges, and returns the SVG string plus the node coordinates.

**Tech Stack:** TS/Node ESM, vitest. No new deps.

---

```yaml
must_haves:
  observable_truths:
    - "wholeGraphSvg returns one node (with data-id) per component and one <line> (with data-from/data-to) per resolved edge; dynamic edges are not drawn."
    - "every node gets x/y coordinates; the SVG has a viewBox sized to the content; output is deterministic (components sorted by id within layer)."
    - "tsc --noEmit clean; unit tests green."
  required_artifacts:
    - "tool/src/render/svg.ts (SvgNode, WholeGraphSvg, wholeGraphSvg)"
    - "tool/src/render/svg.test.ts"
  required_wiring:
    - "cli/render-html.ts (Plan 3) embeds the svg + wires interactivity to data-id/data-from/data-to."
  key_links:
    - "resolved-only edges + layered layout → readable-enough whole-graph (RND-04)"
    - "stable data-* hooks → client search/click without re-layout (feeds RND-05)"
```

---

## File Structure

- `tool/src/render/svg.ts` — pure whole-graph SVG generation. One responsibility: graph → SVG markup + node coordinates.
- Test alongside.

---

## Wave 2: Whole-graph SVG

### Task 3: wholeGraphSvg

<model>sonnet</model>

<read_first>
- `tool/src/types.ts` (Graph, Edge, ComponentNode)
- `docs/specs/2026-05-31-phase3-renderer-ux-design.md` §3 + §6 + RND-04
</read_first>

**Files:**
- Create: `tool/src/render/svg.ts`
- Test: `tool/src/render/svg.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/render/svg.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { wholeGraphSvg } from './svg.js';
import type { Graph, ComponentNode, Edge } from '../types.js';

function node(id: string): ComponentNode {
  return { id, componentId: null, className: id, selector: null, filePath: `src/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
const E = (from: string, to: string, kind: Edge['kind'] = 'resolved'): Edge => ({ from, to, kind, via: 'template', reason: null });

const graph: Graph = {
  schemaVersion: 2,
  components: ['Root', 'Mid', 'Leaf', 'Dyn'].map(node),
  edges: [E('Root', 'Mid'), E('Mid', 'Leaf'), E('Dyn', 'Leaf', 'unresolved-static')],
  routes: [],
};

describe('wholeGraphSvg', () => {
  it('emits one node per component with a data-id, and a viewBox', () => {
    const { svg, nodes } = wholeGraphSvg(graph);
    expect(nodes).toHaveLength(4);
    for (const id of ['Root', 'Mid', 'Leaf', 'Dyn']) expect(svg).toContain(`data-id="${id}"`);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it('draws only resolved edges, with data-from/data-to', () => {
    const { svg } = wholeGraphSvg(graph);
    expect(svg).toContain('data-from="Root" data-to="Mid"');
    expect(svg).toContain('data-from="Mid" data-to="Leaf"');
    expect(svg).not.toContain('data-from="Dyn"');   // dynamic edge not drawn
  });

  it('layers nodes left-to-right (Root before Mid before Leaf in x)', () => {
    const { nodes } = wholeGraphSvg(graph);
    const x = (id: string) => nodes.find((n) => n.id === id)!.x;
    expect(x('Root')).toBeLessThan(x('Mid'));
    expect(x('Mid')).toBeLessThan(x('Leaf'));
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/render/svg.test.ts`

- [ ] **Step 3: Implement `tool/src/render/svg.ts`**

```ts
import type { Graph } from '../types.js';

export interface SvgNode { id: string; x: number; y: number; }
export interface WholeGraphSvg { svg: string; nodes: SvgNode[]; }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const a = m.get(k); if (a) a.push(v); else m.set(k, [v]);
}

// layer = longest distance from a resolved-edge root; cycles/unreachable settle at 0.
function layers(graph: Graph): Map<string, number> {
  const fwd = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const c of graph.components) indeg.set(c.id, 0);
  for (const e of graph.edges) {
    if (e.kind === 'resolved' && e.to && indeg.has(e.from) && indeg.has(e.to)) {
      push(fwd, e.from, e.to);
      indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    }
  }
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const c of graph.components) { layer.set(c.id, 0); if ((indeg.get(c.id) ?? 0) === 0) queue.push(c.id); }
  const seen = new Set<string>();
  while (queue.length) {
    const n = queue.shift() as string;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of fwd.get(n) ?? []) {
      layer.set(m, Math.max(layer.get(m) ?? 0, (layer.get(n) ?? 0) + 1));
      queue.push(m);
    }
  }
  return layer;
}

const NW = 170, NH = 26, DX = 230, DY = 40;

export function wholeGraphSvg(graph: Graph): WholeGraphSvg {
  const layer = layers(graph);
  const byLayer = new Map<number, string[]>();
  for (const c of [...graph.components].sort((a, b) => a.id.localeCompare(b.id))) push(byLayer, layer.get(c.id) ?? 0, c.id);

  const pos = new Map<string, SvgNode>();
  for (const [l, ids] of byLayer) ids.forEach((id, i) => pos.set(id, { id, x: 20 + l * DX, y: 20 + i * DY }));

  const coords = [...pos.values()];
  const maxX = Math.max(0, ...coords.map((p) => p.x)) + NW + 20;
  const maxY = Math.max(0, ...coords.map((p) => p.y)) + NH + 20;

  const edgeLines: string[] = [];
  for (const e of graph.edges) {
    if (e.kind !== 'resolved' || !e.to) continue;
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    edgeLines.push(`<line data-from="${esc(e.from)}" data-to="${esc(e.to)}" x1="${a.x + NW}" y1="${a.y + NH / 2}" x2="${b.x}" y2="${b.y + NH / 2}"/>`);
  }
  const nodeEls: string[] = [];
  for (const p of coords) {
    nodeEls.push(`<g class="cmap-node" data-id="${esc(p.id)}"><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="4"/><text x="${p.x + 8}" y="${p.y + 17}">${esc(p.id)}</text></g>`);
  }
  const svg = `<svg id="cmap-graph" viewBox="0 0 ${maxX} ${maxY}" xmlns="http://www.w3.org/2000/svg">
<g id="cmap-edges">${edgeLines.join('')}</g>
<g id="cmap-nodes">${nodeEls.join('')}</g>
</svg>`;
  return { svg, nodes: coords };
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests).

- [ ] **Step 5: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (expect green + clean).

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/render/svg.ts src/render/svg.test.ts
git commit -m "feat(tool): wholeGraphSvg — layered SVG, resolved edges, data-* hooks (RND-04)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. One `data-id` node per component; `<line data-from/data-to>` per resolved edge; dynamic edges absent; viewBox sized; left-to-right layering; deterministic.
</verify>

<done>
The whole graph renders to interactive-ready SVG. Plan 3 (`render-html.ts`) wraps it with search/pan-zoom/click + a meta panel.
</done>

---

## Self-Review (Plan 2)

- **Spec coverage:** RND-04 (hand-rolled SVG, all components, resolved-only edges, modest layered layout, stable `data-*`). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `WholeGraphSvg { svg, nodes: SvgNode[] }`, `SvgNode {id,x,y}`; `push` helper avoids the get-or-create footgun; layout constants `NW/NH/DX/DY` reused in nodes + edges + viewBox; `data-from/data-to` on lines + `data-id` on nodes match what Plan 3's JS queries. NodeNext `.js`. ✓
- **Verify bounds:** single task <60s. ✓
