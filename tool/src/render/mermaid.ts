import type { FocusedSubgraph, SubNode } from './subgraph.js';

function safeId(id: string): string {
  return `n${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
}
function escLabel(s: string): string {
  return s.replace(/"/g, '&quot;');
}
const SHAPE: Record<SubNode['kind'], (label: string) => string> = {
  target: (l) => `["${l}"]`,
  ancestor: (l) => `["${l}"]`,
  child: (l) => `["${l}"]`,
  route: (l) => `(["${l}"])`,
};

export function toMermaid(sub: FocusedSubgraph): string {
  const nodes = [...sub.nodes].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const edges = [...sub.edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const lines = ['flowchart TD'];
  for (const n of nodes) lines.push(`  ${safeId(n.id)}${SHAPE[n.kind](escLabel(n.label))}:::${n.kind}`);
  for (const e of edges) lines.push(`  ${safeId(e.from)} ${e.dynamic ? '-.->' : '-->'} ${safeId(e.to)}`);
  lines.push('  classDef target fill:#ffe08a,stroke:#b8860b,stroke-width:2px;');
  lines.push('  classDef ancestor fill:#e6f0ff,stroke:#4a78c0;');
  lines.push('  classDef child fill:#e9ffe6,stroke:#4aa84a;');
  lines.push('  classDef route fill:#f0e6ff,stroke:#8a4ac0;');
  return lines.join('\n');
}
