import { describe, it, expect } from 'vitest';
import { wholeGraphSvg } from './svg.js';
import type { Graph, ComponentNode, Edge } from '../types.js';

function node(id: string): ComponentNode {
  return { id, componentId: null, className: id, selector: null, filePath: `src/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
const E = (from: string, to: string, kind: Edge['kind'] = 'resolved'): Edge => ({ from, to, kind, via: 'template', reason: null });

const graph: Graph = {
  schemaVersion: 2,
  components: ['Root', 'Mid', 'Leaf', 'Dyn'].map(node),
  edges: [E('Root', 'Mid'), E('Mid', 'Leaf'), E('Dyn', 'Leaf', 'unresolved-static')],
  routes: [],
};

describe('wholeGraphSvg', () => {
  it('emits one node per component with a data-id, and a viewBox', () => {
    const { svg, nodes } = wholeGraphSvg(graph);
    expect(nodes).toHaveLength(4);
    for (const id of ['Root', 'Mid', 'Leaf', 'Dyn']) expect(svg).toContain(`data-id="${id}"`);
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it('draws only resolved edges, with data-from/data-to', () => {
    const { svg } = wholeGraphSvg(graph);
    expect(svg).toContain('data-from="Root" data-to="Mid"');
    expect(svg).toContain('data-from="Mid" data-to="Leaf"');
    expect(svg).not.toContain('data-from="Dyn"');   // dynamic edge not drawn
  });

  it('layers nodes left-to-right (Root before Mid before Leaf in x)', () => {
    const { nodes } = wholeGraphSvg(graph);
    const x = (id: string) => nodes.find((n) => n.id === id)!.x;
    expect(x('Root')).toBeLessThan(x('Mid'));
    expect(x('Mid')).toBeLessThan(x('Leaf'));
  });
});
