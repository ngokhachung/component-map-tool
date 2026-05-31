# M6 — Plan 1: Audit core (report + git mtimes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Compute a maintenance audit — git-based stale docs + coverage + override orphans + open gaps — as a pure function over the graph, plus a git-mtime helper to feed it.

**Architecture:** Two tasks. T1 = `audit/report.ts` (`auditReport` + `renderAuditMd`, pure; reuses `findGaps`/`computeCoverage`/`computeIssues`; staleness from an injected `mtimes` map). T2 = `audit/mtime.ts` (`gitMtimes` via `git log -1 --format=%ct`, isolated so the report stays pure/testable).

**Tech Stack:** TS/Node ESM, vitest, `git` CLI.

---

```yaml
must_haves:
  observable_truths:
    - "auditReport flags a component as stale (kind 'md') when its git mtime > its linked MD doc's mtime, and (kind 'override') when its git mtime > its `.cmap.yaml` mtime; not stale when the doc is newer or mtimes are missing."
    - "auditReport lists override componentIds that match no node's componentId as overrideOrphans; passes through findGaps as gaps and computeCoverage as coverage; passes through injected warnings."
    - "gitMtime returns a positive epoch for a tracked file and null for an unknown path."
    - "tsc --noEmit clean; unit tests green."
  required_artifacts:
    - "tool/src/audit/report.ts (AuditReport, StaleEntry, auditReport, renderAuditMd)"
    - "tool/src/audit/mtime.ts (gitMtime, gitMtimes)"
    - "tests for each"
  required_wiring:
    - "cli/index.ts (Plan 2) `audit` command builds mtimes via gitMtimes (real paths) and calls auditReport; Azure audit pipeline (Plan 3) runs `cmap audit`."
  key_links:
    - "injected mtimes → pure/testable staleness; git-time available in CI with full history (MNT-01)"
    - "reuse findGaps + computeCoverage + computeIssues → no duplicate logic"
```

---

## File Structure

- `tool/src/audit/report.ts` — pure audit computation + markdown render. One responsibility: graph → audit report.
- `tool/src/audit/mtime.ts` — git last-commit-time lookup. One responsibility: path → epoch.
- Tests alongside.

---

## Wave 1: Audit core

### Task 1: auditReport + renderAuditMd

<model>sonnet</model>

<read_first>
- `tool/src/types.ts` (Graph, ComponentNode — `filePath`, `docPath`, `componentId`), `tool/src/overrides/gaps.ts` (`findGaps` → `{id, componentId, filePath, uncovered}`), `tool/src/cli/migrate.ts` (`computeCoverage`, `Coverage`), `tool/src/cli/lint.ts` (`computeIssues`), `tool/src/overrides/schema.ts` (`CmapOverride`)
- `docs/specs/2026-05-31-phase4-maintenance-design.md` §2 + MNT-01
</read_first>

**Files:**
- Create: `tool/src/audit/report.ts`
- Test: `tool/src/audit/report.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/audit/report.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { posix } from 'node:path';
import { auditReport, renderAuditMd } from './report.js';
import type { Graph, ComponentNode, Edge } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';

function node(id: string, over: Partial<ComponentNode> = {}): ComponentNode {
  return { id, componentId: null, className: id, selector: null, filePath: `app/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null, ...over };
}
function graph(components: ComponentNode[], edges: Edge[] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
const ROOT = 'src';

describe('auditReport', () => {
  it('flags md-stale when component is newer than its doc, not when older', () => {
    const fresh = node('Fresh', { docPath: 'docs/Fresh.md' });
    const stale = node('Stale', { docPath: 'docs/Stale.md' });
    const g = graph([fresh, stale]);
    const mtimes = new Map<string, number>([
      [posix.join(ROOT, 'app/Fresh.ts'), 100], ['docs/Fresh.md', 200],   // doc newer → ok
      [posix.join(ROOT, 'app/Stale.ts'), 300], ['docs/Stale.md', 100],   // component newer → stale
    ]);
    const r = auditReport(g, new Map(), { mtimes, root: ROOT, overrideFiles: new Map(), warnings: [] });
    expect(r.stale.map((s) => s.component)).toEqual(['Stale']);
    expect(r.stale[0].kind).toBe('md');
  });

  it('flags override-stale and lists override orphans', () => {
    const g = graph([node('Host', { componentId: 'C1' })]);
    const overrides = new Map<string, CmapOverride>([
      ['C1', { schemaVersion: 1, componentId: 'C1', dynamicDeps: [] }],
      ['GHOST', { schemaVersion: 1, componentId: 'GHOST', dynamicDeps: [] }],   // matches no node
    ]);
    const overrideFiles = new Map([['C1', 'docs/component-map/C1.cmap.yaml'], ['GHOST', 'docs/component-map/GHOST.cmap.yaml']]);
    const mtimes = new Map<string, number>([
      [posix.join(ROOT, 'app/Host.ts'), 500], ['docs/component-map/C1.cmap.yaml', 100],   // component newer → stale
    ]);
    const r = auditReport(g, overrides, { mtimes, root: ROOT, overrideFiles, warnings: ['w1'] });
    expect(r.stale.some((s) => s.kind === 'override' && s.component === 'Host')).toBe(true);
    expect(r.overrideOrphans).toEqual(['GHOST']);
    expect(r.warnings).toEqual(['w1']);
  });

  it('renders a markdown report with the expected sections', () => {
    const g = graph([node('A')]);
    const md = renderAuditMd(auditReport(g, new Map(), { mtimes: new Map(), root: ROOT, overrideFiles: new Map(), warnings: [] }));
    expect(md).toContain('# Component Map — Audit');
    expect(md).toContain('## Stale');
    expect(md).toContain('## Coverage');
    expect(md).toContain('## Orphans');
    expect(md).toContain('## Open gaps');
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/audit/report.test.ts`

- [ ] **Step 3: Implement `tool/src/audit/report.ts`**

```ts
import { posix } from 'node:path';
import type { Graph } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';
import { findGaps } from '../overrides/gaps.js';
import { computeCoverage, type Coverage } from '../cli/migrate.js';
import { computeIssues } from '../cli/lint.js';

export interface StaleEntry {
  component: string;
  kind: 'md' | 'override';
  componentFile: string;
  docFile: string;
  componentMtime: number;
  docMtime: number;
}
export interface AuditReport {
  stale: StaleEntry[];
  coverage: Coverage;
  overrideOrphans: string[];
  gaps: { component: string; filePath: string; uncovered: string[] }[];
  warnings: string[];
}

export interface AuditOpts {
  mtimes: Map<string, number>;      // keyed by: posix.join(root, filePath) | docPath | override file path
  root: string;
  overrideFiles: Map<string, string>;  // componentId → override file path
  warnings: string[];
}

export function auditReport(graph: Graph, overrides: Map<string, CmapOverride>, opts: AuditOpts): AuditReport {
  const { mtimes, root, overrideFiles, warnings } = opts;
  const stale: StaleEntry[] = [];
  for (const node of graph.components) {
    const compM = mtimes.get(posix.join(root, node.filePath));
    if (compM === undefined) continue;
    if (node.docPath) {
      const docM = mtimes.get(node.docPath);
      if (docM !== undefined && compM > docM) {
        stale.push({ component: node.id, kind: 'md', componentFile: node.filePath, docFile: node.docPath, componentMtime: compM, docMtime: docM });
      }
    }
    if (node.componentId && overrides.has(node.componentId)) {
      const ovPath = overrideFiles.get(node.componentId);
      const ovM = ovPath ? mtimes.get(ovPath) : undefined;
      if (ovPath && ovM !== undefined && compM > ovM) {
        stale.push({ component: node.id, kind: 'override', componentFile: node.filePath, docFile: ovPath, componentMtime: compM, docMtime: ovM });
      }
    }
  }
  const nodeIds = new Set(graph.components.map((c) => c.componentId).filter((x): x is string => x !== null));
  const overrideOrphans = [...overrides.keys()].filter((id) => !nodeIds.has(id)).sort();
  const issues = computeIssues(graph, overrides);
  const coverage = computeCoverage(graph, issues);
  const gaps = findGaps(graph, overrides).map((g) => ({ component: g.componentId ?? g.id, filePath: g.filePath, uncovered: g.uncovered }));
  return { stale, coverage, overrideOrphans, gaps, warnings };
}

export function renderAuditMd(r: AuditReport): string {
  const pct = (n: number, d: number) => (d === 0 ? '100%' : `${Math.round((n / d) * 100)}%`);
  const lines = [
    '# Component Map — Audit',
    '',
    `## Stale docs (${r.stale.length})`,
    '',
    ...(r.stale.length
      ? r.stale.map((s) => `- \`${s.component}\` — ${s.kind} doc \`${s.docFile}\` is older than the component (\`${s.componentFile}\`)`)
      : ['_none — all docs are at least as new as their components_']),
    '',
    '## Coverage',
    '',
    `- With project MD: ${r.coverage.withMd} / ${r.coverage.totalComponents} (${pct(r.coverage.withMd, r.coverage.totalComponents)})`,
    `- Dynamic-dep components documented: ${r.coverage.documented} / ${r.coverage.needingDoc} (${pct(r.coverage.documented, r.coverage.needingDoc)})`,
    '',
    `## Orphans (${r.overrideOrphans.length} override(s) with no matching component)`,
    '',
    ...(r.overrideOrphans.length ? r.overrideOrphans.map((o) => `- \`${o}\``) : ['_none_']),
    '',
    `## Open gaps (${r.gaps.length})`,
    '',
    ...(r.gaps.length ? r.gaps.map((g) => `- \`${g.component}\` (${g.filePath}): ${g.uncovered.join(', ')}`) : ['_none_']),
    '',
  ];
  if (r.warnings.length) lines.push('## Warnings', '', ...r.warnings.map((w) => `- ${w}`), '');
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/audit/report.ts src/audit/report.test.ts
git commit -m "feat(tool): auditReport — git-stale + coverage + orphans + gaps (MNT-01)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/audit/report.test.ts && npx tsc --noEmit`
Expected: 3 PASS; tsc clean.
</verify>

<done>
The audit core is pure + testable. T2 supplies real git mtimes; Plan 2 wires `cmap audit`.
</done>

---

### Task 2: gitMtimes

<model>sonnet</model>

<read_first>
- `docs/specs/2026-05-31-phase4-maintenance-design.md` §2 (mtimes injected; CLI populates via `git log -1 --format=%ct`)
</read_first>

**Files:**
- Create: `tool/src/audit/mtime.ts`
- Test: `tool/src/audit/mtime.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/audit/mtime.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { gitMtime, gitMtimes } from './mtime.js';

describe('gitMtime', () => {
  it('returns a positive epoch for a tracked file', () => {
    // run from tool/ ; package.json is tracked
    const t = gitMtime('package.json');
    expect(typeof t).toBe('number');
    expect(t as number).toBeGreaterThan(0);
  });
  it('returns null for an unknown path', () => {
    expect(gitMtime('no/such/file-xyz-123.ts')).toBeNull();
  });
  it('gitMtimes maps only the resolvable paths', () => {
    const m = gitMtimes(['package.json', 'no/such/file-xyz-123.ts']);
    expect(m.has('package.json')).toBe(true);
    expect(m.has('no/such/file-xyz-123.ts')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/audit/mtime.test.ts`

- [ ] **Step 3: Implement `tool/src/audit/mtime.ts`**

```ts
import { execFileSync } from 'node:child_process';

// Last-commit (author) epoch seconds for a path, or null if untracked / no history / git error.
export function gitMtime(path: string): number | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { encoding: 'utf8' }).trim();
    if (!out) return null;
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Map each path to its git mtime, omitting paths with no resolvable time.
export function gitMtimes(paths: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of paths) {
    const t = gitMtime(p);
    if (t !== null) m.set(p, t);
  }
  return m;
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests).

- [ ] **Step 5: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (expect green + clean).

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/audit/mtime.ts src/audit/mtime.test.ts
git commit -m "feat(tool): gitMtimes — git last-commit-time lookup for audit staleness (MNT-01)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `gitMtime` → epoch for tracked, null for unknown; `gitMtimes` omits unresolvable.
</verify>

<done>
Real git mtimes feed the pure `auditReport`. Plan 2 wires both into `cmap audit`.
</done>

---

## Self-Review (Plan 1)

- **Spec coverage:** MNT-01 core — staleness (md + override) from injected mtimes, coverage/gaps/orphans, markdown render; git mtime helper. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `AuditReport`/`StaleEntry`/`AuditOpts` defined + consumed in render; reuses `findGaps` (`{id,componentId,filePath,uncovered}`), `computeCoverage`/`Coverage` (migrate.ts), `computeIssues` (lint.ts); mtimes keyed by `posix.join(root, filePath)` / `docPath` / override-path — Plan 2 builds the SAME keys. NodeNext `.js`. ✓
- **Verify bounds:** both tasks <60s. ✓
