import type { Graph } from '../types.js';

export interface SvgNode { id: string; x: number; y: number; }
export interface WholeGraphSvg { svg: string; nodes: SvgNode[]; }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const a = m.get(k); if (a) a.push(v); else m.set(k, [v]);
}

// layer = longest distance from a resolved-edge root; cycles/unreachable settle at 0.
function layers(graph: Graph): Map<string, number> {
  const fwd = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const c of graph.components) indeg.set(c.id, 0);
  for (const e of graph.edges) {
    if (e.kind === 'resolved' && e.to && indeg.has(e.from) && indeg.has(e.to)) {
      push(fwd, e.from, e.to);
      indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    }
  }
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const c of graph.components) { layer.set(c.id, 0); if ((indeg.get(c.id) ?? 0) === 0) queue.push(c.id); }
  const seen = new Set<string>();
  while (queue.length) {
    const n = queue.shift() as string;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of fwd.get(n) ?? []) {
      layer.set(m, Math.max(layer.get(m) ?? 0, (layer.get(n) ?? 0) + 1));
      queue.push(m);
    }
  }
  return layer;
}

const NW = 170, NH = 26, DX = 230, DY = 40;

export function wholeGraphSvg(graph: Graph): WholeGraphSvg {
  const layer = layers(graph);
  const byLayer = new Map<number, string[]>();
  for (const c of [...graph.components].sort((a, b) => a.id.localeCompare(b.id))) push(byLayer, layer.get(c.id) ?? 0, c.id);

  const pos = new Map<string, SvgNode>();
  for (const [l, ids] of byLayer) ids.forEach((id, i) => pos.set(id, { id, x: 20 + l * DX, y: 20 + i * DY }));

  const coords = [...pos.values()];
  const maxX = Math.max(0, ...coords.map((p) => p.x)) + NW + 20;
  const maxY = Math.max(0, ...coords.map((p) => p.y)) + NH + 20;

  const edgeLines: string[] = [];
  for (const e of graph.edges) {
    if (e.kind !== 'resolved' || !e.to) continue;
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    edgeLines.push(`<line data-from="${esc(e.from)}" data-to="${esc(e.to)}" x1="${a.x + NW}" y1="${a.y + NH / 2}" x2="${b.x}" y2="${b.y + NH / 2}"/>`);
  }
  const nodeEls: string[] = [];
  for (const p of coords) {
    nodeEls.push(`<g class="cmap-node" data-id="${esc(p.id)}"><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="4"/><text x="${p.x + 8}" y="${p.y + 17}">${esc(p.id)}</text></g>`);
  }
  const svg = `<svg id="cmap-graph" viewBox="0 0 ${maxX} ${maxY}" xmlns="http://www.w3.org/2000/svg">
<g id="cmap-edges">${edgeLines.join('')}</g>
<g id="cmap-nodes">${nodeEls.join('')}</g>
</svg>`;
  return { svg, nodes: coords };
}
