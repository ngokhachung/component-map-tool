# M4 — Plan 5: Integration + coverage gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove the whole M4 enforcement story end-to-end on real Angular 15 source (`poc/real-sample`): missing-MD is new debt without a baseline and grandfathered after accept, and a waiver closes a real `ngComponentOutlet` gap — then confirm the suite still meets the ≥80% coverage gate.

**Architecture:** One task, one integration test built on the real-sample graph (`buildIncremental`), composing `computeIssues`/`lintChanged` (Plan 2), `acceptInto`/`emptyBaseline` (Plan 2), and the Plan 1 waiver. No new production code.

**Tech Stack:** TS/Node ESM, vitest (+ v8 coverage thresholds already configured ≥80%).

---

```yaml
must_haves:
  observable_truths:
    - "On real-sample (no MD docs), lintChanged for a changed component with an empty baseline blocks (missing-md is new debt); with a baseline snapshotted from computeIssues it passes (grandfathered)."
    - "real-sample has a real ngComponentOutlet unresolved-static edge; after assigning its host a componentId, computeIssues reports gap:ngComponentOutlet; adding a waived override removes that gap code."
    - "`npm run test:cov` passes the configured ≥80% thresholds; `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/cli/lint-integration.test.ts"
  required_wiring:
    - "Closes the M4 loop: migration snapshot → grandfather → waiver escape hatch, all on real v15 source."
  key_links:
    - "real source catches what synthetic unit tests miss (the M2/M3 pattern) → confidence the gate behaves on real code"
    - "coverage gate ≥80% → quality bar held (spec §10)"
```

---

## File Structure

- `tool/src/cli/lint-integration.test.ts` — end-to-end M4 behavior on `poc/real-sample`.

---

## Wave 5: Integration + coverage

### Task 7: End-to-end enforcement on real-sample + coverage gate

<model>sonnet</model>

<read_first>
- `tool/src/cli/lint.ts` (`computeIssues`, `lintChanged`), `tool/src/cli/baseline.ts` (`emptyBaseline`, `acceptInto`), `tool/src/cache/index.ts` (`buildIncremental` signature `{graph, parseErrors, fromCache}`)
- `tool/src/overrides/integration.test.ts` (the M3 real-sample test, for the build pattern), spec §8/§10
</read_first>

**Files:**
- Create: `tool/src/cli/lint-integration.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/lint-integration.test.ts`

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIncremental } from '../cache/index.js';
import { computeIssues, lintChanged } from './lint.js';
import { emptyBaseline, acceptInto } from './baseline.js';
import type { CmapOverride } from '../overrides/schema.js';

const ROOT = '../poc/real-sample/src';
const work = mkdtempSync(join(tmpdir(), 'cmap-int-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('M4 enforcement on real Angular 15 (real-sample)', () => {
  it('missing-md blocks without a baseline, passes after accept', () => {
    const { graph } = buildIncremental(ROOT, join(work, 'a'));
    const changed = graph.components[0].filePath;          // any real component file
    expect(lintChanged(graph, new Map(), [changed], emptyBaseline()).ok).toBe(false);

    const baseline = acceptInto(emptyBaseline(), computeIssues(graph, new Map()));
    expect(lintChanged(graph, new Map(), [changed], baseline).ok).toBe(true);
  });

  it('a waiver closes a real ngComponentOutlet gap', () => {
    const { graph } = buildIncremental(ROOT, join(work, 'b'));
    const edge = graph.edges.find((e) => e.kind === 'unresolved-static' && e.reason === 'ngComponentOutlet');
    expect(edge).toBeDefined();
    const host = graph.components.find((c) => c.id === edge!.from)!;
    host.componentId = 'RD1';                              // simulate a project MD giving it an id

    expect(computeIssues(graph, new Map()).get(host.filePath)).toContain('gap:ngComponentOutlet');

    const waived: Map<string, CmapOverride> = new Map([
      ['RD1', { schemaVersion: 1, componentId: 'RD1', dynamicDeps: [{ target: '', reason: 'ngComponentOutlet', waived: true }] }],
    ]);
    expect(computeIssues(graph, waived).get(host.filePath) ?? []).not.toContain('gap:ngComponentOutlet');
  });
});
```

- [ ] **Step 2: Run, verify it runs (and PASSES — exercises shipped code).**

Run: `cd tool && npx vitest run src/cli/lint-integration.test.ts`
Expected: 2 PASS. (If `graph.components[0]` happens to already be clean in a future fixture change, the first assertion still holds because real-sample has no MD docs → every component carries `missing-md`.)

- [ ] **Step 3: Run the full suite + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 4: Run the coverage gate**

Run: `cd tool && npm run test:cov`
Expected: exit 0 — v8 coverage meets the configured ≥80% thresholds (lines/functions/statements). If any new file (`baseline.ts`/`lint.ts`/`migrate.ts`) drops a metric below threshold, add a focused unit test for the uncovered branch and re-run.

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/cli/lint-integration.test.ts
git commit -m "test(tool): end-to-end M4 enforcement on real-sample (missing-md grandfather + waiver) (ENF-01/02)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm run test:cov && npx tsc --noEmit`
Expected: green + ≥80% coverage + clean. On real v15 source: missing-md is new debt → grandfathered after accept; a real `ngComponentOutlet` gap is closed by a waiver.
</verify>

<done>
The M4 loop is proven on real Angular 15 source and the coverage gate holds. Ready for STEP 8 (UAT/verification) → STEP 9 (QA) → ship.
</done>

---

## Self-Review (Plan 5)

- **Spec coverage:** §8 (integration on real-sample), §10 (coverage gate ≥80%), reinforces ENF-01 (grandfather) + ENF-02 (waiver) on real code. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `buildIncremental(root, out)` → `{graph}` (matches `cli/index.ts` usage); `computeIssues`/`lintChanged`/`emptyBaseline`/`acceptInto` from Plans 2; `CmapOverride` literal includes `schemaVersion/componentId/dynamicDeps` with a `waived` dep (Plan 1); edge match `kind:'unresolved-static' && reason==='ngComponentOutlet'` matches `types.ts` + M3 real-sample. NodeNext `.js` imports. ✓
- **Verify bounds:** single task <60s. ✓
