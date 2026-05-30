import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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

  it('does NOT assign a duplicated componentId to matched nodes (alias stays unambiguous)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-md-'));
    try {
      writeFileSync(join(dir, 'a.md'), '# [DUP] A\n\n## ソースパス\n`a/foo.component.ts`\n');
      writeFileSync(join(dir, 'b.md'), '# [DUP] B\n\n## ソースパス\n`b/bar.component.ts`\n');
      const graph: Graph = { schemaVersion: 1, components: [node('FooComponent', 'src/a/foo.component.ts'), node('BarComponent', 'src/b/bar.component.ts')], edges: [], routes: [] };
      enrichGraph(graph, dir);
      // both docs link (docPath set) but neither node carries the duplicated id
      expect(graph.components.find((c) => c.className === 'FooComponent')!.componentId).toBeNull();
      expect(graph.components.find((c) => c.className === 'BarComponent')!.componentId).toBeNull();
      expect(graph.components.find((c) => c.className === 'FooComponent')!.docPath).toBe('a.md');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
