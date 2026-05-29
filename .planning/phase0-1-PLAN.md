# Phase 0 POC — Plan 1: Foundation (Scaffold + Harness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development (recommended) or happypowerprocess:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an ESM TypeScript POC workspace that can call `@angular/compiler` and `ts-morph` standalone, and build the shared assertion harness that all three spikes report through.

**Architecture:** Approach A — independent spikes + one shared harness. This plan delivers the workspace (`poc/`) and the harness (`poc/harness/`). Spikes (Plans 2 & 3) plug into the harness. The first task is a de-risking gate-zero: prove `@angular/compiler@19` imports and parses in plain Node ESM before anything else is built.

**Tech Stack:** Node + TypeScript (ESM), `tsx` runner, `vitest`, pinned exact `@angular/compiler@19.x.y`, `ts-morph`.

---

```yaml
must_haves:
  observable_truths:
    - "`npx tsx poc/spikes/smoke.ts` parses a trivial Angular 19 template and prints node count with zero parse errors — proves the riskiest dependency works standalone."
    - "`npx vitest run` executes the harness unit tests green."
    - "The harness fails a case whose actual differs from expected, and fails a case flagged with parseErrors > 0."
  required_artifacts:
    - "poc/package.json (ESM, pinned deps), poc/tsconfig.json, poc/vitest.config.ts"
    - "poc/types.ts — shared data contracts for all spikes + harness"
    - "poc/spikes/lib/load-fixtures.ts — shared fixture loader (created here so Wave-3 spikes only read it)"
    - "poc/spikes/smoke.ts — standalone compiler/ts-morph import probe"
    - "poc/harness/diff.ts — multiset/count-aware deep equality"
    - "poc/harness/report.ts — per-task aggregation (counts + rate + borderline list)"
    - "poc/harness/*.test.ts — vitest unit tests for diff + report"
  required_wiring:
    - "Spikes (Plans 2/3) import types from poc/types.ts and report via poc/harness/report.ts."
    - "smoke.ts import paths become the canonical import paths recorded in the feasibility report."
  key_links:
    - "ESM-only @angular/compiler -> package.json type:module + tsx (research P-AC5)"
    - "parseTemplate errors checked -> harness scoreCase treats parseErrors>0 as FAIL (research P-AC4)"
```

---

## File Structure

- `poc/package.json` — ESM workspace, exact-pinned deps, scripts.
- `poc/tsconfig.json` — TS config for `tsx`/`vitest` (NodeNext ESM).
- `poc/vitest.config.ts` — vitest config.
- `poc/types.ts` — shared TypeScript interfaces (the JSON contracts).
- `poc/spikes/lib/load-fixtures.ts` — generic fixture loader (pairs a source file with its `.expected.json`); read by all three spikes.
- `poc/spikes/smoke.ts` — gate-zero import probe.
- `poc/harness/diff.ts` — `multisetEqual(actual, expected)` deep compare.
- `poc/harness/report.ts` — `scoreTask(...)`, `CaseResult`, `TaskReport`.
- `poc/harness/diff.test.ts`, `poc/harness/report.test.ts` — unit tests.

---

## Wave 1

### Task 1: Workspace scaffold + gate-zero smoke import

<model>sonnet</model>

<read_first>
- `docs/specs/2026-05-29-phase0-poc-validation-design.md` §11 (ESM + smoke-import constraint)
- `.planning/phase0-RESEARCH.md` (Standard Stack + P-AC5/P-AC6: ESM-only, no zone.js needed)
</read_first>

**Files:**
- Create: `poc/package.json`
- Create: `poc/tsconfig.json`
- Create: `poc/vitest.config.ts`
- Create: `poc/.gitignore`
- Create: `poc/spikes/smoke.ts`
- Create: `poc/types.ts`
- Create: `poc/spikes/lib/load-fixtures.ts`

<action>

- [ ] **Step 1: Create `poc/package.json` (ESM, pinned deps)**

```json
{
  "name": "component-map-poc",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "description": "Throwaway Phase 0 POC — validates Angular 19 parsing feasibility. NOT production code.",
  "scripts": {
    "smoke": "tsx spikes/smoke.ts",
    "test": "vitest run",
    "spike:component": "tsx spikes/spike-component.ts",
    "spike:routing": "tsx spikes/spike-routing.ts",
    "spike:template": "tsx spikes/spike-template.ts",
    "report": "tsx spikes/report-all.ts"
  },
  "dependencies": {
    "@angular/compiler": "19.2.14",
    "ts-morph": "24.0.0"
  },
  "devDependencies": {
    "tsx": "4.19.2",
    "typescript": "5.6.3",
    "vitest": "2.1.8"
  }
}
```

Note: exact pins (no `^`) per research P-AC2. If `@angular/compiler@19.2.14` is unavailable at install, pick the nearest published `19.2.x`, then record the resolved version in Step 5's output and in the eventual feasibility report.

- [ ] **Step 2: Create `poc/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Create `poc/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `poc/.gitignore`**

```
node_modules/
*.actual.json
```

- [ ] **Step 5: Create `poc/types.ts` (shared contracts — referenced by all later tasks)**

```ts
// Shared data contracts for Phase 0 POC spikes + harness.

// ---- Component spike (POC-01) ----
export type IoKind = 'decorator' | 'signal';
export interface IoPort {
  name: string;         // class property name
  alias: string | null; // public name if aliased, else null
  kind: IoKind;
  required: boolean;    // true for input.required()/model.required(); false otherwise
}
export interface ComponentRecord {
  className: string;
  selector: string | null;
  standalone: boolean;                       // v19: true unless `standalone: false` present
  templateKind: 'inline' | 'templateUrl' | 'none';
  inputs: IoPort[];
  outputs: IoPort[];
  module: string | null;                     // NgModule class that declares it, else null
}

// ---- Routing spike (POC-02) ----
export interface LazyTarget {
  importPath: string;     // literal specifier from import('...')
  symbol: string | null;  // member name from .then(m => m.X), or null (default export / unresolved)
}
export interface RouteRecord {
  path: string | null;
  component: string | null;
  redirectTo: string | null;
  loadChildren: LazyTarget | null;
  loadComponent: LazyTarget | null;
  guards: string[];           // names only, from canActivate/canMatch/etc.
  children: RouteRecord[];
  unresolvedLazy: boolean;    // true when a load* was present but path/symbol not statically recoverable
}

// ---- Template spike (POC-03 / POC-04) ----
export type DepKind = 'resolved' | 'indirect' | 'unresolved-static';
export interface TemplateDep {
  tag: string;               // element tag or construct marker (e.g. 'ng-content', 'ngComponentOutlet')
  component: string | null;  // matched component className if resolved, else null
  kind: DepKind;
  reason: string | null;     // why indirect/unresolved (e.g. 'ng-content', 'ngTemplateOutlet')
}
export interface TemplateResult {
  deps: TemplateDep[];
  parseErrors: number;       // count from parseTemplate(...).errors; MUST be 0 to pass
}

// ---- Harness ----
export interface CaseResult {
  fixture: string;
  pass: boolean;
  notes: string;
  borderline: boolean;       // surfaced explicitly in the report
}
export interface TaskReport {
  task: 'component' | 'routing' | 'template';
  total: number;
  passed: number;
  rate: number;              // passed/total, 0..1
  cases: CaseResult[];
  // Optional per-task extra counts. The component spike sets
  // { standalonePassed, ngModulePassed } so the report can apply the
  // spec §5 component gate (≥5 correct of EACH type), not the rate band.
  meta?: Record<string, number>;
}
```

- [ ] **Step 5b: Create the shared fixture loader** — `poc/spikes/lib/load-fixtures.ts` (read by all three spikes; created here in the foundation wave so Wave-3 spikes only consume it)

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FixturePair<E> {
  name: string;          // base name without extension
  sourcePath: string;    // absolute path to the .ts/.html source
  expected: E;           // parsed expected.json
}

// Pairs every `<name>.<ext>` with `<name>.expected.json` in `dir`.
export function loadFixtures<E>(dir: string, sourceExt: string): FixturePair<E>[] {
  const files = readdirSync(dir);
  const sources = files.filter((f) => f.endsWith(sourceExt) && !f.endsWith('.expected.json'));
  return sources.map((src) => {
    const name = src.slice(0, -sourceExt.length);
    const expectedFile = join(dir, `${name}.expected.json`);
    const expected = JSON.parse(readFileSync(expectedFile, 'utf8')) as E;
    return { name, sourcePath: join(dir, src), expected };
  });
}
```

- [ ] **Step 6: Create `poc/spikes/smoke.ts` (gate-zero probe)**

```ts
// Gate-zero: prove @angular/compiler@19 + ts-morph import and run standalone in Node ESM,
// with NO zone.js / compiler-cli / TestBed. If this fails, STOP — the POC is not feasible as designed.
import {
  parseTemplate,
  TmplAstElement,
  TmplAstRecursiveVisitor,
  tmplAstVisitAll,
  CssSelector,
  SelectorMatcher,
} from '@angular/compiler';
import { Project } from 'ts-morph';

function main(): void {
  // 1. @angular/compiler parse
  const html = `<app-foo></app-foo><div *ngIf="x"><app-bar></app-bar></div>`;
  const parsed = parseTemplate(html, 'smoke.html', { enableBlockSyntax: true });
  const errorCount = parsed.errors?.length ?? 0;

  const tags: string[] = [];
  class Collector extends TmplAstRecursiveVisitor {
    override visitElement(el: TmplAstElement): void {
      tags.push(el.name);
      super.visitElement(el);
    }
  }
  tmplAstVisitAll(new Collector(), parsed.nodes);

  // 2. SelectorMatcher smoke
  const matcher = new SelectorMatcher<string>();
  matcher.addSelectables(CssSelector.parse('app-foo'), 'FooComponent');
  let matched = '';
  matcher.match(CssSelector.parse('app-foo')[0], (_, ctx) => (matched = ctx));

  // 3. ts-morph smoke
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('x.ts', `export class A {}`);
  const className = sf.getClasses()[0].getName();

  console.log(JSON.stringify({
    compilerVersion: 'see package.json pin',
    parseErrorCount: errorCount,
    tagsFound: tags,            // expect ['app-foo','app-bar'] — proves structural recursion works
    selectorMatched: matched,   // expect 'FooComponent'
    tsMorphClass: className,     // expect 'A'
  }, null, 2));

  if (errorCount !== 0) throw new Error(`Smoke parse produced ${errorCount} errors`);
  if (tags.length !== 2) throw new Error(`Expected 2 tags, got ${tags.length}: ${tags.join(',')}`);
  if (matched !== 'FooComponent') throw new Error('SelectorMatcher did not match');
  if (className !== 'A') throw new Error('ts-morph did not parse class');
}

main();
```

</action>

<verify>
Setup (un-timed, one-time): `cd poc && npm install`
Then the Nyquist-bound verify (<60s): `cd poc && npm run smoke`
Expected stdout JSON with `parseErrorCount: 0`, `tagsFound: ["app-foo","app-bar"]`, `selectorMatched: "FooComponent"`, `tsMorphClass: "A"`, and exit code 0.

If the import throws (`ERR_REQUIRE_ESM`, missing peer dep, or unknown export name), this is the gate-zero failure: STOP and record which export/path failed — the recorded import paths or the ESM config need correction before proceeding. Try the nearest published `19.2.x` if the exact pin is missing.
</verify>

<done>
`npm run smoke` exits 0 and prints the expected JSON, confirming `@angular/compiler@19` + `ts-morph` run standalone in Node ESM and that structural-directive recursion + SelectorMatcher work. Exact resolved `@angular/compiler` version is noted for the report.
</done>

- [ ] **Step 7: Commit**

```bash
cd poc && git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore types.ts spikes/lib/load-fixtures.ts spikes/smoke.ts
git commit -m "chore(poc): scaffold ESM workspace + fixture loader + gate-zero smoke import"
```

---

## Wave 2

### Task 2: Shared assertion harness (multiset diff + report aggregation)

<model>sonnet</model>

<read_first>
- `poc/types.ts` (created in Task 1 — `CaseResult`, `TaskReport`)
- `.planning/phase0-RESEARCH.md` P-M3, P-M4, P-M5 (multiset-aware, raw counts, borderline surfacing)
</read_first>

**Files:**
- Create: `poc/harness/diff.ts`
- Test: `poc/harness/diff.test.ts`
- Create: `poc/harness/report.ts`
- Test: `poc/harness/report.test.ts`

<action>

- [ ] **Step 1: Write the failing test for the multiset diff** — `poc/harness/diff.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { multisetEqual } from './diff.js';

describe('multisetEqual', () => {
  it('treats arrays as order-insensitive', () => {
    expect(multisetEqual([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }])).toBe(true);
  });
  it('is count-aware: duplicates must match (not deduped)', () => {
    expect(multisetEqual([{ a: 1 }, { a: 1 }], [{ a: 1 }])).toBe(false);
  });
  it('compares nested objects deeply', () => {
    expect(multisetEqual([{ a: { b: [1, 2] } }], [{ a: { b: [1, 2] } }])).toBe(true);
    expect(multisetEqual([{ a: { b: [1, 2] } }], [{ a: { b: [2, 1] } }])).toBe(true);
  });
  it('detects a missing element', () => {
    expect(multisetEqual([{ a: 1 }, { a: 2 }], [{ a: 1 }])).toBe(false);
  });
  it('compares scalars and equal objects', () => {
    expect(multisetEqual(5, 5)).toBe(true);
    expect(multisetEqual({ x: 1 }, { x: 1 })).toBe(true);
    expect(multisetEqual({ x: 1 }, { x: 2 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd poc && npx vitest run harness/diff.test.ts`
Expected: FAIL — `multisetEqual` not exported / module not found.

- [ ] **Step 3: Implement `poc/harness/diff.ts`**

```ts
// Order-insensitive, COUNT-AWARE deep equality (research P-M4: must not dedupe).
// Strategy: canonicalize every value to a stable string; for arrays, compare as multisets
// by canonicalizing each element and comparing sorted canonical-string lists.

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) {
    const parts = value.map(canonical).sort();
    return `[${parts.join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export function multisetEqual(actual: unknown, expected: unknown): boolean {
  return canonical(actual) === canonical(expected);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd poc && npx vitest run harness/diff.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing test for report aggregation** — `poc/harness/report.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { scoreCase, scoreTask } from './report.js';
import type { CaseResult } from '../types.js';

describe('scoreCase', () => {
  it('passes when actual matches expected and no parse errors', () => {
    const r = scoreCase('f1', [{ a: 1 }], [{ a: 1 }], 0);
    expect(r.pass).toBe(true);
    expect(r.borderline).toBe(false);
  });
  it('FAILS when parseErrors > 0 even if nodes match (research P-AC4)', () => {
    const r = scoreCase('f2', [{ a: 1 }], [{ a: 1 }], 2);
    expect(r.pass).toBe(false);
    expect(r.notes).toContain('parse error');
  });
  it('fails on mismatch', () => {
    const r = scoreCase('f3', [{ a: 1 }], [{ a: 2 }], 0);
    expect(r.pass).toBe(false);
  });
});

describe('scoreTask', () => {
  it('computes rate from raw counts', () => {
    const cases: CaseResult[] = [
      { fixture: 'a', pass: true, notes: '', borderline: false },
      { fixture: 'b', pass: false, notes: 'x', borderline: false },
    ];
    const t = scoreTask('component', cases);
    expect(t.total).toBe(2);
    expect(t.passed).toBe(1);
    expect(t.rate).toBe(0.5);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd poc && npx vitest run harness/report.test.ts`
Expected: FAIL — `scoreCase`/`scoreTask` not exported.

- [ ] **Step 7: Implement `poc/harness/report.ts`**

```ts
import { multisetEqual } from './diff.js';
import type { CaseResult, TaskReport } from '../types.js';

// parseErrors defaults 0 for spikes (component/routing) that don't parse templates.
export function scoreCase(
  fixture: string,
  actual: unknown,
  expected: unknown,
  parseErrors = 0,
): CaseResult {
  if (parseErrors > 0) {
    return { fixture, pass: false, notes: `parse error: ${parseErrors} error(s) from parseTemplate`, borderline: false };
  }
  const pass = multisetEqual(actual, expected);
  return {
    fixture,
    pass,
    notes: pass ? 'ok' : 'mismatch: actual != expected',
    borderline: false,
  };
}

export function scoreTask(task: TaskReport['task'], cases: CaseResult[]): TaskReport {
  const total = cases.length;
  const passed = cases.filter((c) => c.pass).length;
  return { task, total, passed, rate: total === 0 ? 0 : passed / total, cases };
}
```

- [ ] **Step 8: Run all harness tests to verify green**

Run: `cd poc && npm test`
Expected: PASS (8 tests across diff + report).

- [ ] **Step 9: Commit**

```bash
cd poc && git add harness/diff.ts harness/diff.test.ts harness/report.ts harness/report.test.ts
git commit -m "feat(poc): shared multiset diff + report harness with parse-error gating"
```

</action>

<verify>
Run (Nyquist: <60s): `cd poc && npm test`
Expected: all tests PASS; specifically the test asserting `parseErrors > 0 => pass:false` is green (locks in research P-AC4), and the count-aware duplicate test is green (P-M4).
</verify>

<done>
`npm test` is green. The harness exposes `scoreCase`/`scoreTask` consumed by all three spikes, fails parse-errored cases, and computes rates from raw counts. Plans 2 and 3 can now build spikes against `poc/types.ts` + `poc/harness/`.
</done>

---

## Self-Review (Plan 1)

- **Spec coverage:** ESM workspace + smoke (spec §11 ESM/smoke), harness parse-error gating (§11 errors rule), multiset diff + raw counts (§11 reporting), shared contracts for POC-01/02/03/04/05. ✓
- **Placeholder scan:** All steps have complete code/commands. ✓
- **Type consistency:** `ComponentRecord`/`RouteRecord`/`TemplateResult`/`CaseResult`/`TaskReport` defined once in `poc/types.ts`; harness imports `CaseResult`/`TaskReport`; `.js` extensions used in imports (NodeNext ESM requirement). ✓
