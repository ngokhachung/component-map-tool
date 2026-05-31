# M4 — Plan 1: Waiver field (schema + gaps + merge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `waived` marker to the override schema so a truly-dynamic dependency (no static target) can be declared "intentionally dynamic" — counting as **covered** (no gap) and producing no edge/warning.

**Architecture:** One task, three small surgical edits to the existing overrides layer + one new self-contained test file. `DynamicDep` gains optional `waived?: boolean`; `gaps.coveredReasons` treats a waived entry as covered; `merge.applyOverrides` skips waived entries silently. **No schema-version bump** — `waived?` is an optional additive field (backward/forward compatible); bumping to v2 would force `readOverrides` to accept a version set and churn existing v1 files/tests for no benefit (YAGNI; deviation from spec §4 flagged for approval).

**Tech Stack:** TS/Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "validate() still accepts an override whose dynamicDeps entry has `waived: true` and no/empty target."
    - "findGaps() does NOT report a construct whose override entry (matched by reason) is `waived: true`."
    - "applyOverrides() adds no edge and emits no warning for a `waived: true` entry."
    - "All existing override tests + the M3 integration test still pass (v1 files unaffected); `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/overrides/schema.ts (DynamicDep.waived?: boolean)"
    - "tool/src/overrides/gaps.ts (coveredReasons counts waived)"
    - "tool/src/overrides/merge.ts (skip waived)"
    - "tool/src/overrides/waiver.test.ts (new, self-contained)"
  required_wiring:
    - "lint (Plan 2) computeIssues relies on findGaps already excluding waived; merge skip keeps the graph clean."
  key_links:
    - "waived ⇒ covered (no gap) → escape hatch 'intentionally dynamic, no static target' (spec §4, ENF-02)"
    - "optional additive field, no version bump → v1 files keep working (deviation from spec §4 schema-bump, flagged)"
```

---

## File Structure

- `tool/src/overrides/schema.ts` — add the optional field to the contract.
- `tool/src/overrides/gaps.ts` — a waived entry covers its construct.
- `tool/src/overrides/merge.ts` — a waived entry yields no edge.
- `tool/src/overrides/waiver.test.ts` — new, self-contained tests for the three behaviors.

---

## Wave 1: Waiver field

### Task 1: Waiver across schema + gaps + merge

<model>sonnet</model>

<read_first>
- `tool/src/overrides/schema.ts`, `tool/src/overrides/gaps.ts` (`coveredReasons`), `tool/src/overrides/merge.ts` (`applyOverrides`)
- `docs/specs/2026-05-31-phase2b-md-migration-enforcement-design.md` §4 (waiver), ENF-02
</read_first>

**Files:**
- Modify: `tool/src/overrides/schema.ts`
- Modify: `tool/src/overrides/gaps.ts`
- Modify: `tool/src/overrides/merge.ts`
- Create: `tool/src/overrides/waiver.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/overrides/waiver.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { validate } from './schema.js';
import { findGaps } from './gaps.js';
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

describe('waiver', () => {
  it('validate accepts a waived entry with no/empty target', () => {
    const r = validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: '', reason: 'ngComponentOutlet', waived: true }] });
    expect(r.ok).toBe(true);
  });

  it('findGaps does not report a construct covered by a waived entry', () => {
    const g = graph(
      [node('HostComponent', 'C1')],
      [{ from: 'HostComponent', to: null, kind: 'unresolved-static', via: 'template', reason: 'ngComponentOutlet' }],
    );
    const gaps = findGaps(g, ov('C1', [{ target: '', reason: 'ngComponentOutlet', waived: true }]));
    expect(gaps).toEqual([]);
  });

  it('applyOverrides adds no edge and no warning for a waived entry', () => {
    const g = graph([node('HostComponent', 'C1'), node('WidgetComponent', null)]);
    const { warnings } = applyOverrides(g, ov('C1', [{ target: 'WidgetComponent', reason: 'ngComponentOutlet', waived: true }]));
    expect(g.edges).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/overrides/waiver.test.ts`
Expected: the `findGaps` test fails (waived still treated as a gap) and/or `applyOverrides` adds an edge.

- [ ] **Step 3: Edit `tool/src/overrides/schema.ts`** — add the optional field to `DynamicDep`:

```ts
export interface DynamicDep {
  target: string;
  reason?: string;
  stale?: boolean;
  waived?: boolean;   // intentionally dynamic — no static target; counts as covered, yields no edge
}
```

(Leave `OVERRIDE_SCHEMA_VERSION = 1` and `validate` unchanged — `waived` is optional and additive.)

- [ ] **Step 4: Edit `tool/src/overrides/gaps.ts`** — in `coveredReasons`, count a waived entry as covered. Replace the loop body:

```ts
function coveredReasons(ov: CmapOverride | undefined): Set<string> {
  const covered = new Set<string>();
  if (ov) for (const d of ov.dynamicDeps) if (!d.stale && d.reason && (d.target.trim() || d.waived)) covered.add(d.reason);
  return covered;
}
```

- [ ] **Step 5: Edit `tool/src/overrides/merge.ts`** — skip waived entries. Change the skip guard inside the `for (const dep of ov.dynamicDeps)` loop:

```ts
      if (dep.stale || dep.waived || dep.target.trim().length === 0) continue;
```

- [ ] **Step 6: Run, verify PASS** (3 tests). `cd tool && npx vitest run src/overrides/waiver.test.ts`

- [ ] **Step 7: Run the whole suite + typecheck** (regression — v1 files, gaps, merge, integration):

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS (110 + 3 new), tsc clean.

- [ ] **Step 8: Commit**

```bash
cd tool && git add src/overrides/schema.ts src/overrides/gaps.ts src/overrides/merge.ts src/overrides/waiver.test.ts
git commit -m "feat(tool): waiver field — waived dynamic dep counts as covered, no edge (ENF-02)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `waived: true` ⇒ no gap (findGaps), no edge + no warning (applyOverrides); existing v1 overrides unaffected.
</verify>

<done>
A dynamic dep can be declared `waived: true` (escape hatch #1). Lint (Plan 2) gets gap-exclusion for free via `findGaps`; the graph stays clean via `applyOverrides`.
</done>

---

## Self-Review (Plan 1)

- **Spec coverage:** ENF-02 (waiver in schema; gaps + merge treat waived as covered). ✓ Schema-version bump intentionally omitted (additive optional field) — flagged in goal/architecture for user approval.
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `DynamicDep.waived?: boolean` reused by `coveredReasons` (gaps) + the merge skip-guard; test node literal includes all `ComponentNode` fields incl. `description`; `Edge` literal uses `kind:'unresolved-static'`, `via:'template'`, `reason` (matches `types.ts`). NodeNext `.js` imports. ✓
- **Verify bounds:** single task <60s. ✓
