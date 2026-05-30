# Phase 1 — Plan 9: CLI + HTML Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the tool usable: a thin CLI (`cmap index`, `cmap query <locator>`) over the build+cache+enrich+query stack, JSON output, plus a single self-contained HTML preview (`--html`) that embeds the component's images (base64) alongside its impact + UI access paths.

**Architecture:** Two tasks, ordered to avoid forward deps. **Task 16** = `cli/html.ts` `renderHtml(data)` — a pure, offline, self-contained HTML string builder (images as `data:` URIs). **Task 17** = `cli/index.ts` `runCli(argv)` (parseArgs; `index`/`query`; reads MD image files → base64 → `renderHtml` on `--html`) + `cli/run.ts` entry + an npm `cmap` script.

**Tech Stack:** `node:util` parseArgs (Node ≥20), node:fs, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "renderHtml produces one self-contained HTML document (inline CSS, <img src=data:...>) containing the component id, impact ancestors, and access paths; no external references."
    - "runCli ['index', ...] builds (cache) + enriches (if --docs) and prints a summary JSON; exit 0."
    - "runCli ['query', <locator>, ...] prints JSON { component, impact, accessPaths }; ambiguous/not-found exit 1; --html writes a preview file."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/cli/html.ts — renderHtml(data) -> string"
    - "tool/src/cli/index.ts — runCli(argv) -> { code, lines }"
    - "tool/src/cli/run.ts — entry (calls runCli, prints, exits)"
    - "tool/package.json — add `cmap` script"
    - "tests for html + cli"
  required_wiring:
    - "runCli composes buildIncremental (Plan 6) + enrichGraph (Plan 8) + writeGraph (Plan 5) + resolveLocator (Plan 7) + impact/uiAccessPaths (Plan 7) + renderHtml (Task 16)."
  key_links:
    - "node:util parseArgs (Node>=20) -> zero-dep CLI (RESEARCH §8)"
    - "self-contained HTML + base64 images -> offline single-file (security constraint, SAC-12)"
    - "enrichGraph applied every run -> MD changes always reflected (cache keys .ts only)"
```

---

## File Structure

- `tool/src/cli/html.ts` — pure HTML rendering. One responsibility: data → self-contained HTML.
- `tool/src/cli/index.ts` — argument parsing + command orchestration. One responsibility: turn argv into actions/output.
- `tool/src/cli/run.ts` — process entry glue (print + exit).
- Tests for html + cli.

---

## Wave: CLI + HTML

### Task 16: Self-contained HTML preview renderer

<model>sonnet</model>

<read_first>
- `tool/src/query/index.ts` (ImpactResult, AccessPath shapes), `tool/src/types.ts`
- `docs/specs/2026-05-30-phase1-static-analysis-core-design.md` §10 (SAC-12 offline single-file)
</read_first>

**Files:**
- Create: `tool/src/cli/html.ts`
- Test: `tool/src/cli/html.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/html.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { renderHtml } from './html.js';

const data = {
  component: { id: 'InvoiceListPage', componentId: 'C001', selector: 'app-invoice-list-page', filePath: 'src/app/x.ts', standalone: false, module: 'FinanceModule' },
  impact: { target: 'InvoiceListPage', ancestors: ['AppComponent'], uncertain: true, uncertainReason: '2 indirect deps' },
  accessPaths: [{ routeUrl: 'finance/invoices', componentChain: ['InvoiceListPage'], uncertain: false }],
  images: [{ caption: 'Label', dataUri: 'data:image/png;base64,AAAA' }],
};

describe('renderHtml', () => {
  it('produces a self-contained HTML document with the key facts', () => {
    const html = renderHtml(data);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('InvoiceListPage');
    expect(html).toContain('C001');
    expect(html).toContain('finance/invoices');
    expect(html).toContain('AppComponent');
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).not.toMatch(/src="https?:/); // no external refs
  });

  it('escapes HTML in text fields', () => {
    const html = renderHtml({ ...data, component: { ...data.component, filePath: '<x>&"' } });
    expect(html).toContain('&lt;x&gt;&amp;&quot;');
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/html.test.ts`

- [ ] **Step 3: Implement `tool/src/cli/html.ts`**

```ts
import type { ImpactResult, AccessPath } from '../query/index.js';

export interface HtmlData {
  component: {
    id: string; componentId: string | null; selector: string | null;
    filePath: string; standalone: boolean; module: string | null;
  };
  impact: ImpactResult;
  accessPaths: AccessPath[];
  images: { caption: string | null; dataUri: string }[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderHtml(data: HtmlData): string {
  const c = data.component;
  const imgs = data.images
    .map((i) => `<figure><img src="${esc(i.dataUri)}" alt="${esc(i.caption ?? '')}"/><figcaption>${esc(i.caption ?? '')}</figcaption></figure>`)
    .join('\n');
  const ancestors = data.impact.ancestors.length
    ? `<ul>${data.impact.ancestors.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`
    : '<p>(none)</p>';
  const paths = data.accessPaths.length
    ? `<ul>${data.accessPaths.map((p) => `<li><code>${esc(p.routeUrl)}</code> — ${p.componentChain.map(esc).join(' › ')}${p.uncertain ? ' <em>(uncertain)</em>' : ''}</li>`).join('')}</ul>`
    : '<p>(none)</p>';
  const uncertainNote = data.impact.uncertain ? `<p class="warn">⚠ ${esc(data.impact.uncertainReason ?? 'impact may be incomplete')}</p>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${esc(c.id)} — component map</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; max-width: 60rem; }
  h1 { margin-bottom: .25rem; } .meta { color: #555; }
  figure { display: inline-block; margin: .5rem; vertical-align: top; }
  img { max-width: 24rem; border: 1px solid #ccc; } figcaption { color: #555; font-size: 12px; }
  .warn { color: #b00; } code { background: #f4f4f4; padding: 0 .2rem; }
</style></head><body>
<h1>${esc(c.id)}</h1>
<p class="meta">componentId: <strong>${esc(c.componentId ?? '—')}</strong> · selector: <code>${esc(c.selector ?? '—')}</code>
 · standalone: ${c.standalone} · module: ${esc(c.module ?? '—')}<br/><code>${esc(c.filePath)}</code></p>
<section><h2>Images</h2>${imgs || '<p>(none)</p>'}</section>
<section><h2>Impact (affected ancestors)</h2>${uncertainNote}${ancestors}</section>
<section><h2>UI access paths</h2>${paths}</section>
</body></html>`;
}
```

- [ ] **Step 4: Run, verify PASS** (2 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/cli/html.ts src/cli/html.test.ts
git commit -m "feat(tool): self-contained HTML preview renderer (base64 images, offline)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/html.test.ts && npx tsc --noEmit`
Expected: 2 tests PASS; tsc clean. The HTML is one document, embeds the image as a `data:` URI, shows id/componentId/selector/impact/access-paths, escapes text, and has no `http(s)` refs.
</verify>

<done>
`renderHtml` builds an offline, single-file HTML preview from query data. Task 17 feeds it base64 images + query results behind `cmap query --html`.
</done>

---

### Task 17: CLI (`cmap index` / `cmap query`) + entry

<model>sonnet</model>

<read_first>
- `tool/src/cache/index.ts` (buildIncremental), `tool/src/md/index.ts` (enrichGraph), `tool/src/graph/index.ts` (writeGraph), `tool/src/query/locator.ts` (resolveLocator), `tool/src/query/index.ts` (impact, uiAccessPaths), `tool/src/cli/html.ts` (renderHtml)
- `.planning/phase1-RESEARCH.md` §8 (node:util parseArgs)
</read_first>

**Files:**
- Create: `tool/src/cli/index.ts`
- Test: `tool/src/cli/index.test.ts`
- Create: `tool/src/cli/run.ts`
- Modify: `tool/package.json` (add `cmap` script)

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

function repo(): string {
  const d = mkdtempSync(join(tmpdir(), 'cmap-cli-'));
  writeFileSync(join(d, 'x.ts'), `
    import { Component, NgModule } from '@angular/core';
    @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
    @Component({ selector: 'app-parent', template: '<app-child></app-child>' }) export class ParentComponent {}
    @NgModule({ declarations: [ChildComponent, ParentComponent] }) export class M {}`);
  return d;
}

describe('runCli index', () => {
  it('builds and reports a summary (exit 0)', () => {
    const d = repo();
    try {
      const r = runCli(['index', '--root', d, '--out', join(d, '.cmap')]);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.lines.join('\n')).components).toBe(2);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('runCli query', () => {
  it('returns impact + access paths JSON', () => {
    const d = repo();
    try {
      const r = runCli(['query', 'ChildComponent', '--root', d, '--out', join(d, '.cmap')]);
      expect(r.code).toBe(0);
      const out = JSON.parse(r.lines.join('\n'));
      expect(out.component.id).toBe('ChildComponent');
      expect(out.impact.ancestors).toContain('ParentComponent');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('writes an HTML preview with --html', () => {
    const d = repo();
    try {
      const html = join(d, 'preview.html');
      const r = runCli(['query', 'ChildComponent', '--root', d, '--out', join(d, '.cmap'), '--html', html]);
      expect(r.code).toBe(0);
      expect(existsSync(html)).toBe(true);
      expect(readFileSync(html, 'utf8')).toContain('ChildComponent');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('exits 1 on not-found and on missing locator', () => {
    const d = repo();
    try {
      expect(runCli(['query', 'Nope', '--root', d, '--out', join(d, '.cmap')]).code).toBe(1);
      expect(runCli(['query', '--root', d]).code).toBe(1);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/index.test.ts`

- [ ] **Step 3: Implement `tool/src/cli/index.ts`**

```ts
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { buildIncremental } from '../cache/index.js';
import { enrichGraph } from '../md/index.js';
import { writeGraph } from '../graph/index.js';
import { resolveLocator } from '../query/locator.js';
import { impact, uiAccessPaths } from '../query/index.js';
import { renderHtml, type HtmlData } from './html.js';
import type { Graph } from '../types.js';

export interface CliResult { code: number; lines: string[]; }

function buildEnriched(root: string, out: string, docs: string | undefined): { graph: Graph; parseErrors: { component: string; messages: string[] }[]; warnings: string[]; fromCache: boolean } {
  const { graph, parseErrors, fromCache } = buildIncremental(root, out);
  let warnings: string[] = [];
  if (docs) { warnings = enrichGraph(graph, docs).warnings; writeGraph(graph, out); }
  return { graph, parseErrors, warnings, fromCache };
}

function imageDataUris(images: { caption: string | null; path: string }[], docs: string | undefined): { caption: string | null; dataUri: string }[] {
  if (!docs) return [];
  const out: { caption: string | null; dataUri: string }[] = [];
  for (const img of images) {
    const p = join(docs, img.path);
    if (existsSync(p)) {
      const ext = extname(p).slice(1).toLowerCase() || 'png';
      out.push({ caption: img.caption, dataUri: `data:image/${ext};base64,${readFileSync(p).toString('base64')}` });
    }
  }
  return out;
}

export function runCli(argv: string[]): CliResult {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string', default: '.' },
      docs: { type: 'string' },
      out: { type: 'string', default: '.cmap' },
      html: { type: 'string' },
    },
  });
  const cmd = positionals[0];
  const root = values.root as string;
  const out = values.out as string;
  const docs = values.docs as string | undefined;

  if (cmd === 'index') {
    const { graph, parseErrors, warnings, fromCache } = buildEnriched(root, out, docs);
    return { code: 0, lines: [JSON.stringify({
      components: graph.components.length, edges: graph.edges.length, routes: graph.routes.length,
      parseErrorComponents: parseErrors.length, mdWarnings: warnings.length, fromCache,
    }, null, 2)] };
  }

  if (cmd === 'query') {
    const locator = positionals[1];
    if (!locator) return { code: 1, lines: ['usage: cmap query <locator> [--root dir] [--docs dir] [--out dir] [--html file]'] };
    const { graph } = buildEnriched(root, out, docs);
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

  return { code: 1, lines: ['usage: cmap <index|query> [--root dir] [--docs dir] [--out dir] [--html file]'] };
}
```

- [ ] **Step 4: Run, verify PASS** (4 tests).

- [ ] **Step 5: Create `tool/src/cli/run.ts`** (process entry)

```ts
import { runCli } from './index.js';

const result = runCli(process.argv.slice(2));
for (const line of result.lines) console.log(line);
process.exit(result.code);
```

- [ ] **Step 6: Add the `cmap` script to `tool/package.json`**

In the `scripts` block, add (keep the existing scripts):
```json
"cmap": "tsx src/cli/run.ts"
```

- [ ] **Step 7: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 8: Smoke the real CLI**

Run: `cd tool && npm run cmap -- query app-data-table --root ../poc/real-sample/src`
Expected: exit 0, JSON with `component.id` = `DataTableComponent` and an `impact`/`accessPaths` block. (Confirms the wired CLI runs on real v15 code.)

- [ ] **Step 9: Commit**

```bash
cd tool && git add src/cli/index.ts src/cli/index.test.ts src/cli/run.ts package.json
git commit -m "feat(tool): cmap CLI (index/query, --html) via node:util parseArgs + entry"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `index` prints a summary; `query <locator>` prints impact+accessPaths JSON; `--html` writes a preview file containing the component id; not-found / missing-locator exit 1. Step 8 confirms it runs on the real Angular 15 sample.
</verify>

<done>
`cmap index` and `cmap query <locator>` (JSON or `--html` preview) wire the whole pipeline (build+cache → MD enrich → locator → impact + UI access path) into a usable tool, runnable via `npm run cmap --`.
</done>

---

## Self-Review (Plan 9)

- **Spec coverage:** SAC-10 (library API already exists; CLI `index`/`query`, JSON), SAC-12 (self-contained HTML preview, base64 images, offline). Uses node:util parseArgs (Node≥20). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `runCli(argv) -> {code, lines}`; `HtmlData` shared between html.ts and cli; reuses `buildIncremental`/`enrichGraph`/`writeGraph`/`resolveLocator`/`impact`/`uiAccessPaths`/`renderHtml` with their exact signatures. enrichGraph applied every run (MD always fresh) then re-writeGraph. NodeNext `.js` imports. ✓
- **Known limitations (noted):** cache manifest hashes .ts only (MD changes reflected because enrich runs every invocation, but a no-op `index` still re-enriches); global `cmap` bin install deferred (run via npm script; no build step yet). ✓
- **Verify bounds:** both tasks <60s; Step 8 is a real-sample smoke. ✓
