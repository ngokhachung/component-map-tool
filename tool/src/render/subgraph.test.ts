import { describe, it, expect } from 'vitest';
import { focusedSubgraph } from './subgraph.js';
import type { Graph, ComponentNode, Edge, RouteNode } from '../types.js';

function node(id: string): ComponentNode {
  return { id, componentId: null, className: id, selector: `${id.toLowerCase()}-sel`, filePath: `src/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
const E = (from: string, to: string, kind: Edge['kind'] = 'resolved'): Edge => ({ from, to, kind, via: 'template', reason: null });
function route(fullPath: string, component: string): RouteNode {
  return { fullPath, component, redirectTo: null, loadChildren: null, loadComponent: null, outlet: null, pathMatch: null, guards: [], children: [] };
}

// A → T (resolved ancestor), T → C (resolved child), D ⇢ T (dynamic ancestor), route /x → A
const graph: Graph = {
  schemaVersion: 2,
  components: ['A', 'T', 'C', 'D'].map(node),
  edges: [E('A', 'T'), E('T', 'C'), E('D', 'T', 'unresolved-static')],
  routes: [route('/x', 'A')],
};

describe('focusedSubgraph', () => {
  it('classifies target/ancestor/child/route nodes', () => {
    const sub = focusedSubgraph(graph, 'T');
    const kind = (id: string) => sub.nodes.find((n) => n.id === id)?.kind;
    expect(kind('T')).toBe('target');
    expect(kind('A')).toBe('ancestor');
    expect(kind('D')).toBe('ancestor');
    expect(kind('C')).toBe('child');
    expect(sub.nodes.some((n) => n.kind === 'route' && n.label === '/x')).toBe(true);
  });

  it('marks dynamic edges and wires the route to its entry component', () => {
    const sub = focusedSubgraph(graph, 'T');
    expect(sub.edges).toContainEqual({ from: 'A', to: 'T', dynamic: false });
    expect(sub.edges).toContainEqual({ from: 'T', to: 'C', dynamic: false });
    const routeEdge = sub.edges.find((e) => e.from.startsWith('route:'));
    expect(routeEdge?.to).toBe('A');
  });

  it('carries filePath·selector as the node title (for tooltips)', () => {
    const sub = focusedSubgraph(graph, 'T');
    expect(sub.nodes.find((n) => n.id === 'T')?.title).toBe('src/T.ts · t-sel');
  });
});
