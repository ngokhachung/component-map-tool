import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION } from './types.js';
import type { Graph, ComponentNode, Edge, RouteNode } from './types.js';

describe('types contract', () => {
  it('exposes an integer SCHEMA_VERSION', () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('a sample Graph object satisfies the contract shapes', () => {
    const node: ComponentNode = {
      id: 'FooComponent',
      componentId: null,
      className: 'FooComponent',
      selector: 'app-foo',
      filePath: 'src/app/foo.component.ts',
      standalone: false,
      module: 'AppModule',
      templateKind: 'none',
      inputs: [{ name: 'x', alias: null, kind: 'decorator', required: false }],
      outputs: [],
      docPath: null,
      images: [],
    };
    const edge: Edge = { from: 'FooComponent', to: 'BarComponent', kind: 'resolved', via: 'template', reason: null };
    const route: RouteNode = {
      fullPath: 'foo', component: 'FooComponent', redirectTo: null,
      loadChildren: null, loadComponent: null, outlet: null, pathMatch: null,
      guards: [], children: [],
    };
    const graph: Graph = { schemaVersion: SCHEMA_VERSION, components: [node], edges: [edge], routes: [route] };

    expect(graph.components[0].selector).toBe('app-foo');
    expect(graph.edges[0].kind).toBe('resolved');
    expect(graph.routes[0].fullPath).toBe('foo');
  });
});
