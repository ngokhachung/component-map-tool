import { describe, it, expect } from 'vitest';
import { applyOverrides } from './merge.js';
import type { Graph, ComponentNode } from '../types.js';
import type { CmapOverride } from './schema.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function graph(components: ComponentNode[], edges: Graph['edges'] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
function ov(componentId: string, deps: CmapOverride['dynamicDeps']): Map<string, CmapOverride> {
  return new Map([[componentId, { schemaVersion: 1, componentId, dynamicDeps: deps }]]);
}

describe('applyOverrides', () => {
  it('adds a resolved via:override edge for a resolvable target', () => {
    const g = graph([node('HostComponent', 'C1'), node('WidgetComponent', null)]);
    const { warnings } = applyOverrides(g, ov('C1', [{ target: 'WidgetComponent', reason: 'ngComponentOutlet' }]));
    expect(g.edges).toContainEqual({ from: 'HostComponent', to: 'WidgetComponent', kind: 'resolved', via: 'override', reason: 'ngComponentOutlet' });
    expect(warnings).toEqual([]);
  });
  it('skips stale and empty-target entries', () => {
    const g = graph([node('HostComponent', 'C1'), node('WidgetComponent', null)]);
    applyOverrides(g, ov('C1', [{ target: 'WidgetComponent', stale: true }, { target: '   ' }]));
    expect(g.edges).toEqual([]);
  });
  it('warns on an unresolvable target', () => {
    const g = graph([node('HostComponent', 'C1')]);
    const { warnings } = applyOverrides(g, ov('C1', [{ target: 'NoSuchComponent' }]));
    expect(g.edges).toEqual([]);
    expect(warnings.some((w) => w.includes('NoSuchComponent'))).toBe(true);
  });
  it('warns when an override edge closes a cycle', () => {
    const g = graph(
      [node('A', 'CA'), node('B', null)],
      [{ from: 'B', to: 'A', kind: 'resolved', via: 'template', reason: null }],
    );
    const { warnings } = applyOverrides(g, ov('CA', [{ target: 'B' }]));
    expect(warnings.some((w) => w.toLowerCase().includes('cycle'))).toBe(true);
  });
});
