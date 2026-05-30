import type { Graph, ComponentNode } from '../types.js';

export type ResolveResult =
  | { ok: true; node: ComponentNode }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'ambiguous'; candidates: ComponentNode[] };

const norm = (s: string): string => s.toLowerCase().replace(/component$/, '');
const basename = (p: string): string => p.split('/').pop() ?? p;

export function resolveLocator(graph: Graph, locator: string): ResolveResult {
  const tiers: Array<(c: ComponentNode) => boolean> = [
    (c) => c.componentId === locator,
    (c) => norm(c.className) === norm(locator),
    (c) => c.filePath === locator || basename(c.filePath) === locator || c.filePath.endsWith(`/${locator}`),
    (c) => c.selector === locator,
  ];
  for (const match of tiers) {
    const hits = graph.components.filter(match);
    if (hits.length === 1) return { ok: true, node: hits[0] };
    if (hits.length > 1) return { ok: false, reason: 'ambiguous', candidates: hits };
  }
  return { ok: false, reason: 'not-found' };
}
