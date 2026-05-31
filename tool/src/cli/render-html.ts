import type { Graph } from '../types.js';
import { wholeGraphSvg } from '../render/svg.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderWholeHtml(graph: Graph): string {
  const { svg } = wholeGraphSvg(graph);
  const meta: Record<string, { filePath: string; selector: string | null; module: string | null; standalone: boolean }> = {};
  for (const c of graph.components) meta[c.id] = { filePath: c.filePath, selector: c.selector, module: c.module, standalone: c.standalone };
  const resolvedEdges = graph.edges.filter((e) => e.kind === 'resolved' && e.to).length;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Component map — whole graph</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; }
  header { padding: .5rem 1rem; border-bottom: 1px solid #ddd; display: flex; gap: 1rem; align-items: center; }
  #cmap-search { padding: .25rem .5rem; min-width: 16rem; }
  #cmap-stage { overflow: hidden; height: calc(100vh - 3rem); cursor: grab; }
  #cmap-graph { transform-origin: 0 0; }
  .cmap-node rect { fill: #eef; stroke: #88a; }
  .cmap-node text { font-size: 12px; fill: #223; }
  #cmap-edges line { stroke: #bbb; }
  .cmap-dim { opacity: .12; }
  .cmap-node.cmap-sel rect { fill: #ffe08a; stroke: #b8860b; stroke-width: 2px; }
  #cmap-edges line.cmap-hot { stroke: #b8860b; stroke-width: 2px; }
  #cmap-meta { position: fixed; right: 0; top: 3rem; width: 22rem; max-height: calc(100vh - 3rem); overflow: auto; padding: 1rem; border-left: 1px solid #ddd; background: #fff; }
  #cmap-meta code { background: #f4f4f4; padding: 0 .2rem; }
</style></head><body>
<header>
  <strong>Component map</strong>
  <input id="cmap-search" placeholder="filter components…"/>
  <span>${graph.components.length} components · ${resolvedEdges} resolved edges</span>
</header>
<div id="cmap-stage">${svg}</div>
<aside id="cmap-meta">Click a node for details.</aside>
<script>
  const META = ${JSON.stringify(meta)};
  const stage = document.getElementById('cmap-stage');
  const svgEl = document.getElementById('cmap-graph');
  const nodes = Array.prototype.slice.call(document.querySelectorAll('.cmap-node'));
  const lines = Array.prototype.slice.call(document.querySelectorAll('#cmap-edges line'));

  document.getElementById('cmap-search').addEventListener('input', function (e) {
    const q = e.target.value.trim().toLowerCase();
    nodes.forEach(function (n) {
      const id = (n.getAttribute('data-id') || '').toLowerCase();
      n.classList.toggle('cmap-dim', q !== '' && id.indexOf(q) === -1);
    });
  });

  document.getElementById('cmap-nodes').addEventListener('click', function (e) {
    const g = e.target.closest('.cmap-node'); if (!g) return;
    const id = g.getAttribute('data-id');
    nodes.forEach(function (n) { n.classList.toggle('cmap-sel', n === g); });
    lines.forEach(function (l) {
      const hot = l.getAttribute('data-from') === id || l.getAttribute('data-to') === id;
      l.classList.toggle('cmap-hot', hot);
    });
    const m = META[id] || {};
    document.getElementById('cmap-meta').innerHTML =
      '<h3>' + id + '</h3>' +
      '<p><code>' + (m.filePath || '') + '</code></p>' +
      '<p>selector: <code>' + (m.selector || '—') + '</code><br/>standalone: ' + (!!m.standalone) +
      '<br/>module: ' + (m.module || '—') + '</p>';
  });

  let scale = 1, tx = 0, ty = 0, panning = false, sx = 0, sy = 0;
  function apply() { svgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
  stage.addEventListener('wheel', function (e) { e.preventDefault(); scale = Math.min(4, Math.max(0.1, scale * (e.deltaY < 0 ? 1.1 : 0.9))); apply(); }, { passive: false });
  stage.addEventListener('mousedown', function (e) { panning = true; sx = e.clientX - tx; sy = e.clientY - ty; stage.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', function () { panning = false; stage.style.cursor = 'grab'; });
  window.addEventListener('mousemove', function (e) { if (!panning) return; tx = e.clientX - sx; ty = e.clientY - sy; apply(); });
</script>
</body></html>`;
}
