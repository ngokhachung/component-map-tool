# M3 — Plan 2: Overrides Core (schema + parse + merge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Read tool-owned `.cmap.yaml` override files (tolerantly) and merge their documented dynamic-dep targets into the graph as `via:'override'` edges — closing the `unresolved-static` gaps — with stale-skip, locator resolution, dedup, and a cycle warning.

**Architecture:** Two tasks. T3 = `schema.ts` (`CmapOverride` + `validate`) + `parse.ts` (`readOverrides(dir)` via `js-yaml`, per-file try/catch, skip unknown schemaVersion, dup-id warn). T4 = `merge.ts` (`applyOverrides(graph, overrides)`: resolve targets via the SAC-08 locator, add `via:'override'` edges, skip `stale`/empty, dedup, cycle-warn).

**Tech Stack:** `js-yaml` (4.x, safe `load`), TS/Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "validate() accepts a well-formed CmapOverride and rejects missing componentId / non-array dynamicDeps with errors."
    - "readOverrides reads *.cmap.yaml from a dir into Map<componentId, CmapOverride>; malformed YAML → warning+skip (per file, not fatal); unknown schemaVersion → skip+warn; duplicate componentId → warn."
    - "applyOverrides adds a resolved `via:'override'` edge per non-stale, non-empty, locator-resolvable target; skips stale/empty; warns on unresolvable target; dedups; warns when an override edge closes a cycle."
    - "`npm test` + `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/overrides/schema.ts (CmapOverride, DynamicDep, OVERRIDE_SCHEMA_VERSION, validate)"
    - "tool/src/overrides/parse.ts (readOverrides)"
    - "tool/src/overrides/merge.ts (applyOverrides)"
    - "tests for each"
  required_wiring:
    - "Gaps (Plan 3) consumes the same schema; CLI (Plan 4) calls readOverrides + applyOverrides after enrichGraph then writeGraph."
  key_links:
    - "js-yaml load() safe-by-default + per-file try/catch → tolerant (RESEARCH §5, OVR-01)"
    - "skip stale + cycle-warn → sound merge (RESEARCH §6, OVR-02)"
    - "target via SAC-08 locator → consistent resolution + ambiguity reporting"
```

---

## File Structure

- `tool/src/overrides/schema.ts` — the override type + pure validation. One responsibility: the override contract.
- `tool/src/overrides/parse.ts` — read + parse the docs dir. One responsibility: dir → validated overrides + warnings.
- `tool/src/overrides/merge.ts` — apply overrides to a graph. One responsibility: graph mutation from overrides.
- Tests alongside.

---

## Wave: Overrides Core

### Task 3: Override schema + parser

<model>opus</model>

<read_first>
- `tool/src/types.ts`; `docs/specs/2026-05-31-phase2-md-overrides-pr-bot-design.md` §5 (CmapOverride) + OVR-01
- `.planning/phase2-RESEARCH.md` §5 (js-yaml load safe, per-file try/catch, hand-validate)
</read_first>

**Files:**
- Create: `tool/src/overrides/schema.ts`
- Test: `tool/src/overrides/schema.test.ts`
- Create: `tool/src/overrides/parse.ts`
- Test: `tool/src/overrides/parse.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/overrides/schema.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { validate } from './schema.js';

describe('validate', () => {
  it('accepts a well-formed override', () => {
    const r = validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: 'FooComponent', reason: 'x' }] });
    expect(r.ok).toBe(true);
  });
  it('rejects missing componentId and non-array dynamicDeps', () => {
    expect(validate({ schemaVersion: 1, dynamicDeps: [] }).ok).toBe(false);
    expect(validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: 'no' }).ok).toBe(false);
  });
  it('rejects a dynamicDeps entry whose target is not a string', () => {
    const r = validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ reason: 'x' }] });
    expect(r.ok).toBe(false);
  });
  it('rejects a non-object', () => {
    expect(validate('nope').ok).toBe(false);
    expect(validate(null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/overrides/schema.test.ts`

- [ ] **Step 3: Implement `tool/src/overrides/schema.ts`**

```ts
export const OVERRIDE_SCHEMA_VERSION = 1;

export interface DynamicDep {
  target: string;        // className | selector | componentId (resolved via the locator)
  reason?: string;
  stale?: boolean;       // marked by `gaps --write` when the construct disappeared
}
export interface CmapOverride {
  schemaVersion: number;
  componentId: string;
  dynamicDeps: DynamicDep[];
  notes?: string[];
}

export type ValidateResult =
  | { ok: true; value: CmapOverride }
  | { ok: false; errors: string[] };

export function validate(parsed: unknown): ValidateResult {
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, errors: ['not an object'] };
  const o = parsed as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.schemaVersion !== 'number') errors.push('schemaVersion must be a number');
  if (typeof o.componentId !== 'string' || o.componentId.length === 0) errors.push('componentId must be a non-empty string');
  if (!Array.isArray(o.dynamicDeps)) {
    errors.push('dynamicDeps must be an array');
  } else {
    o.dynamicDeps.forEach((d, i) => {
      if (typeof d !== 'object' || d === null || typeof (d as Record<string, unknown>).target !== 'string') {
        errors.push(`dynamicDeps[${i}].target must be a string`);
      }
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: parsed as CmapOverride };
}
```

- [ ] **Step 4: Run, verify PASS** (4 tests).

- [ ] **Step 5: Write the failing test** — `tool/src/overrides/parse.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOverrides } from './parse.js';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-ov-')); }

describe('readOverrides', () => {
  it('reads *.cmap.yaml into a map keyed by componentId', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, 'C1.cmap.yaml'), 'schemaVersion: 1\ncomponentId: C1\ndynamicDeps:\n  - target: FooComponent\n    reason: dialog\n');
      const { overrides, warnings } = readOverrides(d);
      expect(overrides.get('C1')?.dynamicDeps[0].target).toBe('FooComponent');
      expect(warnings).toEqual([]);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it('warns + skips malformed YAML, unknown schemaVersion, and duplicate componentId', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, 'bad.cmap.yaml'), 'schemaVersion: 1\ncomponentId: [unclosed\n');
      writeFileSync(join(d, 'future.cmap.yaml'), 'schemaVersion: 99\ncomponentId: C9\ndynamicDeps: []\n');
      writeFileSync(join(d, 'a.cmap.yaml'), 'schemaVersion: 1\ncomponentId: DUP\ndynamicDeps: []\n');
      writeFileSync(join(d, 'b.cmap.yaml'), 'schemaVersion: 1\ncomponentId: DUP\ndynamicDeps: []\n');
      const { overrides, warnings } = readOverrides(d);
      expect(overrides.has('C9')).toBe(false);
      expect(overrides.has('DUP')).toBe(true);
      expect(warnings.some((w) => w.toLowerCase().includes('yaml'))).toBe(true);
      expect(warnings.some((w) => w.includes('schemaVersion'))).toBe(true);
      expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it('returns empty for a missing dir', () => {
    expect(readOverrides('/no/such/dir').overrides.size).toBe(0);
  });
});
```

- [ ] **Step 6: Run, verify FAIL.** `cd tool && npx vitest run src/overrides/parse.test.ts`

- [ ] **Step 7: Implement `tool/src/overrides/parse.ts`**

```ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import { validate, OVERRIDE_SCHEMA_VERSION, type CmapOverride } from './schema.js';

function walk(dir: string, acc: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith('.cmap.yaml')) acc.push(full);
  }
}

export function readOverrides(dir: string): { overrides: Map<string, CmapOverride>; warnings: string[] } {
  const overrides = new Map<string, CmapOverride>();
  const warnings: string[] = [];
  if (!existsSync(dir)) return { overrides, warnings };
  const files: string[] = [];
  walk(dir, files);
  for (const f of files.sort()) {
    const rel = relative(dir, f).replace(/\\/g, '/');
    let parsed: unknown;
    try {
      parsed = yaml.load(readFileSync(f, 'utf8'));
    } catch {
      warnings.push(`${rel}: YAML parse error — skipped`);
      continue;
    }
    const v = validate(parsed);
    if (!v.ok) { warnings.push(`${rel}: invalid override — ${v.errors.join('; ')}`); continue; }
    if (v.value.schemaVersion !== OVERRIDE_SCHEMA_VERSION) {
      warnings.push(`${rel}: unknown schemaVersion ${v.value.schemaVersion} — skipped`);
      continue;
    }
    if (overrides.has(v.value.componentId)) {
      warnings.push(`${rel}: duplicate override componentId ${v.value.componentId} — kept first`);
      continue;
    }
    overrides.set(v.value.componentId, v.value);
  }
  return { overrides, warnings };
}
```

- [ ] **Step 8: Run, verify PASS** (3 tests).

- [ ] **Step 9: Commit**

```bash
cd tool && git add src/overrides/schema.ts src/overrides/schema.test.ts src/overrides/parse.ts src/overrides/parse.test.ts
git commit -m "feat(tool): override schema + tolerant .cmap.yaml parser (js-yaml, OVR-01)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/overrides/ && npx tsc --noEmit`
Expected: 7 tests PASS; tsc clean. `validate` enforces the shape; `readOverrides` maps by componentId and tolerantly warns+skips malformed/unknown-version/duplicate.
</verify>

<done>
`.cmap.yaml` overrides parse into a validated `Map<componentId, CmapOverride>` with non-fatal warnings. Merge (T4) consumes this map.
</done>

---

### Task 4: Apply overrides into the graph

<model>opus</model>

<read_first>
- `tool/src/overrides/schema.ts` (CmapOverride), `tool/src/query/locator.ts` (resolveLocator), `tool/src/types.ts` (Graph, Edge)
- `.planning/phase2-RESEARCH.md` §6 (skip stale, cycle-warn)
</read_first>

**Files:**
- Create: `tool/src/overrides/merge.ts`
- Test: `tool/src/overrides/merge.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/overrides/merge.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyOverrides } from './merge.js';
import type { Graph, ComponentNode } from '../types.js';
import type { CmapOverride } from './schema.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function graph(components: ComponentNode[], edges: Graph['edges'] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
function ov(componentId: string, deps: CmapOverride['dynamicDeps']): Map<string, CmapOverride> {
  return new Map([[componentId, { schemaVersion: 1, componentId, dynamicDeps: deps }]]);
}

describe('applyOverrides', () => {
  it('adds a resolved via:override edge for a resolvable target', () => {
    const g = graph([node('HostComponent', 'C1'), node('WidgetComponent', null)]);
    const { warnings } = applyOverrides(g, ov('C1', [{ target: 'WidgetComponent', reason: 'ngComponentOutlet' }]));
    expect(g.edges).toContainEqual({ from: 'HostComponent', to: 'WidgetComponent', kind: 'resolved', via: 'override', reason: 'ngComponentOutlet' });
    expect(warnings).toEqual([]);
  });
  it('skips stale and empty-target entries', () => {
    const g = graph([node('HostComponent', 'C1'), node('WidgetComponent', null)]);
    applyOverrides(g, ov('C1', [{ target: 'WidgetComponent', stale: true }, { target: '   ' }]));
    expect(g.edges).toEqual([]);
  });
  it('warns on an unresolvable target', () => {
    const g = graph([node('HostComponent', 'C1')]);
    const { warnings } = applyOverrides(g, ov('C1', [{ target: 'NoSuchComponent' }]));
    expect(g.edges).toEqual([]);
    expect(warnings.some((w) => w.includes('NoSuchComponent'))).toBe(true);
  });
  it('warns when an override edge closes a cycle', () => {
    const g = graph(
      [node('A', 'CA'), node('B', null)],
      [{ from: 'B', to: 'A', kind: 'resolved', via: 'template', reason: null }],
    );
    const { warnings } = applyOverrides(g, ov('CA', [{ target: 'B' }]));
    expect(warnings.some((w) => w.toLowerCase().includes('cycle'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/overrides/merge.test.ts`

- [ ] **Step 3: Implement `tool/src/overrides/merge.ts`**

```ts
import type { Graph, Edge } from '../types.js';
import type { CmapOverride } from './schema.js';
import { resolveLocator } from '../query/locator.js';

function reaches(graph: Graph, start: string, target: string): boolean {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind === 'resolved' && e.to) {
      const a = adj.get(e.from);
      if (a) a.push(e.to); else adj.set(e.from, [e.to]);
    }
  }
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const n = stack.pop() as string;
    if (n === target) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const c of adj.get(n) ?? []) stack.push(c);
  }
  return false;
}

// Add `via:'override'` resolved edges from documented dynamic deps. Mutates graph.edges.
export function applyOverrides(graph: Graph, overrides: Map<string, CmapOverride>): { warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set(graph.edges.map((e) => `${e.from}|${e.to}|${e.kind}|${e.reason}`));
  const added: Edge[] = [];

  for (const node of graph.components) {
    if (!node.componentId) continue;
    const ov = overrides.get(node.componentId);
    if (!ov) continue;
    for (const dep of ov.dynamicDeps) {
      if (dep.stale || dep.target.trim().length === 0) continue;
      const r = resolveLocator(graph, dep.target);
      if (!r.ok) { warnings.push(`override ${node.componentId}: target "${dep.target}" ${r.reason}`); continue; }
      const edge: Edge = { from: node.id, to: r.node.id, kind: 'resolved', via: 'override', reason: dep.reason ?? 'documented dynamic dependency' };
      const key = `${edge.from}|${edge.to}|${edge.kind}|${edge.reason}`;
      if (!seen.has(key)) { seen.add(key); added.push(edge); graph.edges.push(edge); }
    }
  }
  for (const e of added) {
    if (e.to && reaches(graph, e.to, e.from)) {
      warnings.push(`override edge ${e.from}→${e.to} introduces a cycle`);
    }
  }
  return { warnings };
}
```

- [ ] **Step 4: Run, verify PASS** (4 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/overrides/merge.ts src/overrides/merge.test.ts
git commit -m "feat(tool): applyOverrides — via:override edges, skip stale, cycle-warn (OVR-02)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. A resolvable, non-stale target adds one `via:'override'` resolved edge; stale/empty skipped; unresolvable → warning; a cycle-closing override → warning.
</verify>

<done>
`applyOverrides` patches documented dynamic deps into the graph as `via:'override'` edges (feeding impact + access-path), tolerantly and cycle-aware. Plan 4 wires it into the build; Plan 3 reports/scaffolds the gaps it covers.
</done>

---

## Self-Review (Plan 2)

- **Spec coverage:** OVR-01 (schema + tolerant parser), OVR-02 (merge: locator-resolved `via:'override'` edges, skip stale, dedup, cycle-warn, unresolvable/duplicate warnings). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `CmapOverride`/`DynamicDep` in schema.ts reused by parse + merge; `applyOverrides(graph, Map<componentId, CmapOverride>)`; `Edge.via:'override'` (from Plan 1); `resolveLocator` result `{ok,node}|{ok:false,reason}` consumed correctly; node literal in tests includes `description` (Plan 1). `js-yaml` default import (esModuleInterop). NodeNext `.js`. ✓
- **Verify bounds:** both tasks <60s. ✓
