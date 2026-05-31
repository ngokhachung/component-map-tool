import { describe, it, expect } from 'vitest';
import { renderWholeHtml } from './render-html.js';
import type { Graph, ComponentNode, Edge } from '../types.js';

function node(id: string): ComponentNode {
  return { id, componentId: null, className: id, selector: null, filePath: `src/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
const E = (from: string, to: string): Edge => ({ from, to, kind: 'resolved', via: 'template', reason: null });
const graph: Graph = { schemaVersion: 2, components: ['Root', 'Leaf'].map(node), edges: [E('Root', 'Leaf')], routes: [] };

describe('renderWholeHtml', () => {
  it('produces an offline single-file page with svg, search, meta map, and interactivity', () => {
    const html = renderWholeHtml(graph);
    expect(html).toContain('<svg');
    expect(html).toContain('id="cmap-search"');
    expect(html).toContain('const META');
    expect(html).toContain('data-id="Root"');
    expect(html).toContain('data-id="Leaf"');
    expect(html).toContain('addEventListener');
    expect(html).not.toContain('https://');
  });
});
