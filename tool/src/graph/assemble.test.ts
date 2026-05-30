import { describe, it, expect } from 'vitest';
import { assembleGraph, serializeGraph, loadGraph } from './assemble.js';
import { SCHEMA_VERSION } from '../types.js';
import type { ComponentRecord, Edge, RouteNode } from '../types.js';

const recs: ComponentRecord[] = [
  { className: 'FooComponent', selector: 'app-foo', filePath: 'src/foo.ts', standalone: false, module: 'M', templateKind: 'inline', inputs: [], outputs: [] },
];
const edges: Edge[] = [{ from: 'FooComponent', to: 'BarComponent', kind: 'resolved', via: 'template', reason: null }];
const routes: RouteNode[] = [{ fullPath: 'foo', component: 'FooComponent', redirectTo: null, loadChildren: null, loadComponent: null, outlet: null, pathMatch: null, guards: [], children: [] }];

describe('assembleGraph', () => {
  it('turns records into nodes (id=className, null MD fields) and sets schemaVersion', () => {
    const g = assembleGraph(recs, edges, routes);
    expect(g.schemaVersion).toBe(SCHEMA_VERSION);
    expect(g.components[0]).toMatchObject({
      id: 'FooComponent', componentId: null, docPath: null, images: [],
      className: 'FooComponent', selector: 'app-foo', module: 'M',
    });
    expect(g.edges).toEqual(edges);
    expect(g.routes).toEqual(routes);
  });
});

describe('serialize / load', () => {
  it('round-trips a graph', () => {
    const g = assembleGraph(recs, edges, routes);
    const loaded = loadGraph(serializeGraph(g));
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.components[0].id).toBe('FooComponent');
    expect(loaded.edges).toEqual(edges);
    expect(loaded.routes).toEqual(routes);
  });
  it('produces deterministic ordering (components sorted by id)', () => {
    const two = assembleGraph(
      [recs[0], { ...recs[0], className: 'AComponent', selector: 'app-a' }],
      [], [],
    );
    const ids = JSON.parse(serializeGraph(two)).components.map((c: { id: string }) => c.id);
    expect(ids).toEqual(['AComponent', 'FooComponent']);
  });
  it('rejects a mismatched schemaVersion', () => {
    expect(() => loadGraph(JSON.stringify({ schemaVersion: 999, components: [], edges: [], routes: [] }))).toThrow();
  });
});
