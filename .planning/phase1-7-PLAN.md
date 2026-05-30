# Phase 1 — Plan 7: Query Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Answer the two product questions over a built `Graph`: **impact** (which ancestors are affected when a component changes) and **UI access path** (which routes + component chains reach it), addressed by a flexible **locator** (componentId / className / file / selector).

**Architecture:** Two tasks. T13 = `resolveLocator(graph, locator)` with the documented priority + ambiguity reporting. T14 = `impact(graph, id)` (reverse-BFS over `resolved` edges, cycle-safe, with an uncertainty flag when dynamic/indirect edges exist) and `uiAccessPaths(graph, id)` (route entry → forward DFS over `resolved` edges → component chain). Pure functions over the `Graph` value.

**Tech Stack:** TypeScript (pure), vitest.

---

```yaml
must_haves:
  observable_truths:
    - "resolveLocator matches by componentId → className (case-insensitive, optional 'Component' suffix) → file (full or basename) → selector; >1 match returns reason:'ambiguous' with candidates; 0 returns reason:'not-found'."
    - "impact(graph,id) returns ancestors via reverse resolved edges, is cycle-safe, and sets uncertain=true when the graph has indirect/unresolved-static edges (impact may be incomplete)."
    - "uiAccessPaths(graph,id) returns {routeUrl, componentChain} for each route whose resolved-edge subtree contains id (incl. the component itself), cycle-safe."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/query/locator.ts — resolveLocator(graph, locator) -> ResolveResult"
    - "tool/src/query/index.ts — impact(graph, id), uiAccessPaths(graph, id)"
    - "tests for both"
  required_wiring:
    - "CLI (Plan 9) resolves a locator then calls impact/uiAccessPaths with node.id; HTML preview (Plan 9) renders them."
    - "Operates on the Graph from Plan 5/6 (componentId filled by Plan 8)."
  key_links:
    - "locator priority + ambiguity -> never guess (SAC-08)"
    - "resolved-only traversal + uncertain flag -> honest 'may be incomplete' (RESEARCH §6, zero missed-impact)"
    - "visited-set -> cycle-safe BFS/DFS (RESEARCH §6)"
```

---

## File Structure

- `tool/src/query/locator.ts` — locator resolution. One responsibility: string → node (or ambiguity/not-found).
- `tool/src/query/index.ts` — impact + ui-access-path graph traversals. One responsibility: answer queries over a Graph.
- Tests alongside.

---

## Wave: Query

### Task 13: Locator resolver

<model>sonnet</model>

<read_first>
- `tool/src/types.ts` (Graph, ComponentNode)
- `docs/specs/2026-05-30-phase1-static-analysis-core-design.md` §8 (locator priority + ambiguity)
</read_first>

**Files:**
- Create: `tool/src/query/locator.ts`
- Test: `tool/src/query/locator.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/query/locator.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { resolveLocator } from './locator.js';
import type { Graph, ComponentNode } from '../types.js';

function node(p: Partial<ComponentNode> & { className: string }): ComponentNode {
  return {
    id: p.className, componentId: null, className: p.className, selector: null,
    filePath: `src/${p.className}.ts`, standalone: false, module: null,
    templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [],
    ...p,
  };
}
function graph(components: ComponentNode[]): Graph {
  return { schemaVersion: 1, components, edges: [], routes: [] };
}

const g = graph([
  node({ className: 'InvoiceManagementComponent', selector: 'app-invoice', componentId: 'C001', filePath: 'src/finance/invoice.component.ts' }),
  node({ className: 'DataTableComponent', selector: 'app-data-table', filePath: 'src/shared/data-table.component.ts' }),
  node({ className: 'DupComponent', selector: 'app-dup', filePath: 'src/a/dup.component.ts' }),
  node({ className: 'DupComponent', selector: 'app-dup2', filePath: 'src/b/dup.component.ts' }),
]);

describe('resolveLocator', () => {
  it('resolves by componentId', () => {
    const r = resolveLocator(g, 'C001');
    expect(r.ok && r.node.className).toBe('InvoiceManagementComponent');
  });
  it('resolves by class name (case-insensitive, optional Component suffix)', () => {
    expect(resolveLocator(g, 'invoicemanagement').ok && resolveLocator(g, 'invoicemanagement')).toBeTruthy();
    const r = resolveLocator(g, 'InvoiceManagement');
    expect(r.ok && r.node.selector).toBe('app-invoice');
  });
  it('resolves by file basename or full path', () => {
    expect((resolveLocator(g, 'data-table.component.ts') as { node: ComponentNode }).node?.className).toBe('DataTableComponent');
    expect((resolveLocator(g, 'src/shared/data-table.component.ts') as { node: ComponentNode }).node?.className).toBe('DataTableComponent');
  });
  it('resolves by selector', () => {
    expect((resolveLocator(g, 'app-data-table') as { node: ComponentNode }).node?.className).toBe('DataTableComponent');
  });
  it('reports ambiguous with candidates when >1 match (duplicate class name)', () => {
    const r = resolveLocator(g, 'DupComponent');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('ambiguous');
    expect(r.ok === false && r.reason === 'ambiguous' && r.candidates.map((c) => c.filePath).sort())
      .toEqual(['src/a/dup.component.ts', 'src/b/dup.component.ts']);
  });
  it('reports not-found', () => {
    const r = resolveLocator(g, 'nope');
    expect(r.ok === false && r.reason).toBe('not-found');
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/query/locator.test.ts`

- [ ] **Step 3: Implement `tool/src/query/locator.ts`**

```ts
import type { Graph, ComponentNode } from '../types.js';

export type ResolveResult =
  | { ok: true; node: ComponentNode }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'ambiguous'; candidates: ComponentNode[] };

const norm = (s: string): string => s.toLowerCase().replace(/component$/, '');
const basename = (p: string): string => p.split('/').pop() ?? p;

// Priority: componentId -> className -> file (full or basename) -> selector.
// A tier with exactly one match resolves; a tier with >1 is ambiguous (do not fall through).
export function resolveLocator(graph: Graph, locator: string): ResolveResult {
  const tiers: Array<(c: ComponentNode) => boolean> = [
    (c) => c.componentId === locator,
    (c) => norm(c.className) === norm(locator),
    (c) => c.filePath === locator || basename(c.filePath) === locator || c.filePath.endsWith(`/${locator}`),
    (c) => c.selector === locator,
  ];
  for (const match of tiers) {
    const hits = graph.components.filter(match);
    if (hits.length === 1) return { ok: true, node: hits[0] };
    if (hits.length > 1) return { ok: false, reason: 'ambiguous', candidates: hits };
  }
  return { ok: false, reason: 'not-found' };
}
```

- [ ] **Step 4: Run, verify PASS** (6 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/query/locator.ts src/query/locator.test.ts
git commit -m "feat(tool): component locator (componentId/className/file/selector + ambiguity)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/query/locator.test.ts && npx tsc --noEmit`
Expected: 6 tests PASS; tsc clean. Covers each resolution tier, ambiguous (duplicate class name → candidate list), and not-found.
</verify>

<done>
`resolveLocator` maps a flexible locator to a node or a clear ambiguous/not-found result — never guessing between candidates.
</done>

---

### Task 14: Impact + UI access path

<model>opus</model>

<read_first>
- `tool/src/types.ts` (Graph, Edge, RouteNode)
- `.planning/phase1-RESEARCH.md` §6 (cycle-safe traversal; resolved-only chains; uncertain flag)
</read_first>

**Files:**
- Create: `tool/src/query/index.ts`
- Test: `tool/src/query/index.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/query/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { impact, uiAccessPaths } from './index.js';
import type { Graph, Edge, RouteNode } from '../types.js';

function edge(from: string, to: string | null, kind: Edge['kind'] = 'resolved'): Edge {
  return { from, to, kind, via: 'template', reason: kind === 'resolved' ? null : 'x' };
}
function route(fullPath: string, component: string | null, children: RouteNode[] = []): RouteNode {
  return { fullPath, component, redirectTo: null, loadChildren: null, loadComponent: null, outlet: null, pathMatch: null, guards: [], children };
}

// Page -> Mid -> Leaf (resolved); plus one indirect edge (to:null) elsewhere.
const g: Graph = {
  schemaVersion: 1,
  components: [],
  edges: [edge('PageComponent', 'MidComponent'), edge('MidComponent', 'LeafComponent'), edge('MidComponent', null, 'indirect')],
  routes: [route('page', 'PageComponent')],
};

describe('impact', () => {
  it('returns transitive ancestors via reverse resolved edges', () => {
    const r = impact(g, 'LeafComponent');
    expect(r.ancestors.sort()).toEqual(['MidComponent', 'PageComponent']);
  });
  it('flags uncertain when the graph has indirect/unresolved edges', () => {
    expect(impact(g, 'LeafComponent').uncertain).toBe(true);
  });
  it('is cycle-safe', () => {
    const cyc: Graph = { schemaVersion: 1, components: [], edges: [edge('A', 'B'), edge('B', 'A')], routes: [] };
    expect(impact(cyc, 'A').ancestors.sort()).toEqual(['B']);
  });
});

describe('uiAccessPaths', () => {
  it('returns route + component chain to the target', () => {
    const paths = uiAccessPaths(g, 'LeafComponent');
    expect(paths).toEqual([
      { routeUrl: 'page', componentChain: ['PageComponent', 'MidComponent', 'LeafComponent'], uncertain: true },
    ]);
  });
  it('returns the route component itself when it IS the target', () => {
    expect(uiAccessPaths(g, 'PageComponent')[0].componentChain).toEqual(['PageComponent']);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/query/index.test.ts`

- [ ] **Step 3: Implement `tool/src/query/index.ts`**

```ts
import type { Graph, RouteNode } from '../types.js';

function addAdj(m: Map<string, string[]>, key: string, value: string): void {
  const a = m.get(key);
  if (a) a.push(value);
  else m.set(key, [value]);
}

// resolved-only adjacency (edges whose target is statically known)
function resolvedReverse(graph: Graph): Map<string, string[]> {
  const rev = new Map<string, string[]>(); // child -> parents
  for (const e of graph.edges) if (e.kind === 'resolved' && e.to) addAdj(rev, e.to, e.from);
  return rev;
}
function resolvedForward(graph: Graph): Map<string, string[]> {
  const fwd = new Map<string, string[]>(); // parent -> children
  for (const e of graph.edges) if (e.kind === 'resolved' && e.to) addAdj(fwd, e.from, e.to);
  return fwd;
}
// Any non-resolved edge means some usages aren't statically known => results may be incomplete.
function hasDynamic(graph: Graph): boolean {
  return graph.edges.some((e) => e.kind !== 'resolved');
}

export interface ImpactResult {
  target: string;
  ancestors: string[];
  uncertain: boolean;
  uncertainReason: string | null;
}

export function impact(graph: Graph, id: string): ImpactResult {
  const rev = resolvedReverse(graph);
  const ancestors = new Set<string>();
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const parent of rev.get(cur) ?? []) {
      if (!seen.has(parent)) { seen.add(parent); ancestors.add(parent); queue.push(parent); }
    }
  }
  const dynamic = graph.edges.filter((e) => e.kind !== 'resolved').length;
  return {
    target: id,
    ancestors: [...ancestors],
    uncertain: dynamic > 0,
    uncertainReason: dynamic > 0
      ? `${dynamic} indirect/unresolved-static dependency(ies) in the graph may hide additional impact`
      : null,
  };
}

export interface AccessPath { routeUrl: string; componentChain: string[]; uncertain: boolean; }

function findChain(fwd: Map<string, string[]>, start: string, target: string): string[] | null {
  const visited = new Set<string>();
  const dfs = (node: string): string[] | null => {
    if (node === target) return [node];
    if (visited.has(node)) return null;
    visited.add(node);
    for (const child of fwd.get(node) ?? []) {
      const sub = dfs(child);
      if (sub) return [node, ...sub];
    }
    return null;
  };
  return dfs(start);
}

export function uiAccessPaths(graph: Graph, id: string): AccessPath[] {
  const fwd = resolvedForward(graph);
  const dynamic = hasDynamic(graph);
  const entries: { fullPath: string; component: string }[] = [];
  const walk = (rs: RouteNode[]): void => {
    for (const r of rs) {
      const component = r.component ?? r.loadComponent?.symbol ?? null;
      if (component) entries.push({ fullPath: r.fullPath, component });
      walk(r.children);
    }
  };
  walk(graph.routes);

  const paths: AccessPath[] = [];
  const seenKeys = new Set<string>();
  for (const e of entries) {
    const chain = findChain(fwd, e.component, id);
    if (!chain) continue;
    const key = `${e.fullPath}|${chain.join('>')}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    paths.push({ routeUrl: e.fullPath, componentChain: chain, uncertain: dynamic });
  }
  return paths;
}
```

- [ ] **Step 4: Run, verify PASS** (5 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/query/index.ts src/query/index.test.ts
git commit -m "feat(tool): impact (reverse-BFS) + ui-access-path (route->chain), cycle-safe + uncertain flag"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `impact` returns transitive ancestors via resolved edges, is cycle-safe, and flags `uncertain` when dynamic edges exist; `uiAccessPaths` returns the route + full component chain to the target (and the bare component when the route renders it directly).
</verify>

<done>
`impact` and `uiAccessPaths` answer the product questions over the Graph — cycle-safe, resolved-only chains, with an honest `uncertain` flag so dynamic/indirect dependencies aren't mistaken for "no impact". Plan 9 wires these to the CLI + HTML preview.
</done>

---

## Self-Review (Plan 7)

- **Spec coverage:** SAC-08 (locator priority + ambiguity), SAC-06 (impact + uncertainty), SAC-07 (ui-access-path route→chain, lazy loadComponent handled). Cycle-safe (RESEARCH §6). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `ResolveResult` discriminated union; `impact`/`uiAccessPaths` take `(graph, id)` where id == ComponentNode.id (className); `AccessPath`/`ImpactResult` exported; uses `Edge.kind`/`Edge.to`/`RouteNode.component`/`loadComponent.symbol` from types.ts. NodeNext `.js` imports. ✓
- **Honesty:** resolved-only traversal + `uncertain` flag surfaces incompleteness rather than implying full coverage (supports zero missed-impact). Reachability via indirect/unresolved (to:null) edges is intentionally not asserted — flagged instead. ✓
- **Verify bounds:** both tasks <60s. ✓
