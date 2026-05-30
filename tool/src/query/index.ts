import type { Graph, RouteNode } from '../types.js';

function addAdj(m: Map<string, string[]>, key: string, value: string): void {
  const a = m.get(key);
  if (a) a.push(value);
  else m.set(key, [value]);
}

function resolvedReverse(graph: Graph): Map<string, string[]> {
  const rev = new Map<string, string[]>();
  for (const e of graph.edges) if (e.kind === 'resolved' && e.to) addAdj(rev, e.to, e.from);
  return rev;
}
function resolvedForward(graph: Graph): Map<string, string[]> {
  const fwd = new Map<string, string[]>();
  for (const e of graph.edges) if (e.kind === 'resolved' && e.to) addAdj(fwd, e.from, e.to);
  return fwd;
}
function hasDynamic(graph: Graph): boolean {
  return graph.edges.some((e) => e.kind !== 'resolved');
}

export interface ImpactResult {
  target: string;
  ancestors: string[];
  uncertain: boolean;
  uncertainReason: string | null;
}

export function impact(graph: Graph, id: string): ImpactResult {
  const rev = resolvedReverse(graph);
  const ancestors = new Set<string>();
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const parent of rev.get(cur) ?? []) {
      if (!seen.has(parent)) { seen.add(parent); ancestors.add(parent); queue.push(parent); }
    }
  }
  const dynamic = graph.edges.filter((e) => e.kind !== 'resolved').length;
  return {
    target: id,
    ancestors: [...ancestors],
    uncertain: dynamic > 0,
    uncertainReason: dynamic > 0
      ? `${dynamic} indirect/unresolved-static dependency(ies) in the graph may hide additional impact`
      : null,
  };
}

export interface AccessPath { routeUrl: string; componentChain: string[]; uncertain: boolean; }

function findChain(fwd: Map<string, string[]>, start: string, target: string): string[] | null {
  const visited = new Set<string>();
  const dfs = (node: string): string[] | null => {
    if (node === target) return [node];
    if (visited.has(node)) return null;
    visited.add(node);
    for (const child of fwd.get(node) ?? []) {
      const sub = dfs(child);
      if (sub) return [node, ...sub];
    }
    return null;
  };
  return dfs(start);
}

export function uiAccessPaths(graph: Graph, id: string): AccessPath[] {
  const fwd = resolvedForward(graph);
  const dynamic = hasDynamic(graph);
  const entries: { fullPath: string; component: string }[] = [];
  const walk = (rs: RouteNode[]): void => {
    for (const r of rs) {
      const component = r.component ?? r.loadComponent?.symbol ?? null;
      if (component) entries.push({ fullPath: r.fullPath, component });
      walk(r.children);
    }
  };
  walk(graph.routes);

  const paths: AccessPath[] = [];
  const seenKeys = new Set<string>();
  for (const e of entries) {
    const chain = findChain(fwd, e.component, id);
    if (!chain) continue;
    const key = `${e.fullPath}|${chain.join('>')}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    paths.push({ routeUrl: e.fullPath, componentChain: chain, uncertain: dynamic });
  }
  return paths;
}
