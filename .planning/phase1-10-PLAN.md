# Phase 1 — Plan 10: Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close Phase 1 acceptance: an end-to-end accuracy gate on the real Angular 15 sample (the tool's resolved dependency edges must match a hand-authored ground truth) and a coverage threshold (≥80%).

**Architecture:** Two tasks. T18 = an integration test that builds the graph for `poc/real-sample/` and asserts it equals the known intended dependency graph (resolved edges, component count, all-NgModule, 0 parse errors, key UI access paths). T19 = wire vitest coverage thresholds (≥80%) and ensure they pass.

**Tech Stack:** vitest (+ v8 coverage).

---

```yaml
must_haves:
  observable_truths:
    - "Building the graph for poc/real-sample/src yields 18 components, all standalone:false, 0 parse errors."
    - "The set of resolved component→component edges exactly matches the hand-authored ground truth (>=95% accuracy; in practice all 19)."
    - "uiAccessPaths(DataTableComponent) includes the route 'finance/invoices'."
    - "`npm run test:cov` passes the >=80% line/function/statement threshold."
  required_artifacts:
    - "tool/src/real-sample.test.ts — ground-truth accuracy integration test"
    - "tool/vitest.config.ts — coverage thresholds (>=80%), run.ts excluded"
  required_wiring:
    - "Uses buildGraphFromRoot (Plan 5) + uiAccessPaths (Plan 7) against the committed poc/real-sample/ tree."
  key_links:
    - "ground-truth edge match -> SAC accuracy gate (>=95% edges) on real v15 code"
    - "coverage >=80% -> SAC test-coverage acceptance"
    - "real-repo 500-comp perf benchmark deferred (decision 2026-05-30) -> not gated here"
```

---

## File Structure

- `tool/src/real-sample.test.ts` — integration accuracy test against the committed real-sample.
- `tool/vitest.config.ts` — add coverage thresholds (modify).

---

## Wave: Verify

### Task 18: Ground-truth accuracy test on the real Angular 15 sample

<model>opus</model>

<read_first>
- `tool/src/graph/index.ts` (buildGraphFromRoot → {graph, parseErrors}), `tool/src/query/index.ts` (uiAccessPaths)
- `poc/real-sample/src/**` (the committed sample) + `poc/real-sample/dependency graph.txt` (intended graph)
</read_first>

**Files:**
- Create: `tool/src/real-sample.test.ts`

<action>

- [ ] **Step 1: Write the integration test** — `tool/src/real-sample.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { buildGraphFromRoot } from './graph/index.js';
import { uiAccessPaths } from './query/index.js';

// repo-root/poc/real-sample/src  (this file lives at tool/src/real-sample.test.ts)
const ROOT = fileURLToPath(new URL('../../poc/real-sample/src', import.meta.url));

// Hand-authored ground truth: the intended resolved component→component edges of the sample
// (pages call feature + shared components; feature components call feature + shared; per
// poc/real-sample/dependency graph.txt and the component templates).
const EXPECTED_EDGES = [
  'AppComponent->NotificationBannerComponent',
  'InvoiceListPage->SearchBoxComponent',
  'InvoiceListPage->InvoiceManagementComponent',
  'InvoiceListPage->DataTableComponent',
  'InvoiceListPage->PaginationComponent',
  'PaymentDetailPage->NotificationBannerComponent',
  'PaymentDetailPage->TooltipComponent',
  'PaymentDetailPage->PaymentSummaryComponent',
  'ReportDashboardPage->ReportFilterComponent',
  'ReportDashboardPage->DataTableComponent',
  'InvoiceManagementComponent->FormControlWrapperComponent',
  'InvoiceManagementComponent->DataTableComponent',
  'InvoiceManagementComponent->PaymentSummaryComponent',
  'InvoiceManagementComponent->ModalContainerComponent',
  'PaymentSummaryComponent->ProgressIndicatorComponent',
  'PaymentSummaryComponent->ErrorMessageComponent',
  'ReportFilterComponent->DropdownSelectorComponent',
  'ReportFilterComponent->SearchBoxComponent',
  'ReportFilterComponent->FileUploaderComponent',
].sort();

describe('real Angular 15 sample (ground truth)', () => {
  const { graph, parseErrors } = buildGraphFromRoot(ROOT);
  const resolved = graph.edges
    .filter((e) => e.kind === 'resolved' && e.to)
    .map((e) => `${e.from}->${e.to}`)
    .sort();

  it('indexes 18 components, all NgModule (standalone:false), with no parse errors', () => {
    expect(graph.components).toHaveLength(18);
    expect(graph.components.every((c) => c.standalone === false)).toBe(true);
    expect(parseErrors).toEqual([]);
  });

  it('resolved edges match the hand-authored ground truth (>=95% accuracy)', () => {
    const expectedSet = new Set(EXPECTED_EDGES);
    const matched = resolved.filter((e) => expectedSet.has(e));
    const accuracy = matched.length / EXPECTED_EDGES.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
    // exact-set check (surfaces any missing/spurious edge in the failure diff)
    expect(resolved).toEqual(EXPECTED_EDGES);
  });

  it('flags the dynamic/indirect cases (ng-content, outlets, ViewChild, createComponent)', () => {
    const dyn = graph.edges.filter((e) => e.kind !== 'resolved');
    const reasons = new Set(dyn.map((e) => e.reason));
    expect(reasons.has('ng-content')).toBe(true);
    expect(reasons.has('ngTemplateOutlet')).toBe(true);
    expect(reasons.has('ngComponentOutlet')).toBe(true);
    expect(dyn.some((e) => e.reason?.includes('ViewChild'))).toBe(true);
    expect(dyn.some((e) => e.reason === 'createComponent')).toBe(true);
  });

  it('resolves a UI access path to a deep shared component', () => {
    const paths = uiAccessPaths(graph, 'DataTableComponent').map((p) => p.routeUrl);
    expect(paths).toContain('finance/invoices');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd tool && npx vitest run src/real-sample.test.ts`
Expected: 4 tests PASS. If the exact-set check fails, the diff shows a missing or spurious edge — investigate whether it's a tool bug or a ground-truth error, fix the smaller one, and report. (Do NOT loosen the assertion to make a real bug pass.)

- [ ] **Step 3: Commit**

```bash
cd tool && git add src/real-sample.test.ts
git commit -m "test(tool): ground-truth accuracy on real Angular 15 sample (18 comp, 19 edges, dynamic flags)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/real-sample.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS; tsc clean. The tool's resolved edges on the real v15 sample exactly match the 19-edge ground truth (≥95% accuracy gate met), dynamic cases are flagged, and a UI access path reaches `finance/invoices`.
</verify>

<done>
The real Angular 15 sample is a committed accuracy gate: 18 components (all NgModule), 0 parse errors, resolved edges == ground truth, dynamic cases flagged, UI access path correct. The SAC ≥95%-edge acceptance is met on real v15 code (500-component perf benchmark remains deferred per the 2026-05-30 decision).
</done>

---

### Task 19: Coverage threshold (≥80%)

<model>sonnet</model>

<read_first>
- `tool/vitest.config.ts` (current coverage config)
</read_first>

**Files:**
- Modify: `tool/vitest.config.ts`

<action>

- [ ] **Step 1: Add coverage thresholds + exclude the process entry** — edit `tool/vitest.config.ts` so the `coverage` block is:

```ts
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/cli/run.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
```

(`src/cli/run.ts` is process glue — `runCli` is tested directly.)

- [ ] **Step 2: Run coverage**

Run: `cd tool && npm run test:cov`
Expected: all tests pass AND coverage meets the thresholds (exit 0). If a module is below threshold, add focused unit tests for the uncovered branches (e.g. an error/fallback path) until it passes — report which files needed tests. Do NOT lower the thresholds to pass.

- [ ] **Step 3: Commit**

```bash
cd tool && git add vitest.config.ts
# include any added *.test.ts files in this commit too
git commit -m "test(tool): enforce >=80% coverage thresholds (exclude cli/run entry)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm run test:cov`
Expected: exit 0 — all tests pass and v8 coverage meets lines/functions/statements ≥80% (branches ≥70%). Any file below threshold fails the run.
</verify>

<done>
`npm run test:cov` enforces ≥80% coverage. Phase 1's test-coverage acceptance is gated in CI-ready form.
</done>

---

## Self-Review (Plan 10)

- **Spec coverage:** SAC accuracy (≥95% edges on real-sample ground truth — exact 19-edge match), dynamic-case flagging (SAC-02), UI access path (SAC-07), coverage ≥80% (acceptance). Perf benchmark deferred per spec §11/§2. ✓
- **Placeholder scan:** complete code/commands; the ground-truth edge list is explicit. ✓
- **Type consistency:** uses `buildGraphFromRoot`→`{graph,parseErrors}`, `Edge.kind`/`.to`/`.reason`, `uiAccessPaths(graph,id)` — all matching prior plans. Path via `import.meta.url` (tool/src → repo root). ✓
- **Integrity:** Step 2 of T18/T19 forbids loosening assertions/thresholds to mask a real bug — fix the bug or the ground truth, not the gate. ✓
- **Verify bounds:** both tasks <60s. ✓
