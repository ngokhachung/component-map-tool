# M4 — Plan 2: Baseline + Lint engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the pure gate engine: a baseline file of accepted documentation debt, and a `lint` function that computes per-component issue codes, restricts to changed components, and blocks only **new** debt (debt not already in the baseline).

**Architecture:** Two tasks. T2 = `cli/baseline.ts` — the `.cmap-baseline.json` shape (filePath → accepted issue codes) + deterministic read/write + `newViolations`/`acceptInto` set-diff helpers. T3 = `cli/lint.ts` — `computeIssues` (missing-md / gap:* / override-broken:*), `lintChanged` (filter to changed + diff vs baseline + stale warnings), `renderLint`. Both are pure (no graph build); the CLI (Plan 4) wires them to `buildEnriched`.

**Tech Stack:** TS/Node ESM, vitest. Issue codes: `missing-md` | `gap:<reason>` | `override-broken:<target>`.

---

```yaml
must_haves:
  observable_truths:
    - "readBaseline(missing path) → empty baseline; writeBaseline then readBaseline round-trips; writeBaseline output is deterministic (sorted keys + codes)."
    - "newViolations: a file absent from baseline with codes → all codes are new; a file with some baseline codes → only the unseen codes are new."
    - "acceptInto unions current codes into baseline per file."
    - "computeIssues emits 'missing-md' for null-componentId nodes, 'gap:<reason>' for uncovered constructs, 'override-broken:<target>' for an override target that does not resolve."
    - "lintChanged blocks a changed component with new debt, passes the same component when its debt is grandfathered in baseline, blocks a clean→dirty regression, ignores unchanged components, and warns (not blocks) on stale entries."
    - "`tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/cli/baseline.ts (BaselineFile, BASELINE_SCHEMA_VERSION, emptyBaseline, readBaseline, writeBaseline, newViolations, acceptInto)"
    - "tool/src/cli/lint.ts (computeIssues, lintChanged, renderLint, LintResult)"
    - "tests for each"
  required_wiring:
    - "migrate (Plan 3) imports computeIssues + acceptInto/writeBaseline; CLI (Plan 4) imports readBaseline/writeBaseline/acceptInto + computeIssues + lintChanged/renderLint."
  key_links:
    - "baseline keyed by repo-relative filePath → stable across MD-presence changes, matches git-diff paths (spec §6, MIG-02)"
    - "block only codes ∉ baseline + clean→dirty regression → grandfather rollout (spec §3, ENF-01)"
    - "findGaps already excludes waived (Plan 1) → gap codes honor the waiver escape hatch"
```

---

## File Structure

- `tool/src/cli/baseline.ts` — the baseline contract + IO + set-diff. One responsibility: accepted-debt bookkeeping.
- `tool/src/cli/lint.ts` — issue computation + gate decision + rendering. One responsibility: the gate.
- Tests alongside.

---

## Wave 2: Baseline + Lint

### Task 2: Baseline file + set-diff helpers

<model>sonnet</model>

<read_first>
- `docs/specs/2026-05-31-phase2b-md-migration-enforcement-design.md` §3 (baseline shape) + §6 (issue codes), MIG-02
</read_first>

**Files:**
- Create: `tool/src/cli/baseline.ts`
- Test: `tool/src/cli/baseline.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/baseline.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyBaseline, readBaseline, writeBaseline, newViolations, acceptInto } from './baseline.js';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-bl-')); }

describe('baseline', () => {
  it('returns an empty baseline for a missing file', () => {
    expect(readBaseline('/no/such/baseline.json').entries).toEqual({});
  });

  it('round-trips and writes deterministically (sorted keys + codes)', () => {
    const d = tmp();
    try {
      const p = join(d, '.cmap-baseline.json');
      writeBaseline(p, { schemaVersion: 1, entries: { 'b.ts': ['gap:x', 'missing-md'], 'a.ts': ['gap:z', 'gap:a'] } });
      const text = readFileSync(p, 'utf8');
      expect(text.indexOf('"a.ts"')).toBeLessThan(text.indexOf('"b.ts"'));      // keys sorted
      expect(readBaseline(p).entries['a.ts']).toEqual(['gap:a', 'gap:z']);       // codes sorted
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('newViolations: all codes new when file absent; only unseen codes when partially present', () => {
    const base = { schemaVersion: 1, entries: { 'a.ts': ['gap:x'] } };
    const current = new Map<string, string[]>([
      ['a.ts', ['gap:x', 'gap:y']],   // gap:x grandfathered, gap:y new
      ['b.ts', ['missing-md']],       // file absent → new
    ]);
    const v = newViolations(current, base);
    expect(v).toContainEqual({ filePath: 'a.ts', codes: ['gap:y'] });
    expect(v).toContainEqual({ filePath: 'b.ts', codes: ['missing-md'] });
    expect(v.find((e) => e.filePath === 'a.ts')!.codes).not.toContain('gap:x');
  });

  it('acceptInto unions current codes into the baseline per file', () => {
    const base = emptyBaseline();
    const merged = acceptInto(base, new Map([['a.ts', ['gap:x']], ['a.ts'.replace('a', 'b'), ['missing-md']]]));
    expect(new Set(merged.entries['a.ts'])).toEqual(new Set(['gap:x']));
    expect(merged.entries['b.ts']).toEqual(['missing-md']);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/baseline.test.ts`

- [ ] **Step 3: Implement `tool/src/cli/baseline.ts`**

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const BASELINE_SCHEMA_VERSION = 1;

// Accepted documentation debt: repo-relative component filePath → set of issue codes.
// Issue codes: 'missing-md' | `gap:<reason>` | `override-broken:<target>`.
export interface BaselineFile {
  schemaVersion: number;
  entries: Record<string, string[]>;
}

export function emptyBaseline(): BaselineFile {
  return { schemaVersion: BASELINE_SCHEMA_VERSION, entries: {} };
}

export function readBaseline(path: string): BaselineFile {
  if (!existsSync(path)) return emptyBaseline();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BaselineFile>;
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      return {
        schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : BASELINE_SCHEMA_VERSION,
        entries: parsed.entries as Record<string, string[]>,
      };
    }
  } catch { /* malformed → treat as empty */ }
  return emptyBaseline();
}

// Deterministic: sorted keys + sorted codes (stable git diffs, stable tests).
export function writeBaseline(path: string, file: BaselineFile): void {
  mkdirSync(dirname(path) || '.', { recursive: true });
  const entries: Record<string, string[]> = {};
  for (const k of Object.keys(file.entries).sort()) entries[k] = [...file.entries[k]].sort();
  writeFileSync(path, `${JSON.stringify({ schemaVersion: file.schemaVersion, entries }, null, 2)}\n`);
}

// Codes present now (per changed file) that the baseline has NOT already accepted.
export function newViolations(
  current: Map<string, string[]>,
  baseline: BaselineFile,
): { filePath: string; codes: string[] }[] {
  const out: { filePath: string; codes: string[] }[] = [];
  for (const [filePath, codes] of current) {
    const accepted = new Set(baseline.entries[filePath] ?? []);
    const fresh = codes.filter((c) => !accepted.has(c));
    if (fresh.length) out.push({ filePath, codes: fresh });
  }
  return out;
}

// Union current codes into the baseline (for --accept and the migrate snapshot).
export function acceptInto(baseline: BaselineFile, current: Map<string, string[]>): BaselineFile {
  const entries: Record<string, string[]> = { ...baseline.entries };
  for (const [filePath, codes] of current) {
    const set = new Set([...(entries[filePath] ?? []), ...codes]);
    if (set.size) entries[filePath] = [...set];
  }
  return { schemaVersion: baseline.schemaVersion, entries };
}
```

- [ ] **Step 4: Run, verify PASS** (4 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/cli/baseline.ts src/cli/baseline.test.ts
git commit -m "feat(tool): .cmap-baseline.json shape + read/write + set-diff (MIG-02)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/baseline.test.ts && npx tsc --noEmit`
Expected: 4 PASS; tsc clean. Deterministic write; `newViolations` returns only un-accepted codes; `acceptInto` unions.
</verify>

<done>
The accepted-debt store + set-diff exist. Lint (T3) computes current issues and diffs against it; migrate (Plan 3) snapshots into it.
</done>

---

### Task 3: Lint engine (computeIssues + lintChanged + render)

<model>opus</model>

<read_first>
- `tool/src/cli/baseline.ts` (T2), `tool/src/overrides/gaps.ts` (`findGaps`, `GapComponent`), `tool/src/query/locator.ts` (`resolveLocator`), `tool/src/types.ts` (`Graph`), `tool/src/overrides/schema.ts` (`CmapOverride`)
- `tool/src/cli/index.ts` (`pathSuffixMatch` — mirror it locally), `docs/specs/...phase2b...md` §3, ENF-01
</read_first>

**Files:**
- Create: `tool/src/cli/lint.ts`
- Test: `tool/src/cli/lint.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/lint.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { computeIssues, lintChanged } from './lint.js';
import { emptyBaseline } from './baseline.js';
import type { Graph, ComponentNode, Edge } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function graph(components: ComponentNode[], edges: Edge[] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
function ovMap(entries: [string, CmapOverride['dynamicDeps']][]): Map<string, CmapOverride> {
  return new Map(entries.map(([id, deps]) => [id, { schemaVersion: 1, componentId: id, dynamicDeps: deps }]));
}
const outlet = (from: string): Edge => ({ from, to: null, kind: 'unresolved-static', via: 'template', reason: 'ngComponentOutlet' });

describe('computeIssues', () => {
  it('emits missing-md, gap:*, override-broken:*', () => {
    const g = graph(
      [node('NoMd', null), node('HasGap', 'C1'), node('BadOv', 'C2')],
      [outlet('HasGap'), outlet('BadOv')],
    );
    const ov = ovMap([['C2', [{ target: 'DoesNotExist', reason: 'ngComponentOutlet' }]]]);
    const issues = computeIssues(g, ov);
    expect(issues.get('src/NoMd.ts')).toContain('missing-md');
    expect(issues.get('src/HasGap.ts')).toContain('gap:ngComponentOutlet');
    expect(issues.get('src/BadOv.ts')).toContain('override-broken:DoesNotExist');
  });
});

describe('lintChanged', () => {
  it('blocks a changed component with new debt', () => {
    const g = graph([node('NoMd', null)]);
    const r = lintChanged(g, new Map(), ['src/NoMd.ts'], emptyBaseline());
    expect(r.ok).toBe(false);
    expect(r.blocking).toContainEqual({ filePath: 'src/NoMd.ts', codes: ['missing-md'] });
  });

  it('passes when the debt is grandfathered in baseline', () => {
    const g = graph([node('NoMd', null)]);
    const base = { schemaVersion: 1, entries: { 'src/NoMd.ts': ['missing-md'] } };
    expect(lintChanged(g, new Map(), ['src/NoMd.ts'], base).ok).toBe(true);
  });

  it('blocks a clean→dirty regression (file not in baseline)', () => {
    const g = graph([node('HasGap', 'C1')], [outlet('HasGap')]);
    const base = { schemaVersion: 1, entries: { 'src/Other.ts': ['missing-md'] } };
    expect(lintChanged(g, new Map(), ['src/HasGap.ts'], base).ok).toBe(false);
  });

  it('ignores components not in the changed set', () => {
    const g = graph([node('NoMd', null)]);
    expect(lintChanged(g, new Map(), ['src/Unrelated.ts'], emptyBaseline()).ok).toBe(true);
  });

  it('warns (not blocks) on a stale entry of a changed component', () => {
    const g = graph([node('Host', 'C1')]);
    const ov = ovMap([['C1', [{ target: 'X', reason: 'ngComponentOutlet', stale: true }]]]);
    const r = lintChanged(g, ov, ['src/Host.ts'], emptyBaseline());
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.toLowerCase().includes('stale'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/lint.test.ts`

- [ ] **Step 3: Implement `tool/src/cli/lint.ts`**

```ts
import type { Graph } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';
import { findGaps } from '../overrides/gaps.js';
import { resolveLocator } from '../query/locator.js';
import { newViolations, type BaselineFile } from './baseline.js';

// Mirrors cli/index.ts pathSuffixMatch: two paths match when one is a full-segment
// suffix of the other (git-diff paths need not share the analyzed root's prefix).
function pathSuffixMatch(a: string, b: string): boolean {
  const x = a.replace(/\\/g, '/').split('/').filter(Boolean);
  const y = b.replace(/\\/g, '/').split('/').filter(Boolean);
  const n = Math.min(x.length, y.length);
  if (n === 0) return false;
  for (let i = 1; i <= n; i++) if (x[x.length - i] !== y[y.length - i]) return false;
  return true;
}

// Per-component issue codes for the whole graph.
//   'missing-md'               — node has no project-MD componentId
//   `gap:<reason>`             — uncovered (unfilled + unwaived) dynamic construct (via findGaps)
//   `override-broken:<target>` — a non-stale, non-waived override target that does not resolve
export function computeIssues(graph: Graph, overrides: Map<string, CmapOverride>): Map<string, string[]> {
  const issues = new Map<string, string[]>();
  const add = (filePath: string, code: string) => {
    const a = issues.get(filePath); if (a) a.push(code); else issues.set(filePath, [code]);
  };
  for (const node of graph.components) if (node.componentId === null) add(node.filePath, 'missing-md');
  for (const g of findGaps(graph, overrides)) for (const reason of g.uncovered) add(g.filePath, `gap:${reason}`);
  for (const node of graph.components) {
    if (!node.componentId) continue;
    const ov = overrides.get(node.componentId);
    if (!ov) continue;
    for (const dep of ov.dynamicDeps) {
      if (dep.stale || dep.waived || dep.target.trim().length === 0) continue;
      if (!resolveLocator(graph, dep.target).ok) add(node.filePath, `override-broken:${dep.target}`);
    }
  }
  return issues;
}

export interface LintResult {
  blocking: { filePath: string; codes: string[] }[];
  warnings: string[];
  ok: boolean;
}

export function lintChanged(
  graph: Graph,
  overrides: Map<string, CmapOverride>,
  changedFiles: string[],
  baseline: BaselineFile,
  overrideWarnings: string[] = [],
): LintResult {
  const isChanged = (filePath: string) => changedFiles.some((f) => pathSuffixMatch(filePath, f));
  const current = new Map<string, string[]>();
  for (const [filePath, codes] of computeIssues(graph, overrides)) if (isChanged(filePath)) current.set(filePath, codes);
  const blocking = newViolations(current, baseline);

  const warnings: string[] = [];
  for (const node of graph.components) {
    if (!node.componentId || !isChanged(node.filePath)) continue;
    const ov = overrides.get(node.componentId);
    if (!ov) continue;
    for (const dep of ov.dynamicDeps) if (dep.stale) warnings.push(`${node.filePath}: stale entry (${dep.reason ?? 'unknown construct'}) — vanished from code`);
  }
  warnings.push(...overrideWarnings);

  return { blocking, warnings, ok: blocking.length === 0 };
}

function explain(code: string): string {
  if (code === 'missing-md') return 'missing-md — no project MD (componentId). Create its MD doc.';
  if (code.startsWith('gap:')) return `${code} — undocumented dynamic dependency. Fill the target in .cmap.yaml (or set waived: true).`;
  if (code.startsWith('override-broken:')) return `${code} — override target does not resolve. Fix the target.`;
  return code;
}

export function renderLint(result: LintResult): string[] {
  const lines: string[] = result.warnings.map((w) => `⚠ ${w}`);
  if (result.ok) { lines.push('✓ cmap lint: no new documentation debt in changed components'); return lines; }
  lines.push(`✗ cmap lint: ${result.blocking.length} changed component(s) introduce new documentation debt:`);
  for (const b of result.blocking) {
    lines.push(`  ${b.filePath}`);
    for (const c of b.codes) lines.push(`    - ${explain(c)}`);
  }
  lines.push('Fix: fill the target in .cmap.yaml (or set `waived: true`), create the project MD, or run `cmap lint --accept` to grandfather this debt.');
  return lines;
}
```

- [ ] **Step 4: Run, verify PASS** (6 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/cli/lint.ts src/cli/lint.test.ts
git commit -m "feat(tool): lint engine — issue codes + changed-vs-baseline gate + render (ENF-01)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `computeIssues` emits the three code families; `lintChanged` blocks new debt + regressions, passes grandfathered debt, ignores unchanged files, warns on stale.
</verify>

<done>
The pure gate is done. Plan 3 (migrate) snapshots `computeIssues` into a baseline; Plan 4 wires `lintChanged`/`renderLint` to the `cmap lint` command + `--accept`.
</done>

---

## Self-Review (Plan 2)

- **Spec coverage:** MIG-02 (baseline shape/IO, keyed by filePath), ENF-01 (computeIssues code families ①②③, lintChanged grandfather + regression + stale-warn). `--accept` command itself is Plan 4; `acceptInto` primitive here. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `BaselineFile { schemaVersion, entries: Record<string,string[]> }` shared by T2/T3; `newViolations(Map, BaselineFile)` used by `lintChanged`; `computeIssues` consumes `findGaps` (waived-aware from Plan 1) + `resolveLocator().ok`; `Edge` literals use `kind:'unresolved-static'`/`via:'template'`; `ComponentNode` test literal carries `description`. `pathSuffixMatch` mirrors `cli/index.ts` (comment notes the mirror). NodeNext `.js` imports. ✓
- **Verify bounds:** both tasks <60s. ✓
