import { SCHEMA_VERSION } from '../types.js';
import type { Graph, ComponentNode, ComponentRecord, Edge, RouteNode } from '../types.js';

export function assembleGraph(records: ComponentRecord[], edges: Edge[], routes: RouteNode[]): Graph {
  const components: ComponentNode[] = records.map((r) => ({
    ...r,
    id: r.className,
    componentId: null,
    docPath: null,
    images: [],
    description: null,
  }));
  return { schemaVersion: SCHEMA_VERSION, components, edges, routes };
}

function edgeKey(e: Edge): string {
  return `${e.from}|${e.to}|${e.kind}|${e.reason}`;
}

export function serializeGraph(graph: Graph): string {
  const sorted: Graph = {
    schemaVersion: graph.schemaVersion,
    components: [...graph.components].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b))),
    routes: graph.routes,
  };
  return JSON.stringify(sorted, null, 2);
}

export function loadGraph(json: string): Graph {
  const g = JSON.parse(json) as Graph;
  if (g.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`graph schemaVersion ${g.schemaVersion} != ${SCHEMA_VERSION}; rebuild required`);
  }
  return g;
}
