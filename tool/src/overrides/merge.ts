import type { Graph, Edge } from '../types.js';
import type { CmapOverride } from './schema.js';
import { resolveLocator } from '../query/locator.js';

function reaches(graph: Graph, start: string, target: string): boolean {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind === 'resolved' && e.to) {
      const a = adj.get(e.from);
      if (a) a.push(e.to); else adj.set(e.from, [e.to]);
    }
  }
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const n = stack.pop() as string;
    if (n === target) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const c of adj.get(n) ?? []) stack.push(c);
  }
  return false;
}

export function applyOverrides(graph: Graph, overrides: Map<string, CmapOverride>): { warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set(graph.edges.map((e) => `${e.from}|${e.to}|${e.kind}|${e.reason}`));
  const added: Edge[] = [];

  for (const node of graph.components) {
    if (!node.componentId) continue;
    const ov = overrides.get(node.componentId);
    if (!ov) continue;
    for (const dep of ov.dynamicDeps) {
      if (dep.stale || dep.target.trim().length === 0) continue;
      const r = resolveLocator(graph, dep.target);
      if (!r.ok) { warnings.push(`override ${node.componentId}: target "${dep.target}" ${r.reason}`); continue; }
      const edge: Edge = { from: node.id, to: r.node.id, kind: 'resolved', via: 'override', reason: dep.reason ?? 'documented dynamic dependency' };
      const key = `${edge.from}|${edge.to}|${edge.kind}|${edge.reason}`;
      if (!seen.has(key)) { seen.add(key); added.push(edge); graph.edges.push(edge); }
    }
  }
  for (const e of added) {
    if (e.to && reaches(graph, e.to, e.from)) {
      warnings.push(`override edge ${e.from}→${e.to} introduces a cycle`);
    }
  }
  return { warnings };
}
