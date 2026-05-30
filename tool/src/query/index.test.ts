import { describe, it, expect } from 'vitest';
import { impact, uiAccessPaths } from './index.js';
import type { Graph, Edge, RouteNode } from '../types.js';

function edge(from: string, to: string | null, kind: Edge['kind'] = 'resolved'): Edge {
  return { from, to, kind, via: 'template', reason: kind === 'resolved' ? null : 'x' };
}
function route(fullPath: string, component: string | null, children: RouteNode[] = []): RouteNode {
  return { fullPath, component, redirectTo: null, loadChildren: null, loadComponent: null, outlet: null, pathMatch: null, guards: [], children };
}

const g: Graph = {
  schemaVersion: 1,
  components: [],
  edges: [edge('PageComponent', 'MidComponent'), edge('MidComponent', 'LeafComponent'), edge('MidComponent', null, 'indirect')],
  routes: [route('page', 'PageComponent')],
};

describe('impact', () => {
  it('returns transitive ancestors via reverse resolved edges', () => {
    const r = impact(g, 'LeafComponent');
    expect(r.ancestors.sort()).toEqual(['MidComponent', 'PageComponent']);
  });
  it('flags uncertain when the graph has indirect/unresolved edges', () => {
    expect(impact(g, 'LeafComponent').uncertain).toBe(true);
  });
  it('is cycle-safe', () => {
    const cyc: Graph = { schemaVersion: 1, components: [], edges: [edge('A', 'B'), edge('B', 'A')], routes: [] };
    expect(impact(cyc, 'A').ancestors.sort()).toEqual(['B']);
  });
});

describe('uiAccessPaths', () => {
  it('returns route + component chain to the target', () => {
    const paths = uiAccessPaths(g, 'LeafComponent');
    expect(paths).toEqual([
      { routeUrl: 'page', componentChain: ['PageComponent', 'MidComponent', 'LeafComponent'], uncertain: true },
    ]);
  });
  it('returns the route component itself when it IS the target', () => {
    expect(uiAccessPaths(g, 'PageComponent')[0].componentChain).toEqual(['PageComponent']);
  });
});
