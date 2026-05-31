# M3 — Plan 3: Gaps Report + Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tell the user which components still have undocumented dynamic deps (`findGaps`) and **scaffold/update** their `.cmap.yaml` skeletons (`scaffoldGaps`) — pre-filled with the detected constructs, **merge-safe** (never clobber a filled `target`).

**Architecture:** One task, `tool/src/overrides/gaps.ts`. A construct = an `unresolved-static`/`indirect` edge's stable `reason` label (the edge builder emits fixed kind labels — `ng-content`, `ngTemplateOutlet`, `ngComponentOutlet`, `@ViewChild query`, `createComponent` — so `reason` IS a stable construct identity here, reconciling RESEARCH §7's "don't key on free-text"). `findGaps` reports uncovered constructs; `scaffoldGaps` writes per-component YAML keyed by that reason, preserving filled targets, marking vanished constructs `stale`.

**Tech Stack:** `js-yaml` dump, TS/Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "findGaps(graph, overrides) returns components whose unresolved-static/indirect construct reasons are NOT covered by a non-stale, filled override entry; a covered or construct-free component is omitted."
    - "scaffoldGaps writes docs/component-map/<componentId>.cmap.yaml with one dynamicDeps entry per detected construct (reason set, target:''); PRESERVES an existing filled target; marks a construct that disappeared stale:true; idempotent (stable order, LF)."
    - "A component with dynamic deps but no componentId is skipped with a warning (cannot name/scaffold)."
    - "`npm test` + `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/overrides/gaps.ts — GapComponent, findGaps, scaffoldGaps"
    - "tool/src/overrides/gaps.test.ts"
  required_wiring:
    - "CLI (Plan 4) exposes `cmap gaps` (findGaps) + `cmap gaps --write` (scaffoldGaps) after building+overriding the graph."
  key_links:
    - "construct identity = edge.reason (fixed kind label, stable) → scaffold re-run won't orphan filled targets (RESEARCH §7)"
    - "preserve filled target + stale-mark + LF/idempotent (OVR-04)"
```

---

## File Structure

- `tool/src/overrides/gaps.ts` — gap detection + scaffolding. One responsibility: what's undocumented + writing the skeletons.
- Test alongside.

---

## Wave: Gaps + Scaffold

### Task 5: `findGaps` + `scaffoldGaps`

<model>opus</model>

<read_first>
- `tool/src/types.ts` (Graph, Edge), `tool/src/overrides/schema.ts` (CmapOverride, DynamicDep, OVERRIDE_SCHEMA_VERSION)
- `.planning/phase2-RESEARCH.md` §7 (construct-identity key, preserve filled, LF/idempotent)
- `docs/specs/2026-05-31-phase2-md-overrides-pr-bot-design.md` §7
</read_first>

**Files:**
- Create: `tool/src/overrides/gaps.ts`
- Test: `tool/src/overrides/gaps.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/overrides/gaps.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { findGaps, scaffoldGaps } from './gaps.js';
import type { Graph, ComponentNode, Edge } from '../types.js';
import type { CmapOverride } from './schema.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function unresolved(from: string, reason: string): Edge {
  return { from, to: null, kind: 'unresolved-static', via: 'template', reason };
}
function graph(components: ComponentNode[], edges: Edge[]): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}

describe('findGaps', () => {
  it('reports components with uncovered dynamic-construct reasons', () => {
    const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
    const gaps = findGaps(g, new Map());
    expect(gaps).toEqual([{ id: 'HostComponent', componentId: 'C1', filePath: 'src/HostComponent.ts', uncovered: ['ngComponentOutlet'] }]);
  });
  it('omits a component whose constructs are all covered by a filled override entry', () => {
    const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
    const ov = new Map<string, CmapOverride>([['C1', { schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: 'WidgetComponent', reason: 'ngComponentOutlet' }] }]]);
    expect(findGaps(g, ov)).toEqual([]);
  });
  it('omits components with no dynamic constructs', () => {
    const g = graph([node('Plain', 'C2')], [{ from: 'Plain', to: 'X', kind: 'resolved', via: 'template', reason: null }]);
    expect(findGaps(g, new Map())).toEqual([]);
  });
});

describe('scaffoldGaps', () => {
  it('writes a skeleton with an empty target per construct', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-sc-'));
    try {
      const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
      const { written } = scaffoldGaps(g, new Map(), dir);
      expect(written).toEqual(['C1.cmap.yaml']);
      const doc = yaml.load(readFileSync(join(dir, 'C1.cmap.yaml'), 'utf8')) as CmapOverride;
      expect(doc).toMatchObject({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: '', reason: 'ngComponentOutlet' }] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('preserves an already-filled target (merge-safe) and marks a vanished construct stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-sc-'));
    try {
      const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
      const existing = new Map<string, CmapOverride>([['C1', { schemaVersion: 1, componentId: 'C1', dynamicDeps: [
        { target: 'WidgetComponent', reason: 'ngComponentOutlet' },   // filled — must be kept
        { target: 'OldComponent', reason: 'createComponent' },        // construct gone — must go stale
      ] }]]);
      scaffoldGaps(g, existing, dir);
      const doc = yaml.load(readFileSync(join(dir, 'C1.cmap.yaml'), 'utf8')) as CmapOverride;
      expect(doc.dynamicDeps).toContainEqual({ target: 'WidgetComponent', reason: 'ngComponentOutlet' });
      expect(doc.dynamicDeps).toContainEqual({ target: 'OldComponent', reason: 'createComponent', stale: true });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('skips (with warning) a component that has dynamic deps but no componentId', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-sc-'));
    try {
      const g = graph([node('NoIdComponent', null)], [unresolved('NoIdComponent', 'ngComponentOutlet')]);
      const { written, warnings } = scaffoldGaps(g, new Map(), dir);
      expect(written).toEqual([]);
      expect(warnings.some((w) => w.includes('NoIdComponent') && w.toLowerCase().includes('componentid'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/overrides/gaps.test.ts`

- [ ] **Step 3: Implement `tool/src/overrides/gaps.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { Graph } from '../types.js';
import { OVERRIDE_SCHEMA_VERSION, type CmapOverride, type DynamicDep } from './schema.js';

export interface GapComponent {
  id: string;
  componentId: string | null;
  filePath: string;
  uncovered: string[]; // distinct construct reasons not covered by an override
}

// node.id -> sorted distinct construct reasons (unresolved-static / indirect edges).
function constructsByComponent(graph: Graph): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.kind !== 'resolved' && e.reason) {
      const s = m.get(e.from) ?? new Set<string>();
      s.add(e.reason);
      m.set(e.from, s);
    }
  }
  return new Map([...m].map(([k, s]) => [k, [...s].sort()]));
}

function coveredReasons(ov: CmapOverride | undefined): Set<string> {
  const covered = new Set<string>();
  if (ov) for (const d of ov.dynamicDeps) if (!d.stale && d.target.trim() && d.reason) covered.add(d.reason);
  return covered;
}

export function findGaps(graph: Graph, overrides: Map<string, CmapOverride>): GapComponent[] {
  const constructs = constructsByComponent(graph);
  const gaps: GapComponent[] = [];
  for (const node of graph.components) {
    const reasons = constructs.get(node.id);
    if (!reasons) continue;
    const covered = coveredReasons(node.componentId ? overrides.get(node.componentId) : undefined);
    const uncovered = reasons.filter((r) => !covered.has(r));
    if (uncovered.length) gaps.push({ id: node.id, componentId: node.componentId, filePath: node.filePath, uncovered });
  }
  return gaps;
}

// Scaffold/update <componentId>.cmap.yaml for every component with dynamic constructs.
// Merge-safe: keep existing entries (preserving filled targets) by construct reason; add new
// constructs with target:''; mark entries whose construct disappeared stale:true. Idempotent.
export function scaffoldGaps(
  graph: Graph,
  overrides: Map<string, CmapOverride>,
  docsDir: string,
): { written: string[]; warnings: string[] } {
  const constructs = constructsByComponent(graph);
  const written: string[] = [];
  const warnings: string[] = [];
  mkdirSync(docsDir, { recursive: true });

  for (const node of graph.components) {
    const reasons = constructs.get(node.id);
    if (!reasons) continue;
    if (!node.componentId) {
      warnings.push(`${node.id} has dynamic deps but no componentId (add project MD first) — cannot scaffold`);
      continue;
    }
    const existing = overrides.get(node.componentId);
    const byReason = new Map<string, DynamicDep>();
    if (existing) for (const d of existing.dynamicDeps) if (d.reason) byReason.set(d.reason, d);

    const deps: DynamicDep[] = [];
    for (const reason of reasons) {
      const prev = byReason.get(reason);
      deps.push(prev ? { target: prev.target, reason } : { target: '', reason });
      byReason.delete(reason);
    }
    // existing entries whose construct no longer exists -> keep, flagged stale
    for (const [reason, prev] of byReason) deps.push({ target: prev.target, reason, stale: true });

    const doc: CmapOverride = { schemaVersion: OVERRIDE_SCHEMA_VERSION, componentId: node.componentId, dynamicDeps: deps };
    const body = yaml.dump(doc, { lineWidth: -1, sortKeys: false }); // js-yaml emits LF
    writeFileSync(join(docsDir, `${node.componentId}.cmap.yaml`), body);
    written.push(`${node.componentId}.cmap.yaml`);
  }
  return { written, warnings };
}
```

- [ ] **Step 4: Run, verify PASS** (6 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/overrides/gaps.ts src/overrides/gaps.test.ts
git commit -m "feat(tool): findGaps + merge-safe scaffoldGaps (.cmap.yaml skeletons) (OVR-03/04)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `findGaps` reports uncovered constructs (omits covered/construct-free); `scaffoldGaps` writes skeletons, **preserves a filled target**, marks a vanished construct `stale:true`, and skips (warns) a componentId-less component.
</verify>

<done>
`findGaps`/`scaffoldGaps` drive the "tool tells you what to document, scaffolds the skeleton, you fill `target`" loop — merge-safe and idempotent. Plan 4 wires `cmap gaps [--write]`.
</done>

---

## Self-Review (Plan 3)

- **Spec coverage:** OVR-03 (findGaps: uncovered constructs, omit complete), OVR-04 (scaffoldGaps: per-construct skeleton, preserve filled, stale-mark, idempotent LF, skip no-componentId). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `GapComponent` shape matches the test; `findGaps(graph, Map<componentId,CmapOverride>)`/`scaffoldGaps(graph, overrides, docsDir)`; reuses `CmapOverride`/`DynamicDep`/`OVERRIDE_SCHEMA_VERSION` (Plan 2) + `ComponentNode.description` (Plan 1) in the node literal; construct identity = edge `reason` (stable kind labels). `js-yaml` default import + `dump`. NodeNext `.js`. ✓
- **Verify bounds:** <60s. ✓
