# M5 — Plan 4: CLI wiring + integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the renderer into the CLI — `cmap query --html` embeds the Mermaid subgraph, and a new `cmap render --html` writes the whole-graph page — then prove both end-to-end on real Angular 15 source and hold the coverage gate.

**Architecture:** One task. Modify `cli/index.ts` (enhance the `query --html` branch + add the `render` command), then an integration test on `poc/real-sample` + the ≥80% coverage gate.

**Tech Stack:** TS/Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "`cmap query <c> --html <f>` writes a report whose graph section contains a `flowchart TD` Mermaid def for the queried component's neighborhood."
    - "`cmap render --html <f>` writes the whole-graph page (svg + search + all component nodes) and prints component/edge counts; `render` without --html exits 1."
    - "full suite green; tsc clean; coverage ≥80%."
  required_artifacts:
    - "tool/src/cli/index.ts (query --html builds subgraph/mermaid/tips/runtime; render command + USAGE)"
    - "tool/src/cli/render-integration.test.ts"
  required_wiring:
    - "Closes M5: both report views runnable via the CLI on a real repo."
  key_links:
    - "focusedSubgraph→toMermaid→renderHtml in query --html (RND-03)"
    - "renderWholeHtml in render command (RND-06)"
```

---

## File Structure

- `tool/src/cli/index.ts` — CLI surface (existing); surgical additions to the `query --html` branch + a new `render` branch.
- `tool/src/cli/render-integration.test.ts` — end-to-end on `poc/real-sample`.

---

## Wave 4: CLI + integration

### Task 6: Wire `query --html` subgraph + add `cmap render`

<model>sonnet</model>

<read_first>
- `tool/src/cli/index.ts` (whole file — `runCli`, the `query` branch's `if (values.html)` block, `buildEnriched`, `USAGE`, parseArgs options)
- `tool/src/render/subgraph.ts`, `tool/src/render/mermaid.ts`, `tool/src/render/assets.ts`, `tool/src/cli/render-html.ts` (Plans 1-3)
- RND-03, RND-06
</read_first>

**Files:**
- Modify: `tool/src/cli/index.ts`
- Test: `tool/src/cli/render-integration.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/render-integration.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

const ROOT = '../poc/real-sample/src';
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-render-')); }

describe('cmap query --html (Mermaid subgraph)', () => {
  it('embeds a flowchart for the queried component', () => {
    const d = tmp();
    try {
      const html = join(d, 'q.html');
      const r = runCli(['query', 'DataTableComponent', '--root', ROOT, '--out', join(d, '.cmap'), '--html', html]);
      expect(r.code).toBe(0);
      const out = readFileSync(html, 'utf8');
      expect(out).toContain('class="mermaid"');
      expect(out).toContain('flowchart TD');
      expect(out).toContain('nDataTableComponent');   // sanitized target id
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('cmap render --html (whole graph)', () => {
  it('writes an svg page covering all components', () => {
    const d = tmp();
    try {
      const html = join(d, 'g.html');
      const r = runCli(['render', '--root', ROOT, '--out', join(d, '.cmap'), '--html', html]);
      expect(r.code).toBe(0);
      const out = readFileSync(html, 'utf8');
      expect(out).toContain('<svg');
      expect(out).toContain('id="cmap-search"');
      expect((out.match(/data-id="/g) || []).length).toBeGreaterThanOrEqual(18);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('render without --html exits 1', () => {
    expect(runCli(['render', '--root', ROOT]).code).toBe(1);
  });
});
```

> If `DataTableComponent` is not the real className in `poc/real-sample`, run `cd tool && npm run cmap -- index --root ../poc/real-sample/src` then a `query` to find a real one, and use that className in the test (report the substitution).

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/render-integration.test.ts`

- [ ] **Step 3: Edit `tool/src/cli/index.ts`:**

(a) Add imports alongside the other `./` imports:
```ts
import { focusedSubgraph } from '../render/subgraph.js';
import { toMermaid } from '../render/mermaid.js';
import { mermaidRuntime } from '../render/assets.js';
import { renderWholeHtml } from './render-html.js';
```

(b) In the `query` branch, the existing `if (values.html) { ... }` block builds `const data: HtmlData = { component: {...}, impact: imp, accessPaths: paths, images: imageDataUris(node.images, docs) };`. Extend that object with the subgraph fields — replace the `data` construction with:
```ts
      const sub = focusedSubgraph(graph, node.id);
      const tips: Record<string, string> = {};
      for (const n of sub.nodes) if (n.title) tips[n.label] = n.title;
      const data: HtmlData = {
        component: { id: node.id, componentId: node.componentId, selector: node.selector, filePath: node.filePath, standalone: node.standalone, module: node.module },
        impact: imp, accessPaths: paths, images: imageDataUris(node.images, docs),
        mermaidDef: toMermaid(sub), tips, mermaidRuntime: mermaidRuntime(),
      };
```

(c) Add the `render` command branch immediately before the final `return { code: 1, lines: [USAGE] };`:
```ts
  if (cmd === 'render') {
    if (!values.html) return { code: 1, lines: ['render requires --html <file>'] };
    const { graph } = buildEnriched(root, out, docs, overridesDir);
    writeFileSync(values.html as string, renderWholeHtml(graph));
    const resolved = graph.edges.filter((e) => e.kind === 'resolved' && e.to).length;
    return { code: 0, lines: [`wrote ${values.html} (${graph.components.length} components, ${resolved} resolved edges)`] };
  }
```

(d) Update `USAGE` to include `render`:
```ts
const USAGE = 'usage: cmap <index|query|gaps|pr|migrate|lint|render> [--root dir] [--docs dir] [--overrides dir] [--out dir] [--html file] [--write] [--changed csv] [--baseline file] [--accept] [--coverage file]';
```

- [ ] **Step 4: Run, verify PASS** (3 tests): `cd tool && npx vitest run src/cli/render-integration.test.ts`

- [ ] **Step 5: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (existing query/index tests still pass).

- [ ] **Step 6: Coverage gate:** `cd tool && npm run test:cov`
Expected: exit 0, ≥80% thresholds. Report the percentages. If a new render file drops below threshold, add a focused unit test to its `*.test.ts` (do NOT lower thresholds). Note: the inlined Mermaid runtime is data (a read string), not executed in tests — it does not affect coverage.

- [ ] **Step 7: Commit**

```bash
cd tool && git add src/cli/index.ts src/cli/render-integration.test.ts
git commit -m "feat(tool): wire query --html subgraph + add cmap render (RND-03/06)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm run test:cov && npx tsc --noEmit`
Expected: green + ≥80% coverage + clean. `query --html` embeds a `flowchart TD` for the component; `cmap render --html` writes the whole-graph svg page with ≥18 nodes; `render` without `--html` exits 1.
</verify>

<done>
M5 is feature-complete: `cmap query --html` shows an interactive Mermaid neighborhood, `cmap render --html` shows the searchable/pannable whole graph — both offline single-file, proven on real Angular 15. Ready for STEP 8 (UAT/verification) → STEP 9 (QA) → ship.
</done>

---

## Self-Review (Plan 4)

- **Spec coverage:** RND-03 (query --html now passes mermaidDef/tips/runtime), RND-06 (`cmap render --html` command + counts + guard). Closes end-to-end on real-sample + coverage gate. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** imports match Plan 1-3 exports (`focusedSubgraph`, `toMermaid`, `mermaidRuntime`, `renderWholeHtml`); `HtmlData` extended object uses the optional fields added in Plan 3; `tips` keyed by `n.label` matches the `CMAP_TIP` lookup in Plan 3's tooltip init (which reads node label text); `renderWholeHtml(graph)` signature from Plan 3; reuses `buildEnriched`/`writeFileSync`/`imageDataUris` already in index.ts; USAGE includes prior `pr` (kept). NodeNext `.js`. ✓
- **Verify bounds:** single task <60s (real-sample build cached per run). ✓
