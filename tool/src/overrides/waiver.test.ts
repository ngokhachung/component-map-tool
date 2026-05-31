import { describe, it, expect } from 'vitest';
import { validate } from './schema.js';
import { findGaps } from './gaps.js';
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

describe('waiver', () => {
  it('validate accepts a waived entry with no/empty target', () => {
    const r = validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: '', reason: 'ngComponentOutlet', waived: true }] });
    expect(r.ok).toBe(true);
  });

  it('findGaps does not report a construct covered by a waived entry', () => {
    const g = graph(
      [node('HostComponent', 'C1')],
      [{ from: 'HostComponent', to: null, kind: 'unresolved-static', via: 'template', reason: 'ngComponentOutlet' }],
    );
    const gaps = findGaps(g, ov('C1', [{ target: '', reason: 'ngComponentOutlet', waived: true }]));
    expect(gaps).toEqual([]);
  });

  it('applyOverrides adds no edge and no warning for a waived entry', () => {
    const g = graph([node('HostComponent', 'C1'), node('WidgetComponent', null)]);
    const { warnings } = applyOverrides(g, ov('C1', [{ target: 'WidgetComponent', reason: 'ngComponentOutlet', waived: true }]));
    expect(g.edges).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
