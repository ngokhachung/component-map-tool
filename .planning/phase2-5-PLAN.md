# M3 — Plan 5: PR Comment (renderer + `cmap pr`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Produce the PR-bot Markdown comment: a pure `renderPrComment` (sticky marker, per-component impact/access-paths/gaps, ancestor cap, 65 KB truncation) and a `cmap pr --changed <files>` subcommand that maps changed files → components and renders it.

**Architecture:** Two tasks. T7 = `cli/pr.ts` `renderPrComment(components, opts)` (pure string builder). T8 = `cmap pr` command in `cli/index.ts` (map changed files → nodes via path-suffix, compute impact/access-paths/gaps, call the renderer).

**Tech Stack:** TS/Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "renderPrComment emits a body starting with the hidden marker <!-- cmap-pr-bot -->; per component: id/selector/componentId, description, affected ancestors (capped + '+N more'), UI access paths, undocumented-dynamic-dep gaps; uncertain flagged."
    - "An empty component list still returns the marker + a 'no mapped changes' line (so the sticky comment updates)."
    - "Output is truncated under a byte cap with a '… N more truncated' footer."
    - "`cmap pr --changed a,b` maps each changed file to its component node(s) (path-suffix), skips unmapped/deleted, renders the comment; `npm test` + tsc clean."
  required_artifacts:
    - "tool/src/cli/pr.ts — PrComponent, PR_MARKER, renderPrComment"
    - "tool/src/cli/pr.test.ts"
    - "tool/src/cli/index.ts (+ `pr` command, --changed) + index.test.ts"
  required_wiring:
    - "GitHub Action (Plan 6) runs `cmap pr --changed <diff>` and posts renderPrComment output as a sticky comment."
  key_links:
    - "marker + ancestor cap + byte-cap truncation -> sticky update, no spam, < 65 KB (RESEARCH §1/§8)"
    - "path-suffix file→node mapping; deleted/unmapped skipped (RESEARCH §8)"
```

---

## Wave: PR comment

### Task 7: `renderPrComment` (pure)

<model>opus</model>

<read_first>
- `tool/src/query/index.ts` (ImpactResult, AccessPath); `.planning/phase2-RESEARCH.md` §1/§8 (marker, cap, truncation)
</read_first>

**Files:**
- Create: `tool/src/cli/pr.ts`
- Test: `tool/src/cli/pr.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/pr.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { renderPrComment, PR_MARKER, type PrComponent } from './pr.js';

const base: PrComponent = {
  id: 'DataTableComponent', componentId: 'C001', selector: 'app-data-table', filePath: 'src/x.ts',
  description: 'A reusable table.', ancestors: ['InvoiceListPage', 'ReportDashboardPage'], uncertain: true,
  accessPaths: [{ routeUrl: 'finance/invoices', componentChain: ['InvoiceListPage', 'DataTableComponent'] }],
  gaps: ['ngComponentOutlet'],
};

describe('renderPrComment', () => {
  it('renders marker + component facts', () => {
    const md = renderPrComment([base]);
    expect(md.startsWith(PR_MARKER)).toBe(true);
    expect(md).toContain('DataTableComponent');
    expect(md).toContain('C001');
    expect(md).toContain('InvoiceListPage');
    expect(md).toContain('finance/invoices');
    expect(md).toContain('A reusable table.');
    expect(md).toContain('ngComponentOutlet');
    expect(md.toLowerCase()).toContain('incomplete'); // uncertain note
  });

  it('empty list still returns the marker + a no-changes line', () => {
    const md = renderPrComment([]);
    expect(md.startsWith(PR_MARKER)).toBe(true);
    expect(md.toLowerCase()).toContain('no mapped');
  });

  it('caps ancestors and truncates under the byte cap', () => {
    const many: PrComponent = { ...base, ancestors: Array.from({ length: 30 }, (_, i) => `A${i}`) };
    const capped = renderPrComment([many], { maxAncestors: 5 });
    expect(capped).toContain('(+25 more)');

    const lots = Array.from({ length: 50 }, (_, i) => ({ ...base, id: `Comp${i}` }));
    const truncated = renderPrComment(lots, { maxBytes: 800 });
    expect(truncated.toLowerCase()).toContain('truncated');
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(900);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/pr.test.ts`

- [ ] **Step 3: Implement `tool/src/cli/pr.ts`**

```ts
export const PR_MARKER = '<!-- cmap-pr-bot -->';

export interface PrComponent {
  id: string;
  componentId: string | null;
  selector: string | null;
  filePath: string;
  description: string | null;
  ancestors: string[];
  uncertain: boolean;
  accessPaths: { routeUrl: string; componentChain: string[] }[];
  gaps: string[];
}

function renderOne(c: PrComponent, maxAncestors: number): string {
  const sel = c.selector ? ` (\`${c.selector}\`)` : '';
  const cid = c.componentId ? ` — ${c.componentId}` : '';
  const lines = [`### \`${c.id}\`${sel}${cid}`];
  if (c.description) lines.push(c.description);
  const shown = c.ancestors.slice(0, maxAncestors);
  const more = c.ancestors.length - shown.length;
  const anc = c.ancestors.length ? `${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}` : '_none_';
  lines.push(`**Affected (${c.ancestors.length}):** ${anc}${c.uncertain ? '  ⚠ _impact may be incomplete (dynamic deps)_' : ''}`);
  if (c.accessPaths.length) {
    lines.push(`**UI access paths:** ${c.accessPaths.map((p) => `\`${p.routeUrl}\` ← ${p.componentChain.join(' › ')}`).join(' · ')}`);
  }
  if (c.gaps.length) {
    lines.push(`**⚠ Undocumented dynamic deps:** ${c.gaps.join(', ')} — run \`cmap gaps --write\` and fill the target(s)`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderPrComment(
  components: PrComponent[],
  opts: { maxAncestors?: number; maxBytes?: number } = {},
): string {
  const maxAncestors = opts.maxAncestors ?? 10;
  const maxBytes = opts.maxBytes ?? 60000;
  const header = `${PR_MARKER}\n## 🗺️ Component Map — impact of this PR\n`;
  if (components.length === 0) return `${header}\n_No mapped component changes._\n`;

  const sections = components.map((c) => renderOne(c, maxAncestors));
  const full = `${header}\n${sections.join('\n')}`;
  if (Buffer.byteLength(full, 'utf8') <= maxBytes) return full;

  let acc = `${header}\n`;
  let shown = 0;
  for (const s of sections) {
    if (Buffer.byteLength(`${acc + s}\n`, 'utf8') > maxBytes - 120) break;
    acc += `${s}\n`;
    shown += 1;
  }
  acc += `\n_… ${components.length - shown} more component(s) truncated._\n`;
  return acc;
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/cli/pr.ts src/cli/pr.test.ts
git commit -m "feat(tool): renderPrComment — sticky marker, ancestor cap, byte-cap truncation (BOT-01)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/pr.test.ts && npx tsc --noEmit`
Expected: 3 tests PASS; tsc clean. Marker first; component facts present; empty → no-changes line; ancestors capped + body truncated under the cap.
</verify>

<done>
`renderPrComment` builds the offline sticky-comment markdown (capped/truncated). T8 feeds it from changed files.
</done>

---

### Task 8: `cmap pr --changed` command

<model>sonnet</model>

<read_first>
- `tool/src/cli/index.ts` (runCli, buildEnriched, the command branches), `tool/src/cli/pr.ts` (renderPrComment, PrComponent)
- `tool/src/query/index.ts` (impact, uiAccessPaths), `tool/src/overrides/gaps.ts` (findGaps)
</read_first>

**Files:**
- Modify: `tool/src/cli/index.ts`
- Modify: `tool/src/cli/index.test.ts`

<action>

- [ ] **Step 1: Add imports + the `--changed` option + the `pr` command to `tool/src/cli/index.ts`**

1a. After the existing `import { findGaps, scaffoldGaps } from '../overrides/gaps.js';` line, add:
```ts
import { renderPrComment, type PrComponent } from './pr.js';
```

1b. In the `parseArgs` `options` object, add a `changed` option (after `write`):
```ts
      changed: { type: 'string' },
```

1c. Add this helper just above `export function runCli` (after `imageDataUris`):
```ts
// A repo path and a node filePath match when one is a full-segment suffix of the other
// (changed-file paths from git diff need not share the analyzed root's prefix).
function pathSuffixMatch(a: string, b: string): boolean {
  const x = a.replace(/\\/g, '/').split('/').filter(Boolean);
  const y = b.replace(/\\/g, '/').split('/').filter(Boolean);
  const n = Math.min(x.length, y.length);
  if (n === 0) return false;
  for (let i = 1; i <= n; i++) if (x[x.length - i] !== y[y.length - i]) return false;
  return true;
}
```

1d. Insert the `pr` command branch immediately BEFORE the final `return { code: 1, lines: [USAGE] };`:
```ts
  if (cmd === 'pr') {
    const files = ((values.changed as string | undefined) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const { graph, overrides } = buildEnriched(root, out, docs, overridesDir);
    const gapsByNode = new Map(findGaps(graph, overrides).map((g) => [g.id, g.uncovered]));
    const items: PrComponent[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      for (const node of graph.components.filter((c) => pathSuffixMatch(c.filePath, f))) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        const imp = impact(graph, node.id);
        const paths = uiAccessPaths(graph, node.id);
        items.push({
          id: node.id, componentId: node.componentId, selector: node.selector, filePath: node.filePath,
          description: node.description, ancestors: imp.ancestors, uncertain: imp.uncertain,
          accessPaths: paths.map((p) => ({ routeUrl: p.routeUrl, componentChain: p.componentChain })),
          gaps: gapsByNode.get(node.id) ?? [],
        });
      }
    }
    return { code: 0, lines: [renderPrComment(items)] };
  }
```

1e. Update the `USAGE` constant to include `pr`/`--changed`:
```ts
const USAGE = 'usage: cmap <index|query|gaps|pr> [--root dir] [--docs dir] [--overrides dir] [--out dir] [--html file] [--write] [--changed csv]';
```

- [ ] **Step 2: Add `pr` tests to `tool/src/cli/index.test.ts`** — append (reuses the existing `repo()` helper that has ChildComponent + ParentComponent in `x.ts` where Parent uses Child):

```ts
import { PR_MARKER } from './pr.js';

describe('runCli pr', () => {
  it('renders a sticky PR comment for changed component files', () => {
    const d = repo();
    try {
      const r = runCli(['pr', '--root', d, '--out', join(d, '.cmap'), '--changed', 'x.ts']);
      expect(r.code).toBe(0);
      const md = r.lines.join('\n');
      expect(md.startsWith(PR_MARKER)).toBe(true);
      expect(md).toContain('ChildComponent');
      expect(md).toContain('ParentComponent'); // Child's affected ancestor
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('renders the no-changes comment when nothing maps', () => {
    const d = repo();
    try {
      const r = runCli(['pr', '--root', d, '--out', join(d, '.cmap'), '--changed', 'nope/none.ts']);
      expect(r.code).toBe(0);
      expect(r.lines.join('\n').toLowerCase()).toContain('no mapped');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```
(If `repo()` is defined after this block, move the new `describe` to the end of the file so `repo` is in scope; `repo()` already exists in the file from earlier tasks.)

- [ ] **Step 3: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 4: Commit**

```bash
cd tool && git add src/cli/index.ts src/cli/index.test.ts
git commit -m "feat(tool): cmap pr --changed → sticky PR comment from changed files (BOT-01)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `cmap pr --changed x.ts` emits the marker + ChildComponent/ParentComponent impact; an unmapped path → the no-changes comment.
</verify>

<done>
`cmap pr --changed <files>` maps changed files to components and emits the sticky comment markdown — the GitHub Action (Plan 6) just diffs + posts it.
</done>

---

## Self-Review (Plan 5)

- **Spec coverage:** BOT-01 (renderPrComment pure: marker, per-component impact/access-paths/gaps/description, ancestor cap, byte-cap truncation; `cmap pr --changed` maps files→nodes, skips unmapped). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `PrComponent`/`PR_MARKER`/`renderPrComment` in pr.ts reused by cli; `pr` command builds `PrComponent` from `impact`/`uiAccessPaths`/`findGaps` (+ `node.description` from Plan 1); `pathSuffixMatch` mirrors the MD linker. NodeNext `.js`. ✓
- **Verify bounds:** both <60s. ✓
