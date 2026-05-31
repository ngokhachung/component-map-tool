# M4 — Plan 3: Migrate command (scaffold + baseline + coverage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One `migrate` function that prepares a repo for enforcement: bulk-scaffold `.cmap.yaml` for every gap-component with a componentId, snapshot all current debt into the baseline, and write a coverage report (md + json) listing MD coverage, fill rate, and the missing-MD list.

**Architecture:** One task, one new module `cli/migrate.ts`, composing existing pieces: `scaffoldGaps` (M3), `computeIssues` (Plan 2), `acceptInto`/`writeBaseline` (Plan 2). `computeCoverage` derives MD coverage + dynamic-dep fill rate from the graph + issues; `renderCoverageMd` formats it. Pure except for the three file writes it performs (scaffold dir, baseline, coverage).

**Tech Stack:** TS/Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "computeCoverage reports totalComponents, withMd, needingDoc (components with ≥1 unresolved-static construct), documented (needingDoc minus those with an open gap), and a sorted missingMd filePath list."
    - "migrate writes a baseline whose entries equal computeIssues (all current debt) and a coverage .md + .json; returns the scaffold result."
    - "On a graph where all components lack MD, coverage.withMd === 0 and missingMd lists every component filePath."
    - "`tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/cli/migrate.ts (Coverage, computeCoverage, renderCoverageMd, migrate, MigrateResult)"
    - "tool/src/cli/migrate.test.ts"
  required_wiring:
    - "CLI (Plan 4) `cmap migrate` calls migrate() with overridesDir/baselinePath/coveragePath from flags."
  key_links:
    - "snapshot computeIssues → baseline = current debt grandfathered (spec §2, MIG-02)"
    - "scaffoldGaps reused → bulk scaffold without re-implementing merge-safety (spec §2, MIG-01)"
    - "coverage fill rate tracks acceptance '100% skeleton / ≥30% filled' (spec §2/§10, MIG-03)"
```

---

## File Structure

- `tool/src/cli/migrate.ts` — orchestrates the four migration outputs + coverage math/render. One responsibility: repo-scale migration prep.
- Test alongside.

---

## Wave 3: Migrate

### Task 4: migrate() — scaffold + baseline + coverage

<model>sonnet</model>

<read_first>
- `tool/src/overrides/gaps.ts` (`scaffoldGaps`), `tool/src/cli/lint.ts` (`computeIssues`), `tool/src/cli/baseline.ts` (`acceptInto`, `emptyBaseline`, `writeBaseline`), `tool/src/types.ts` (`Graph`, `Edge`)
- `docs/specs/2026-05-31-phase2b-md-migration-enforcement-design.md` §2, MIG-01/02/03
</read_first>

**Files:**
- Create: `tool/src/cli/migrate.ts`
- Test: `tool/src/cli/migrate.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/migrate.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCoverage, migrate } from './migrate.js';
import { computeIssues } from './lint.js';
import { readBaseline } from './baseline.js';
import type { Graph, ComponentNode, Edge } from '../types.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function graph(components: ComponentNode[], edges: Edge[] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
const outlet = (from: string): Edge => ({ from, to: null, kind: 'unresolved-static', via: 'template', reason: 'ngComponentOutlet' });
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-mig-')); }

describe('computeCoverage', () => {
  it('counts MD coverage, needingDoc and documented', () => {
    // A: has MD + a covered construct (documented); B: has MD + open gap; C: no MD, no construct
    const g = graph(
      [node('A', 'CA'), node('B', 'CB'), node('C', null)],
      [outlet('A'), outlet('B')],
    );
    // only A is covered → issues will contain gap for B (and missing-md for C)
    const issues = computeIssues(g, new Map([['CA', { schemaVersion: 1, componentId: 'CA', dynamicDeps: [{ target: 'C', reason: 'ngComponentOutlet' }] }]]));
    const cov = computeCoverage(g, issues);
    expect(cov.totalComponents).toBe(3);
    expect(cov.withMd).toBe(2);
    expect(cov.needingDoc).toBe(2);      // A and B have constructs
    expect(cov.documented).toBe(1);      // A covered, B open
    expect(cov.missingMd).toEqual(['src/C.ts']);
  });
});

describe('migrate', () => {
  it('writes a baseline matching computeIssues and a coverage md+json', () => {
    const d = tmp();
    try {
      const g = graph([node('NoMd', null)], [outlet('NoMd')]);
      const overridesDir = join(d, 'component-map');
      const baselinePath = join(d, '.cmap-baseline.json');
      const coveragePath = join(d, 'cmap-coverage.md');
      const r = migrate(g, new Map(), { overridesDir, baselinePath, coveragePath });

      const issues = computeIssues(g, new Map());
      const base = readBaseline(baselinePath);
      expect(new Set(base.entries['src/NoMd.ts'])).toEqual(new Set(issues.get('src/NoMd.ts')));
      expect(existsSync(coveragePath)).toBe(true);
      expect(existsSync(coveragePath.replace(/\.md$/, '.json'))).toBe(true);
      expect(r.coverage.withMd).toBe(0);
      expect(readFileSync(coveragePath, 'utf8')).toContain('Coverage');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/migrate.test.ts`

- [ ] **Step 3: Implement `tool/src/cli/migrate.ts`**

```ts
import { writeFileSync } from 'node:fs';
import type { Graph } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';
import { scaffoldGaps } from '../overrides/gaps.js';
import { computeIssues } from './lint.js';
import { acceptInto, emptyBaseline, writeBaseline } from './baseline.js';

export interface Coverage {
  totalComponents: number;
  withMd: number;
  needingDoc: number;   // components with ≥1 unresolved-static construct
  documented: number;   // needingDoc whose constructs are all covered (no open gap)
  missingMd: string[];  // filePaths with no componentId (sorted)
}

// component ids that have at least one pinnable dynamic construct (mirrors gaps.constructsByComponent keys)
function componentsWithConstructs(graph: Graph): Set<string> {
  const s = new Set<string>();
  for (const e of graph.edges) if (e.kind === 'unresolved-static' && e.reason) s.add(e.from);
  return s;
}

export function computeCoverage(graph: Graph, issues: Map<string, string[]>): Coverage {
  const totalComponents = graph.components.length;
  const withMd = graph.components.filter((c) => c.componentId !== null).length;
  const missingMd = graph.components.filter((c) => c.componentId === null).map((c) => c.filePath).sort();

  const constructIds = componentsWithConstructs(graph);
  const idToFile = new Map(graph.components.map((c) => [c.id, c.filePath]));
  let openGapComponents = 0;
  for (const id of constructIds) {
    const fp = idToFile.get(id);
    if (fp && (issues.get(fp) ?? []).some((c) => c.startsWith('gap:'))) openGapComponents += 1;
  }
  const needingDoc = constructIds.size;
  return { totalComponents, withMd, needingDoc, documented: needingDoc - openGapComponents, missingMd };
}

export function renderCoverageMd(cov: Coverage): string {
  const pct = (n: number, d: number) => (d === 0 ? '100%' : `${Math.round((n / d) * 100)}%`);
  const lines = [
    '# Component Map — Coverage',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Total components | ${cov.totalComponents} |`,
    `| With project MD | ${cov.withMd} / ${cov.totalComponents} (${pct(cov.withMd, cov.totalComponents)}) |`,
    `| Dynamic-dep components documented | ${cov.documented} / ${cov.needingDoc} (${pct(cov.documented, cov.needingDoc)}) |`,
    '',
    `## Components missing project MD (${cov.missingMd.length})`,
    '',
    ...(cov.missingMd.length ? cov.missingMd.map((f) => `- ${f}`) : ['_none_']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export interface MigrateResult {
  scaffolded: string[];
  scaffoldWarnings: string[];
  baselinePath: string;
  coveragePath: string;
  coverage: Coverage;
}

export function migrate(
  graph: Graph,
  overrides: Map<string, CmapOverride>,
  opts: { overridesDir: string; baselinePath: string; coveragePath: string },
): MigrateResult {
  const { written, warnings } = scaffoldGaps(graph, overrides, opts.overridesDir);
  const issues = computeIssues(graph, overrides);
  writeBaseline(opts.baselinePath, acceptInto(emptyBaseline(), issues));
  const coverage = computeCoverage(graph, issues);
  writeFileSync(opts.coveragePath, renderCoverageMd(coverage));
  writeFileSync(opts.coveragePath.replace(/\.md$/, '.json'), `${JSON.stringify(coverage, null, 2)}\n`);
  return { scaffolded: written, scaffoldWarnings: warnings, baselinePath: opts.baselinePath, coveragePath: opts.coveragePath, coverage };
}
```

- [ ] **Step 4: Run, verify PASS** (2 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/cli/migrate.ts src/cli/migrate.test.ts
git commit -m "feat(tool): migrate — bulk scaffold + baseline snapshot + coverage report (MIG-01/02/03)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `migrate` writes scaffolds + a baseline equal to current debt + coverage md/json; `computeCoverage` math correct (withMd, needingDoc, documented, missingMd).
</verify>

<done>
`migrate()` produces all four migration artifacts. Plan 4 exposes it as `cmap migrate` and adds `cmap lint`/`--accept`.
</done>

---

## Self-Review (Plan 3)

- **Spec coverage:** MIG-01 (scaffoldGaps reused for bulk scaffold), MIG-02 (baseline = computeIssues snapshot), MIG-03 (coverage md+json + missing-MD list). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `Coverage`/`MigrateResult` defined + returned; `migrate` uses `scaffoldGaps(graph, overrides, dir)` (M3 signature → `{written, warnings}`), `computeIssues` (Plan 2), `acceptInto`/`emptyBaseline`/`writeBaseline` (Plan 2); `componentsWithConstructs` filters `kind:'unresolved-static' && reason` (matches gaps.ts); `coveragePath.replace(/\.md$/, '.json')` consistent in write + test. NodeNext `.js` imports. ✓
- **Verify bounds:** single task <60s. ✓
