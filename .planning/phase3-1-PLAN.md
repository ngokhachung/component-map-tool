# M5 — Plan 1: Focused subgraph + Mermaid definition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Compute the focused neighborhood of a queried component (target + impact ancestors + immediate children + route-entry nodes) and emit a Mermaid `flowchart` definition for it.

**Architecture:** Two pure tasks. T1 = `render/subgraph.ts` `focusedSubgraph(graph, id)` reusing `impact`/`uiAccessPaths` (Phase 1). T2 = `render/mermaid.ts` `toMermaid(sub)` → a deterministic `flowchart TD` string (sanitized ids, human labels, dashed dynamic edges, per-kind classDef).

**Tech Stack:** TS/Node ESM, vitest. No new deps in this plan.

---

```yaml
must_haves:
  observable_truths:
    - "focusedSubgraph returns the target (kind target), all impact ancestors (kind ancestor), immediate forward children (kind child), and one route node per UI access path (kind route); edges carry a dynamic flag (true when the underlying edge kind != resolved or the access path is uncertain)."
    - "toMermaid emits a `flowchart TD` with one line per node (sanitized id + quoted label + :::kind) and one line per edge (`-->` resolved, `-.->` dynamic) + classDef lines; output is deterministic (sorted)."
    - "tsc --noEmit clean; unit tests green."
  required_artifacts:
    - "tool/src/render/subgraph.ts (FocusedSubgraph, SubNode, SubEdge, focusedSubgraph)"
    - "tool/src/render/mermaid.ts (toMermaid)"
    - "tests for each"
  required_wiring:
    - "html.ts (Plan 3) embeds toMermaid output + uses SubNode.title for tooltips; cli/index.ts (Plan 4) calls focusedSubgraph → toMermaid for `query --html`."
  key_links:
    - "reuse impact reverse-BFS + uiAccessPaths → subgraph consistent with the text sections (RND-01)"
    - "dashed `-.->` for kind != resolved → visual uncertainty signal (RND-02)"
```

---

## File Structure

- `tool/src/render/subgraph.ts` — pure neighborhood extraction. One responsibility: graph + id → a small typed subgraph.
- `tool/src/render/mermaid.ts` — pure Mermaid serialization. One responsibility: subgraph → flowchart text.
- Tests alongside.

---

## Wave 1: Subgraph + Mermaid

### Task 1: focusedSubgraph

<model>sonnet</model>

<read_first>
- `tool/src/types.ts` (Graph, Edge, ComponentNode), `tool/src/query/index.ts` (`impact`, `uiAccessPaths`, `AccessPath`)
- `docs/specs/2026-05-31-phase3-renderer-ux-design.md` §3 + RND-01
</read_first>

**Files:**
- Create: `tool/src/render/subgraph.ts`
- Test: `tool/src/render/subgraph.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/render/subgraph.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { focusedSubgraph } from './subgraph.js';
import type { Graph, ComponentNode, Edge, RouteNode } from '../types.js';

function node(id: string): ComponentNode {
  return { id, componentId: null, className: id, selector: `${id.toLowerCase()}-sel`, filePath: `src/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
const E = (from: string, to: string, kind: Edge['kind'] = 'resolved'): Edge => ({ from, to, kind, via: 'template', reason: null });
function route(fullPath: string, component: string): RouteNode {
  return { fullPath, component, redirectTo: null, loadChildren: null, loadComponent: null, outlet: null, pathMatch: null, guards: [], children: [] };
}

// A → T (resolved ancestor), T → C (resolved child), D ⇢ T (dynamic ancestor), route /x → A
const graph: Graph = {
  schemaVersion: 2,
  components: ['A', 'T', 'C', 'D'].map(node),
  edges: [E('A', 'T'), E('T', 'C'), E('D', 'T', 'unresolved-static')],
  routes: [route('/x', 'A')],
};

describe('focusedSubgraph', () => {
  it('classifies target/ancestor/child/route nodes', () => {
    const sub = focusedSubgraph(graph, 'T');
    const kind = (id: string) => sub.nodes.find((n) => n.id === id)?.kind;
    expect(kind('T')).toBe('target');
    expect(kind('A')).toBe('ancestor');
    expect(kind('D')).toBe('ancestor');           // dynamic upstream is still an ancestor? see note
    expect(kind('C')).toBe('child');
    expect(sub.nodes.some((n) => n.kind === 'route' && n.label === '/x')).toBe(true);
  });

  it('marks dynamic edges and wires the route to its entry component', () => {
    const sub = focusedSubgraph(graph, 'T');
    expect(sub.edges).toContainEqual({ from: 'A', to: 'T', dynamic: false });
    expect(sub.edges).toContainEqual({ from: 'T', to: 'C', dynamic: false });
    const routeEdge = sub.edges.find((e) => e.from.startsWith('route:'));
    expect(routeEdge?.to).toBe('A');
  });

  it('carries filePath·selector as the node title (for tooltips)', () => {
    const sub = focusedSubgraph(graph, 'T');
    expect(sub.nodes.find((n) => n.id === 'T')?.title).toBe('src/T.ts · t-sel');
  });
});
```

> Note: `impact` only walks **resolved** reverse edges, so a purely dynamic (`unresolved-static`) upstream `D` is NOT in `impact().ancestors`. To still show it, the implementation adds any node that has an edge into the target as an upstream node (kind `ancestor`). The test above asserts `D` is an ancestor — the implementation must include direct-into-target edges regardless of kind.

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/render/subgraph.test.ts`

- [ ] **Step 3: Implement `tool/src/render/subgraph.ts`**

```ts
import type { Graph } from '../types.js';
import { impact, uiAccessPaths } from '../query/index.js';

export type SubNodeKind = 'target' | 'ancestor' | 'child' | 'route';
export interface SubNode { id: string; label: string; kind: SubNodeKind; title: string; }
export interface SubEdge { from: string; to: string; dynamic: boolean; }
export interface FocusedSubgraph { nodes: SubNode[]; edges: SubEdge[]; }

export function focusedSubgraph(graph: Graph, id: string): FocusedSubgraph {
  const byId = new Map(graph.components.map((c) => [c.id, c]));
  const titleOf = (cid: string): string => {
    const c = byId.get(cid);
    if (!c) return '';
    return c.selector ? `${c.filePath} · ${c.selector}` : c.filePath;
  };

  // upstream = target + resolved-impact ancestors + any direct predecessor (incl. dynamic)
  const upstream = new Set<string>([id, ...impact(graph, id).ancestors]);
  for (const e of graph.edges) if (e.to === id) upstream.add(e.from);

  const nodes = new Map<string, SubNode>();
  nodes.set(id, { id, label: id, kind: 'target', title: titleOf(id) });
  for (const u of upstream) if (u !== id) nodes.set(u, { id: u, label: u, kind: 'ancestor', title: titleOf(u) });

  const edges: SubEdge[] = [];
  const pushEdge = (from: string, to: string, dynamic: boolean) => {
    if (!edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, dynamic });
  };

  // upstream structure: edges among {target ∪ ancestors}
  for (const e of graph.edges) {
    if (e.to && upstream.has(e.from) && upstream.has(e.to)) pushEdge(e.from, e.to, e.kind !== 'resolved');
  }
  // immediate forward children of target (downstream, not upstream)
  for (const e of graph.edges) {
    if (e.from === id && e.to && !upstream.has(e.to)) {
      if (!nodes.has(e.to)) nodes.set(e.to, { id: e.to, label: e.to, kind: 'child', title: titleOf(e.to) });
      pushEdge(id, e.to, e.kind !== 'resolved');
    }
  }
  // route entry nodes → first component of each access path chain
  for (const p of uiAccessPaths(graph, id)) {
    const entry = p.componentChain[0];
    if (!entry) continue;
    const rid = `route:${p.routeUrl}`;
    if (!nodes.has(rid)) nodes.set(rid, { id: rid, label: p.routeUrl, kind: 'route', title: '' });
    if (!nodes.has(entry)) nodes.set(entry, { id: entry, label: entry, kind: 'ancestor', title: titleOf(entry) });
    pushEdge(rid, entry, p.uncertain);
  }

  return { nodes: [...nodes.values()], edges };
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/render/subgraph.ts src/render/subgraph.test.ts
git commit -m "feat(tool): focusedSubgraph — target+ancestors+children+route nodes (RND-01)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/render/subgraph.test.ts && npx tsc --noEmit`
Expected: 3 PASS; tsc clean.
</verify>

<done>
The focused neighborhood is a small typed graph. T2 serializes it to Mermaid; Plan 3/4 render + wire it.
</done>

---

### Task 2: toMermaid

<model>sonnet</model>

<read_first>
- `tool/src/render/subgraph.ts` (T1 — `FocusedSubgraph`, `SubNode`)
- RND-02
</read_first>

**Files:**
- Create: `tool/src/render/mermaid.ts`
- Test: `tool/src/render/mermaid.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/render/mermaid.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { toMermaid } from './mermaid.js';
import type { FocusedSubgraph } from './subgraph.js';

const sub: FocusedSubgraph = {
  nodes: [
    { id: 'T', label: 'T', kind: 'target', title: 'src/T.ts' },
    { id: 'A', label: 'A', kind: 'ancestor', title: 'src/A.ts' },
    { id: 'route:/x', label: '/x', kind: 'route', title: '' },
  ],
  edges: [
    { from: 'A', to: 'T', dynamic: false },
    { from: 'route:/x', to: 'A', dynamic: true },
  ],
};

describe('toMermaid', () => {
  it('emits a deterministic flowchart with classed nodes and styled edges', () => {
    const out = toMermaid(sub);
    expect(out.startsWith('flowchart TD')).toBe(true);
    expect(out).toContain(':::target');
    expect(out).toContain('-->');        // resolved
    expect(out).toContain('-.->');       // dynamic
    expect(out).toContain('classDef target');
    // sanitized ids: no slashes/colons in node tokens
    expect(out).not.toMatch(/route:\/x\b/);
    expect(toMermaid(sub)).toBe(out);    // deterministic
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/render/mermaid.test.ts`

- [ ] **Step 3: Implement `tool/src/render/mermaid.ts`**

```ts
import type { FocusedSubgraph, SubNode } from './subgraph.js';

function safeId(id: string): string {
  return `n${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
}
function escLabel(s: string): string {
  return s.replace(/"/g, '&quot;');
}
const SHAPE: Record<SubNode['kind'], (label: string) => string> = {
  target: (l) => `["${l}"]`,
  ancestor: (l) => `["${l}"]`,
  child: (l) => `["${l}"]`,
  route: (l) => `(["${l}"])`,
};

export function toMermaid(sub: FocusedSubgraph): string {
  const nodes = [...sub.nodes].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const edges = [...sub.edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const lines = ['flowchart TD'];
  for (const n of nodes) lines.push(`  ${safeId(n.id)}${SHAPE[n.kind](escLabel(n.label))}:::${n.kind}`);
  for (const e of edges) lines.push(`  ${safeId(e.from)} ${e.dynamic ? '-.->' : '-->'} ${safeId(e.to)}`);
  lines.push('  classDef target fill:#ffe08a,stroke:#b8860b,stroke-width:2px;');
  lines.push('  classDef ancestor fill:#e6f0ff,stroke:#4a78c0;');
  lines.push('  classDef child fill:#e9ffe6,stroke:#4aa84a;');
  lines.push('  classDef route fill:#f0e6ff,stroke:#8a4ac0;');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run, verify PASS** (1 test).

- [ ] **Step 5: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (expect green + clean).

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/render/mermaid.ts src/render/mermaid.test.ts
git commit -m "feat(tool): toMermaid — flowchart def, dashed dynamic edges, classed nodes (RND-02)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `flowchart TD` header, `:::kind` classes, `-->`/`-.->` edges, classDef lines, sanitized ids, deterministic.
</verify>

<done>
A subgraph serializes to a Mermaid flowchart. Plan 3 embeds it (with the inlined runtime) into `cmap query --html`.
</done>

---

## Self-Review (Plan 1)

- **Spec coverage:** RND-01 (focusedSubgraph: target/ancestor/child/route + dynamic flag + title), RND-02 (toMermaid: flowchart, dashed dynamic, sanitized ids, classDef, deterministic). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `FocusedSubgraph { nodes: SubNode[]; edges: SubEdge[] }`, `SubNode {id,label,kind,title}`, `SubEdge {from,to,dynamic}` defined in T1, consumed verbatim in T2 + later plans; reuses `impact`/`uiAccessPaths` (Phase 1 signatures); `ComponentNode` test literal carries all fields incl. `description`. NodeNext `.js`. ✓
- **Verify bounds:** both tasks <60s. ✓
