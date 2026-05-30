# Phase 1 — Plan 8: MD Index (componentId + images) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From a configurable docs folder of per-component Markdown files (the team's Japanese table format), extract each `componentId`, its source-path link, and its representative images, and enrich the matching graph nodes — tolerantly (no MD ⇒ nulls; duplicate id / orphan ⇒ warning).

**Architecture:** One task. `md/parse.ts` = pure single-doc extraction (componentId from the `コンポーネントID` table column with title fallback; source path from `## ソースパス` code span; images from `## 画面レイアウト` `![](…)` with the nearest heading as caption). `md/index.ts` = read the docs folder recursively, detect duplicate componentIds, and link each doc to a node by **source-path segment-suffix match** (so the docs folder location is independent of the code root), mutating `node.componentId/docPath/images`. Targeted Markdown extraction — no YAML/heavy parser.

**Tech Stack:** Node ESM (fs, path), vitest.

---

```yaml
must_haves:
  observable_truths:
    - "parseMdDoc extracts componentId from the metadata table column コンポーネントID (title `# [C000011]` fallback), the ソースパス code-span path (\\\\ -> /), and 画面レイアウト images with the nearest ### heading as caption (paths resolved relative to the .md)."
    - "enrichGraph links a doc to a node when the node filePath and the MD source path share a full-segment suffix, setting node.componentId/docPath/images."
    - "A duplicate componentId across docs, an orphan source path (no node), and an ambiguous match each produce a warning — never a crash; nodes with no MD keep componentId:null/images:[]."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/md/parse.ts — parseMdDoc(content, mdPath) -> MdDoc"
    - "tool/src/md/index.ts — readMdDocs(docsDir), enrichGraph(graph, docsDir) -> { warnings }"
    - "tests for both"
  required_wiring:
    - "CLI (Plan 9) calls enrichGraph after buildIncremental so query-by-componentId + image preview work; resolveLocator (Plan 7) then matches componentId."
  key_links:
    - "componentId from table col + source-path link -> location-independent docs folder (sample C000011 format)"
    - "tolerant: dup=warning, orphan=warning, no-MD=null (SAC-09)"
    - "images into node.images for the HTML preview (SAC-11)"
```

---

## File Structure

- `tool/src/md/parse.ts` — pure single-document Markdown extraction. One responsibility: one `.md` → `{componentId, sourcePath, images}`.
- `tool/src/md/index.ts` — folder read + node linking/enrichment. One responsibility: apply MD data to a Graph.
- Tests alongside.

---

## Wave: MD

### Task 15: MdIndex — parse componentId/source/images + enrich graph

<model>opus</model>

<read_first>
- `docs/components/C000011_Common_Table_Cell.md` (the real format — table col `コンポーネントID`, `## ソースパス` code span, `## 画面レイアウト` images)
- `tool/src/types.ts` (Graph, ComponentNode)
- `docs/specs/2026-05-30-phase1-static-analysis-core-design.md` §10
</read_first>

**Files:**
- Create: `tool/src/md/parse.ts`
- Test: `tool/src/md/parse.test.ts`
- Create: `tool/src/md/index.ts`
- Test: `tool/src/md/index.test.ts`

<action>

- [ ] **Step 1: Write the failing test for parse** — `tool/src/md/parse.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseMdDoc } from './parse.js';

const SAMPLE = `# [C000011] Common Table Cell

|サブシステム名|コンポーネントID|コンポーネント名称|
|:--|:--|:--|
|共通管理|C000011|共通テーブル候補者セル|

## コンポーネント機能概要
Displays information.

## ソースパス
\`features\\common\\components\\common-a\\common-table.component.ts\`

## 画面レイアウト

### 候補者名：ラベル
![C000011](./page/C000011_Common_Table_Cell.png)

### 候補者名：リンク
![C000011](./page/C000011_Common_Table_Cell2.png)
`;

describe('parseMdDoc', () => {
  it('extracts componentId from the metadata table column', () => {
    expect(parseMdDoc(SAMPLE, 'components/C000011.md').componentId).toBe('C000011');
  });
  it('extracts the source path and normalizes backslashes', () => {
    expect(parseMdDoc(SAMPLE, 'components/C000011.md').sourcePath)
      .toBe('features/common/components/common-a/common-table.component.ts');
  });
  it('extracts images with nearest heading as caption, resolved relative to the .md', () => {
    const imgs = parseMdDoc(SAMPLE, 'components/C000011.md').images;
    expect(imgs).toEqual([
      { caption: '候補者名：ラベル', path: 'components/page/C000011_Common_Table_Cell.png' },
      { caption: '候補者名：リンク', path: 'components/page/C000011_Common_Table_Cell2.png' },
    ]);
  });
  it('falls back to the title for componentId when no table', () => {
    expect(parseMdDoc('# [C999] Foo\n\nno table here', 'x.md').componentId).toBe('C999');
  });
  it('is tolerant of a doc with no source path / no images', () => {
    const d = parseMdDoc('# [C1] Bare', 'x.md');
    expect(d.sourcePath).toBeNull();
    expect(d.images).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/md/parse.test.ts`

- [ ] **Step 3: Implement `tool/src/md/parse.ts`**

```ts
import { posix } from 'node:path';

export interface MdImage { caption: string | null; path: string; }
export interface MdDoc {
  mdPath: string;
  componentId: string | null;
  sourcePath: string | null;
  images: MdImage[];
}

function splitRow(line: string): string[] {
  const cells = line.split('|').map((c) => c.trim());
  // drop the empty cells produced by leading/trailing pipes
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function extractComponentId(lines: string[], content: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('コンポーネントID') && lines[i].includes('|')) {
      const idx = splitRow(lines[i]).indexOf('コンポーネントID');
      const dataLine = lines[i + 2]; // header, separator, data
      if (idx >= 0 && dataLine && dataLine.includes('|')) {
        const cell = splitRow(dataLine)[idx];
        if (cell) return cell;
      }
    }
  }
  const m = content.match(/^#\s*\[([^\]]+)\]/m);
  return m ? m[1].trim() : null;
}

function extractSourcePath(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s*ソースパス/.test(lines[i])) {
      for (let j = i + 1; j < lines.length && !/^#/.test(lines[j]); j++) {
        const m = lines[j].match(/`([^`]+)`/);
        if (m) return m[1].trim().replace(/\\/g, '/');
      }
    }
  }
  return null;
}

function extractImages(lines: string[], mdPath: string): MdImage[] {
  const dir = posix.dirname(mdPath.replace(/\\/g, '/'));
  const images: MdImage[] = [];
  let lastHeading: string | null = null;
  for (const line of lines) {
    const h = line.match(/^#{1,6}\s+(.*)/);
    if (h) { lastHeading = h[1].trim(); continue; }
    const img = line.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (img) {
      const raw = img[1].trim().replace(/\\/g, '/');
      images.push({ caption: lastHeading, path: posix.normalize(posix.join(dir, raw)) });
    }
  }
  return images;
}

export function parseMdDoc(content: string, mdPath: string): MdDoc {
  const lines = content.split(/\r?\n/);
  return {
    mdPath,
    componentId: extractComponentId(lines, content),
    sourcePath: extractSourcePath(lines),
    images: extractImages(lines, mdPath),
  };
}
```

- [ ] **Step 4: Run, verify PASS** (5 tests).

- [ ] **Step 5: Write the failing test for the index** — `tool/src/md/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enrichGraph } from './index.js';
import type { Graph, ComponentNode } from '../types.js';

function node(className: string, filePath: string): ComponentNode {
  return { id: className, componentId: null, className, selector: null, filePath, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [] };
}

describe('enrichGraph', () => {
  it('links MD to a node by source-path suffix and sets componentId/docPath/images', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-md-'));
    try {
      writeFileSync(join(dir, 'C1.md'), `# [C1] Foo

|x|コンポーネントID|y|
|:--|:--|:--|
|a|C1|b|

## ソースパス
\`features\\foo\\foo.component.ts\`

## 画面レイアウト
### Shot
![C1](./page/foo.png)
`);
      const graph: Graph = {
        schemaVersion: 1,
        components: [node('FooComponent', 'src/app/features/foo/foo.component.ts'), node('BarComponent', 'src/app/bar.component.ts')],
        edges: [], routes: [],
      };
      const { warnings } = enrichGraph(graph, dir);
      const foo = graph.components.find((c) => c.className === 'FooComponent')!;
      expect(foo.componentId).toBe('C1');
      expect(foo.docPath).toBe('C1.md');
      expect(foo.images).toEqual([{ caption: 'Shot', path: 'page/foo.png' }]);
      expect(graph.components.find((c) => c.className === 'BarComponent')!.componentId).toBeNull();
      expect(warnings).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('warns on an orphan source path and on duplicate componentIds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-md-'));
    try {
      writeFileSync(join(dir, 'a.md'), '# [DUP] A\n\n## ソースパス\n`x/none.component.ts`\n');
      writeFileSync(join(dir, 'b.md'), '# [DUP] B\n\n## ソースパス\n`y/none2.component.ts`\n');
      const graph: Graph = { schemaVersion: 1, components: [node('Z', 'src/z.component.ts')], edges: [], routes: [] };
      const { warnings } = enrichGraph(graph, dir);
      expect(warnings.some((w) => w.includes('duplicate componentId DUP'))).toBe(true);
      expect(warnings.some((w) => w.includes('orphan') || w.includes('matched no component'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 6: Run, verify FAIL.** `cd tool && npx vitest run src/md/index.test.ts`

- [ ] **Step 7: Implement `tool/src/md/index.ts`**

```ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Graph } from '../types.js';
import { parseMdDoc, type MdDoc } from './parse.js';

function walkMd(dir: string, acc: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walkMd(full, acc);
    else if (e.name.endsWith('.md')) acc.push(full);
  }
}

export function readMdDocs(docsDir: string): MdDoc[] {
  if (!existsSync(docsDir)) return [];
  const files: string[] = [];
  walkMd(docsDir, files);
  return files.sort().map((f) => parseMdDoc(readFileSync(f, 'utf8'), relative(docsDir, f).replace(/\\/g, '/')));
}

// True when node path and md source path share a full-segment suffix (so the docs folder
// location is independent of the analyzed code root).
function pathSuffixMatch(nodePath: string, mdPath: string): boolean {
  const a = nodePath.split('/').filter(Boolean);
  const b = mdPath.split('/').filter(Boolean);
  const n = Math.min(a.length, b.length);
  if (n === 0) return false;
  for (let i = 1; i <= n; i++) if (a[a.length - i] !== b[b.length - i]) return false;
  return true;
}

// Enrich graph nodes in place from the docs folder. Tolerant: dup id / orphan / ambiguous => warning.
export function enrichGraph(graph: Graph, docsDir: string): { warnings: string[] } {
  const docs = readMdDocs(docsDir);
  const warnings: string[] = [];

  const byId = new Map<string, string[]>();
  for (const d of docs) if (d.componentId) {
    const arr = byId.get(d.componentId);
    if (arr) arr.push(d.mdPath); else byId.set(d.componentId, [d.mdPath]);
  }
  for (const [id, paths] of byId) if (paths.length > 1) warnings.push(`duplicate componentId ${id} in: ${paths.join(', ')}`);

  for (const d of docs) {
    if (!d.sourcePath) { warnings.push(`MD ${d.mdPath} has no ソースパス source path`); continue; }
    const matches = graph.components.filter((c) => pathSuffixMatch(c.filePath, d.sourcePath as string));
    if (matches.length === 0) { warnings.push(`MD ${d.mdPath} source path ${d.sourcePath} matched no component (orphan)`); continue; }
    if (matches.length > 1) { warnings.push(`MD ${d.mdPath} source path ${d.sourcePath} matched ${matches.length} components (ambiguous)`); continue; }
    const node = matches[0];
    node.componentId = d.componentId;
    node.docPath = d.mdPath;
    node.images = d.images;
  }
  return { warnings };
}
```

- [ ] **Step 8: Run, verify PASS** (2 tests).

- [ ] **Step 9: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 10: Commit**

```bash
cd tool && git add src/md/parse.ts src/md/parse.test.ts src/md/index.ts src/md/index.test.ts
git commit -m "feat(tool): MdIndex — parse componentId/source/images + enrich graph nodes (SAC-09/11)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `parseMdDoc` reads `C000011` from the table, the normalized source path, and both images with their `###` captions; `enrichGraph` links a doc to the right node by source-path suffix (setting componentId/docPath/images), leaves MD-less nodes null, and warns on duplicate ids + orphans.
</verify>

<done>
`MdIndex` enriches graph nodes with `componentId`, `docPath`, and `images` from the team's Markdown docs (configurable folder), tolerantly. Plan 9 calls `enrichGraph` so `cmap query <componentId>` resolves and the HTML preview can show images.
</done>

---

## Self-Review (Plan 8)

- **Spec coverage:** SAC-09 (componentId from table + source-path link, configurable recursive docs folder, dup/orphan tolerant warnings, targeted Markdown — no YAML), SAC-11 (images → node.images). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `MdDoc`/`MdImage` in parse.ts reused by index.ts; `enrichGraph` mutates `ComponentNode.componentId/docPath/images` (types.ts shapes); returns `{warnings}`. fs/path from `node:`. NodeNext `.js` imports. ✓
- **Known limitations (noted):** source-path suffix match could be ambiguous if two files share the same trailing segments (reported as ambiguous, skipped); images resolved as paths only (not embedded — that's Plan 9 base64). ✓
- **Verify bounds:** task <60s. ✓
