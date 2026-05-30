# Phase 1 — Plan 5: Graph Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Assemble the indexer + edges + routes outputs into a versioned `Graph`, (de)serialize it deterministically, and wire a full-build orchestrator that produces a `graph.json` artifact.

**Architecture:** Two tasks. T10 = pure `assembleGraph`/`serializeGraph`/`loadGraph` (records → `ComponentNode[]` with `id`, deterministic JSON, schemaVersion guard). T11 = `buildGraph(project, {root})` orchestrator (index → edges → routes → assemble) + `writeGraph` to a `.cmap/` dir + `buildGraphFromRoot` convenience. Builds on Plans 1-4.

**Tech Stack:** Node ESM (fs), ts-morph, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "assembleGraph turns ComponentRecord[] into ComponentNode[] with id=className and null MD fields (componentId/docPath/images), and sets schemaVersion."
    - "serializeGraph output is deterministic (components sorted by id, edges sorted) and loadGraph round-trips it; loadGraph throws on a schemaVersion mismatch."
    - "buildGraph(project,{root}) returns a Graph with components+edges+routes and a parseErrors list; writeGraph writes a loadable graph.json."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/graph/assemble.ts — assembleGraph, serializeGraph, loadGraph"
    - "tool/src/graph/index.ts — buildGraph, buildGraphFromRoot, writeGraph"
    - "tests for both"
  required_wiring:
    - "buildGraph composes indexComponents (Plan 2) + buildEdges (Plan 4) + parseRoutes (Plan 3) + assembleGraph."
    - "Cache (Plan 6) wraps buildGraphFromRoot with a content-hash manifest; Query (Plan 7) loads/uses the Graph; MdIndex (Plan 8) fills componentId/docPath/images on the nodes."
  key_links:
    - "node id = className (Phase 1); collisions across files are a documented limitation, not qualified (edges already key on className)"
    - "deterministic serialization -> golden-baseline + route-order stability (RESEARCH §8)"
    - "schemaVersion guard -> mismatch => caller rebuilds (SAC-04)"
```

---

## File Structure

- `tool/src/graph/assemble.ts` — pure graph assembly + (de)serialization. One responsibility: the `Graph` value + its JSON form.
- `tool/src/graph/index.ts` — full-build orchestration + artifact writing. One responsibility: produce/persist a graph from a project/root.
- Tests alongside.

---

## Wave: Graph

### Task 10: Graph assembler + serialize/load

<model>sonnet</model>

<read_first>
- `tool/src/types.ts` (Graph, ComponentNode, ComponentRecord, Edge, RouteNode, SCHEMA_VERSION)
- `.planning/phase1-RESEARCH.md` §8 (deterministic order, schemaVersion guard)
</read_first>

**Files:**
- Create: `tool/src/graph/assemble.ts`
- Test: `tool/src/graph/assemble.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/graph/assemble.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { assembleGraph, serializeGraph, loadGraph } from './assemble.js';
import { SCHEMA_VERSION } from '../types.js';
import type { ComponentRecord, Edge, RouteNode } from '../types.js';

const recs: ComponentRecord[] = [
  { className: 'FooComponent', selector: 'app-foo', filePath: 'src/foo.ts', standalone: false, module: 'M', templateKind: 'inline', inputs: [], outputs: [] },
];
const edges: Edge[] = [{ from: 'FooComponent', to: 'BarComponent', kind: 'resolved', via: 'template', reason: null }];
const routes: RouteNode[] = [{ fullPath: 'foo', component: 'FooComponent', redirectTo: null, loadChildren: null, loadComponent: null, outlet: null, pathMatch: null, guards: [], children: [] }];

describe('assembleGraph', () => {
  it('turns records into nodes (id=className, null MD fields) and sets schemaVersion', () => {
    const g = assembleGraph(recs, edges, routes);
    expect(g.schemaVersion).toBe(SCHEMA_VERSION);
    expect(g.components[0]).toMatchObject({
      id: 'FooComponent', componentId: null, docPath: null, images: [],
      className: 'FooComponent', selector: 'app-foo', module: 'M',
    });
    expect(g.edges).toEqual(edges);
    expect(g.routes).toEqual(routes);
  });
});

describe('serialize / load', () => {
  it('round-trips a graph', () => {
    const g = assembleGraph(recs, edges, routes);
    const loaded = loadGraph(serializeGraph(g));
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.components[0].id).toBe('FooComponent');
    expect(loaded.edges).toEqual(edges);
    expect(loaded.routes).toEqual(routes);
  });
  it('produces deterministic ordering (components sorted by id)', () => {
    const two = assembleGraph(
      [recs[0], { ...recs[0], className: 'AComponent', selector: 'app-a' }],
      [], [],
    );
    const ids = JSON.parse(serializeGraph(two)).components.map((c: { id: string }) => c.id);
    expect(ids).toEqual(['AComponent', 'FooComponent']);
  });
  it('rejects a mismatched schemaVersion', () => {
    expect(() => loadGraph(JSON.stringify({ schemaVersion: 999, components: [], edges: [], routes: [] }))).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/graph/assemble.test.ts`

- [ ] **Step 3: Implement `tool/src/graph/assemble.ts`**

```ts
import { SCHEMA_VERSION } from '../types.js';
import type { Graph, ComponentNode, ComponentRecord, Edge, RouteNode } from '../types.js';

// Records -> nodes. id = className (Phase 1). MD-derived fields start null/empty
// (filled by Plan 8 MdIndex). NOTE: duplicate class names across files would collide
// on id — a documented Phase 1 limitation (edges already key on className).
export function assembleGraph(records: ComponentRecord[], edges: Edge[], routes: RouteNode[]): Graph {
  const components: ComponentNode[] = records.map((r) => ({
    ...r,
    id: r.className,
    componentId: null,
    docPath: null,
    images: [],
  }));
  return { schemaVersion: SCHEMA_VERSION, components, edges, routes };
}

function edgeKey(e: Edge): string {
  return `${e.from}|${e.to}|${e.kind}|${e.reason}`;
}

// Deterministic JSON: components sorted by id, edges sorted by key; routes keep source order.
export function serializeGraph(graph: Graph): string {
  const sorted: Graph = {
    schemaVersion: graph.schemaVersion,
    components: [...graph.components].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b))),
    routes: graph.routes,
  };
  return JSON.stringify(sorted, null, 2);
}

export function loadGraph(json: string): Graph {
  const g = JSON.parse(json) as Graph;
  if (g.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`graph schemaVersion ${g.schemaVersion} != ${SCHEMA_VERSION}; rebuild required`);
  }
  return g;
}
```

- [ ] **Step 4: Run, verify PASS** (4 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/graph/assemble.ts src/graph/assemble.test.ts
git commit -m "feat(tool): graph assembler + deterministic serialize/load (schemaVersion guard)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/graph/assemble.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS; tsc clean. Covers node assembly (id + null MD fields), deterministic component ordering, round-trip, and schemaVersion-mismatch rejection.
</verify>

<done>
`assembleGraph` builds a versioned `Graph` of `ComponentNode`s; `serializeGraph`/`loadGraph` give a stable, version-guarded on-disk form.
</done>

---

### Task 11: Full-build orchestrator + write artifact

<model>sonnet</model>

<read_first>
- `tool/src/graph/assemble.ts` (T10)
- `tool/src/shared/project.ts` (createProject, addSources), `tool/src/indexer/index.ts` (indexComponents), `tool/src/edges/index.ts` (buildEdges), `tool/src/routes/index.ts` (parseRoutes)
</read_first>

**Files:**
- Create: `tool/src/graph/index.ts`
- Test: `tool/src/graph/index.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/graph/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraph, writeGraph } from './index.js';
import { loadGraph } from './assemble.js';

function repo(): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/src/x.ts', `
    import { Component, NgModule, RouterModule } from '@angular/core';
    @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
    @Component({ selector: 'app-parent', template: '<app-child></app-child>' }) export class ParentComponent {}
    @NgModule({ declarations: [ChildComponent, ParentComponent] }) export class M {}
    RouterModule.forRoot([{ path: 'p', component: ParentComponent }]);`);
  return p;
}

describe('buildGraph', () => {
  it('assembles components + edges + routes into a versioned graph', () => {
    const { graph, parseErrors } = buildGraph(repo(), { root: '/src' });
    expect(graph.components.map((c) => c.id).sort()).toEqual(['ChildComponent', 'ParentComponent']);
    expect(graph.edges).toContainEqual({ from: 'ParentComponent', to: 'ChildComponent', kind: 'resolved', via: 'template', reason: null });
    expect(graph.routes[0].fullPath).toBe('p');
    expect(parseErrors).toEqual([]);
  });
});

describe('writeGraph', () => {
  it('writes a loadable graph.json into the out dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-'));
    try {
      const { graph } = buildGraph(repo(), { root: '/src' });
      const p = writeGraph(graph, dir);
      const loaded = loadGraph(readFileSync(p, 'utf8'));
      expect(loaded.components.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/graph/index.test.ts`

- [ ] **Step 3: Implement `tool/src/graph/index.ts`**

```ts
import { Project } from 'ts-morph';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../types.js';
import { createProject, addSources } from '../shared/project.js';
import { indexComponents } from '../indexer/index.js';
import { buildEdges } from '../edges/index.js';
import { parseRoutes } from '../routes/index.js';
import { assembleGraph, serializeGraph } from './assemble.js';

export interface BuildResult {
  graph: Graph;
  parseErrors: { component: string; messages: string[] }[];
}

// Build a graph from an already-populated project (testable with in-memory projects).
export function buildGraph(project: Project, opts: { root: string }): BuildResult {
  const records = indexComponents(project, opts);
  const { edges, parseErrors } = buildEdges(project, records, opts);
  const routes = parseRoutes(project, opts);
  return { graph: assembleGraph(records, edges, routes), parseErrors };
}

// Convenience: create the project, add sources under root, then build.
export function buildGraphFromRoot(root: string): BuildResult {
  const project = createProject();
  addSources(project, root);
  return buildGraph(project, { root });
}

// Write the deterministic graph.json into `outDir` (created if missing). Returns the path.
export function writeGraph(graph: Graph, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const p = join(outDir, 'graph.json');
  writeFileSync(p, serializeGraph(graph));
  return p;
}
```

- [ ] **Step 4: Run, verify PASS** (2 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/graph/index.ts src/graph/index.test.ts
git commit -m "feat(tool): full-build orchestrator (index+edges+routes -> graph) + writeGraph"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `buildGraph` returns a Graph whose components (ChildComponent, ParentComponent), edges (Parent→Child resolved), and routes (`/p`) are all present; `writeGraph` produces a graph.json that `loadGraph` reads back.
</verify>

<done>
`buildGraph`/`buildGraphFromRoot` produce the full `Graph` end-to-end from a codebase, and `writeGraph` persists it. Plan 6 wraps this with caching; Plan 7 queries it; Plan 8 enriches nodes with MD data.
</done>

---

## Self-Review (Plan 5)

- **Spec coverage:** SAC-04 (assemble nodes+edges+routes into versioned graph.json; serialize/load), deterministic ordering (RESEARCH §8), full-build orchestrator (spec §7). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `assembleGraph(records, edges, routes)` → `Graph`; `ComponentNode` = `ComponentRecord` + {id, componentId, docPath, images}; `buildGraph(project, {root})` composes Plan 2/3/4 signatures exactly (`indexComponents(project,{root})`, `buildEdges(project,records,{root})` returns `{edges,parseErrors}`, `parseRoutes(project,{root})`); `loadGraph`/`serializeGraph` symmetric. NodeNext `.js` imports. ✓
- **Known limitation (noted):** node id = className; cross-file class-name collisions not qualified (deferred; edges key on className). ✓
- **Verify bounds:** both tasks <60s. ✓
