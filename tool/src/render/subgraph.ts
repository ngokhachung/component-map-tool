import type { Graph } from '../types.js';
import { impact, uiAccessPaths } from '../query/index.js';

export type SubNodeKind = 'target' | 'ancestor' | 'child' | 'route';
export interface SubNode { id: string; label: string; kind: SubNodeKind; title: string; }
export interface SubEdge { from: string; to: string; dynamic: boolean; }
export interface FocusedSubgraph { nodes: SubNode[]; edges: SubEdge[]; }

export function focusedSubgraph(graph: Graph, id: string): FocusedSubgraph {
  const byId = new Map(graph.components.map((c) => [c.id, c]));
  const titleOf = (cid: string): string => {
    const c = byId.get(cid);
    if (!c) return '';
    return c.selector ? `${c.filePath} · ${c.selector}` : c.filePath;
  };

  // upstream = target + resolved-impact ancestors + any direct predecessor (incl. dynamic)
  const upstream = new Set<string>([id, ...impact(graph, id).ancestors]);
  for (const e of graph.edges) if (e.to === id) upstream.add(e.from);

  const nodes = new Map<string, SubNode>();
  nodes.set(id, { id, label: id, kind: 'target', title: titleOf(id) });
  for (const u of upstream) if (u !== id) nodes.set(u, { id: u, label: u, kind: 'ancestor', title: titleOf(u) });

  const edges: SubEdge[] = [];
  const pushEdge = (from: string, to: string, dynamic: boolean) => {
    if (!edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, dynamic });
  };

  // upstream structure: edges among {target ∪ ancestors}
  for (const e of graph.edges) {
    if (e.to && upstream.has(e.from) && upstream.has(e.to)) pushEdge(e.from, e.to, e.kind !== 'resolved');
  }
  // immediate forward children of target (downstream, not upstream)
  for (const e of graph.edges) {
    if (e.from === id && e.to && !upstream.has(e.to)) {
      if (!nodes.has(e.to)) nodes.set(e.to, { id: e.to, label: e.to, kind: 'child', title: titleOf(e.to) });
      pushEdge(id, e.to, e.kind !== 'resolved');
    }
  }
  // route entry nodes → first component of each access path chain
  for (const p of uiAccessPaths(graph, id)) {
    const entry = p.componentChain[0];
    if (!entry) continue;
    const rid = `route:${p.routeUrl}`;
    if (!nodes.has(rid)) nodes.set(rid, { id: rid, label: p.routeUrl, kind: 'route', title: '' });
    if (!nodes.has(entry)) nodes.set(entry, { id: entry, label: entry, kind: 'ancestor', title: titleOf(entry) });
    pushEdge(rid, entry, p.uncertain);
  }

  return { nodes: [...nodes.values()], edges };
}
