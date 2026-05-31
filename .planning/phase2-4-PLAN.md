# M3 — Plan 4: CLI wiring (overrides + `cmap gaps`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the overrides layer into the CLI build path (`index`/`query` see `via:'override'` edges) and add the `cmap gaps [--write]` subcommand.

**Architecture:** One task: rewrite `tool/src/cli/index.ts` — `buildEnriched` now reads + applies overrides after MD enrich, and a new `gaps` command reports (`findGaps`) or scaffolds (`scaffoldGaps`). New flags `--overrides <dir>` (default `docs/component-map`) and `--write`.

**Tech Stack:** node:util parseArgs, TS/Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "buildEnriched applies overrides (readOverrides → applyOverrides) after enrichGraph, then re-writes graph.json; index/query reflect override edges."
    - "`cmap gaps` lists components with undocumented dynamic deps (id + constructs); `cmap gaps --write` scaffolds .cmap.yaml in the overrides dir."
    - "Existing index/query behavior unchanged; full suite + tsc clean."
  required_artifacts:
    - "tool/src/cli/index.ts (overrides wiring + gaps command + --overrides/--write)"
    - "tool/src/cli/index.test.ts (gaps tests)"
  required_wiring:
    - "Uses readOverrides (Plan 2) + applyOverrides (Plan 2) + findGaps/scaffoldGaps (Plan 3); the PR bot (Plan 5/6) reuses buildEnriched."
  key_links:
    - "enrich (componentId) BEFORE applyOverrides (keyed by componentId)"
    - "--overrides default docs/component-map; applyOverrides no-op on empty dir"
```

---

## Wave: CLI wiring

### Task 6: Overrides wiring + `cmap gaps`

<model>sonnet</model>

<read_first>
- `tool/src/cli/index.ts` (current runCli/buildEnriched), `tool/src/cli/index.test.ts`
- `tool/src/overrides/parse.ts` (readOverrides), `merge.ts` (applyOverrides), `gaps.ts` (findGaps, scaffoldGaps)
</read_first>

**Files:**
- Modify (full rewrite): `tool/src/cli/index.ts`
- Modify: `tool/src/cli/index.test.ts`

<action>

- [ ] **Step 1: Replace `tool/src/cli/index.ts` with** (verbatim — supersedes the current file):

```ts
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { buildIncremental } from '../cache/index.js';
import { enrichGraph } from '../md/index.js';
import { writeGraph } from '../graph/index.js';
import { resolveLocator } from '../query/locator.js';
import { impact, uiAccessPaths } from '../query/index.js';
import { readOverrides } from '../overrides/parse.js';
import { applyOverrides } from '../overrides/merge.js';
import { findGaps, scaffoldGaps } from '../overrides/gaps.js';
import type { CmapOverride } from '../overrides/schema.js';
import { renderHtml, type HtmlData } from './html.js';
import type { Graph } from '../types.js';

export interface CliResult { code: number; lines: string[]; }

interface Built {
  graph: Graph;
  parseErrors: { component: string; messages: string[] }[];
  warnings: string[];
  fromCache: boolean;
  overrides: Map<string, CmapOverride>;
}

// Build → MD enrich (sets componentId) → read+apply overrides (keyed by componentId) → persist.
function buildEnriched(root: string, out: string, docs: string | undefined, overridesDir: string): Built {
  const { graph, parseErrors, fromCache } = buildIncremental(root, out);
  const warnings: string[] = [];
  if (docs) warnings.push(...enrichGraph(graph, docs).warnings);
  const { overrides, warnings: ovWarnings } = readOverrides(overridesDir);
  warnings.push(...ovWarnings);
  if (overrides.size > 0) warnings.push(...applyOverrides(graph, overrides).warnings);
  if (docs || overrides.size > 0) writeGraph(graph, out);
  return { graph, parseErrors, warnings, fromCache, overrides };
}

const SAFE_IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

// Read MD-referenced images as base64 data URIs for the self-contained HTML.
// SECURITY: refuse any image path that escapes the docs folder or has a non-image extension.
export function imageDataUris(
  images: { caption: string | null; path: string }[],
  docs: string | undefined,
): { caption: string | null; dataUri: string }[] {
  if (!docs) return [];
  const out: { caption: string | null; dataUri: string }[] = [];
  for (const img of images) {
    const p = resolve(docs, img.path);
    const rel = relative(resolve(docs), p);
    if (rel.startsWith('..') || isAbsolute(rel)) continue;
    const ext = extname(p).slice(1).toLowerCase();
    if (!SAFE_IMG_EXT.has(ext)) continue;
    if (existsSync(p)) {
      out.push({ caption: img.caption, dataUri: `data:image/${ext};base64,${readFileSync(p).toString('base64')}` });
    }
  }
  return out;
}

const USAGE = 'usage: cmap <index|query|gaps> [--root dir] [--docs dir] [--overrides dir] [--out dir] [--html file] [--write]';

export function runCli(argv: string[]): CliResult {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string', default: '.' },
      docs: { type: 'string' },
      out: { type: 'string', default: '.cmap' },
      html: { type: 'string' },
      overrides: { type: 'string' },
      write: { type: 'boolean', default: false },
    },
  });
  const cmd = positionals[0];
  const root = values.root as string;
  const out = values.out as string;
  const docs = values.docs as string | undefined;
  const overridesDir = (values.overrides as string | undefined) ?? 'docs/component-map';

  if (cmd === 'index') {
    const { graph, parseErrors, warnings, fromCache } = buildEnriched(root, out, docs, overridesDir);
    return { code: 0, lines: [JSON.stringify({
      components: graph.components.length, edges: graph.edges.length, routes: graph.routes.length,
      parseErrorComponents: parseErrors.length, warnings: warnings.length, fromCache,
    }, null, 2)] };
  }

  if (cmd === 'query') {
    const locator = positionals[1];
    if (!locator) return { code: 1, lines: [USAGE] };
    const { graph } = buildEnriched(root, out, docs, overridesDir);
    const r = resolveLocator(graph, locator);
    if (!r.ok) {
      if (r.reason === 'ambiguous') return { code: 1, lines: [`ambiguous locator "${locator}"; candidates:`, ...r.candidates.map((c) => `  ${c.id}  (${c.filePath})`)] };
      return { code: 1, lines: [`no component found for "${locator}"`] };
    }
    const node = r.node;
    const imp = impact(graph, node.id);
    const paths = uiAccessPaths(graph, node.id);
    if (values.html) {
      const data: HtmlData = {
        component: { id: node.id, componentId: node.componentId, selector: node.selector, filePath: node.filePath, standalone: node.standalone, module: node.module },
        impact: imp, accessPaths: paths, images: imageDataUris(node.images, docs),
      };
      writeFileSync(values.html as string, renderHtml(data));
      return { code: 0, lines: [`wrote ${values.html}`] };
    }
    return { code: 0, lines: [JSON.stringify({
      component: { id: node.id, componentId: node.componentId, selector: node.selector, filePath: node.filePath, standalone: node.standalone, module: node.module, images: node.images },
      impact: imp, accessPaths: paths,
    }, null, 2)] };
  }

  if (cmd === 'gaps') {
    const { graph, overrides, warnings } = buildEnriched(root, out, docs, overridesDir);
    if (values.write) {
      const { written, warnings: w2 } = scaffoldGaps(graph, overrides, overridesDir);
      return { code: 0, lines: [`scaffolded ${written.length} override file(s) in ${overridesDir}`, ...written.map((f) => `  ${f}`), ...w2] };
    }
    const gaps = findGaps(graph, overrides);
    if (gaps.length === 0) return { code: 0, lines: ['no gaps — all components are statically complete or documented'] };
    return { code: 0, lines: [`${gaps.length} component(s) need documentation:`, ...gaps.map((g) => `  ${g.componentId ?? g.id} (${g.filePath}): ${g.uncovered.join(', ')}`), ...warnings] };
  }

  return { code: 1, lines: [USAGE] };
}
```

- [ ] **Step 2: Run the existing tests to confirm no regression**

Run: `cd tool && npx vitest run src/cli/index.test.ts`
Expected: the existing index/query/html tests still PASS (the index summary now has `warnings` instead of `mdWarnings`, but no test asserts that key).

- [ ] **Step 3: Add `gaps` tests to `tool/src/cli/index.test.ts`** — append:

```ts
describe('runCli gaps', () => {
  function dynRepo(): string {
    const d = mkdtempSync(join(tmpdir(), 'cmap-gap-'));
    writeFileSync(join(d, 'h.ts'), `
      import { Component, NgModule } from '@angular/core';
      @Component({ selector: 'app-host', template: '<ng-container *ngComponentOutlet="w"></ng-container>' })
      export class HostComponent {}
      @NgModule({ declarations: [HostComponent] }) export class M {}`);
    return d;
  }

  it('lists components with undocumented dynamic deps', () => {
    const d = dynRepo();
    try {
      const r = runCli(['gaps', '--root', d, '--out', join(d, '.cmap'), '--overrides', join(d, 'docs/cmap')]);
      expect(r.code).toBe(0);
      const text = r.lines.join('\n');
      expect(text).toContain('HostComponent');
      expect(text).toContain('ngComponentOutlet');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('gaps --write warns when a gap component has no componentId', () => {
    const d = dynRepo();
    try {
      const r = runCli(['gaps', '--write', '--root', d, '--out', join(d, '.cmap'), '--overrides', join(d, 'docs/cmap')]);
      expect(r.code).toBe(0);
      expect(r.lines.join('\n').toLowerCase()).toContain('componentid');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 4: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/cli/index.ts src/cli/index.test.ts
git commit -m "feat(tool): wire applyOverrides into build + cmap gaps [--write] (OVR-03/04 CLI)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `cmap gaps` lists a component with `ngComponentOutlet`; `gaps --write` on a componentId-less component warns; index/query unchanged and now apply overrides when `docs/component-map/*.cmap.yaml` exist.
</verify>

<done>
The CLI builds with overrides applied (query/index see `via:'override'` edges) and exposes the gap report + scaffolder. Plan 5/6 add the PR comment + GitHub Action reusing this build path.
</done>

---

## Self-Review (Plan 4)

- **Spec coverage:** OVR-03/04 CLI surface (`cmap gaps [--write]`), overrides wired into the build (OVR-02 applied at index/query). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `buildEnriched` returns `overrides: Map<string,CmapOverride>` reused by `gaps`; enrich-before-applyOverrides ordering; `findGaps`/`scaffoldGaps`/`readOverrides`/`applyOverrides` signatures from Plans 2-3; index summary key `warnings` (no test asserts the old `mdWarnings`). NodeNext `.js`. ✓
- **Verify bounds:** <60s. ✓
