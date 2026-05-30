import type { ImpactResult, AccessPath } from '../query/index.js';

export interface HtmlData {
  component: {
    id: string; componentId: string | null; selector: string | null;
    filePath: string; standalone: boolean; module: string | null;
  };
  impact: ImpactResult;
  accessPaths: AccessPath[];
  images: { caption: string | null; dataUri: string }[];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderHtml(data: HtmlData): string {
  const c = data.component;
  const imgs = data.images
    .map((i) => `<figure><img src="${esc(i.dataUri)}" alt="${esc(i.caption ?? '')}"/><figcaption>${esc(i.caption ?? '')}</figcaption></figure>`)
    .join('\n');
  const ancestors = data.impact.ancestors.length
    ? `<ul>${data.impact.ancestors.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`
    : '<p>(none)</p>';
  const paths = data.accessPaths.length
    ? `<ul>${data.accessPaths.map((p) => `<li><code>${esc(p.routeUrl)}</code> — ${p.componentChain.map(esc).join(' › ')}${p.uncertain ? ' <em>(uncertain)</em>' : ''}</li>`).join('')}</ul>`
    : '<p>(none)</p>';
  const uncertainNote = data.impact.uncertain ? `<p class="warn">⚠ ${esc(data.impact.uncertainReason ?? 'impact may be incomplete')}</p>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${esc(c.id)} — component map</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; max-width: 60rem; }
  h1 { margin-bottom: .25rem; } .meta { color: #555; }
  figure { display: inline-block; margin: .5rem; vertical-align: top; }
  img { max-width: 24rem; border: 1px solid #ccc; } figcaption { color: #555; font-size: 12px; }
  .warn { color: #b00; } code { background: #f4f4f4; padding: 0 .2rem; }
</style></head><body>
<h1>${esc(c.id)}</h1>
<p class="meta">componentId: <strong>${esc(c.componentId ?? '—')}</strong> · selector: <code>${esc(c.selector ?? '—')}</code>
 · standalone: ${c.standalone} · module: ${esc(c.module ?? '—')}<br/><code>${esc(c.filePath)}</code></p>
<section><h2>Images</h2>${imgs || '<p>(none)</p>'}</section>
<section><h2>Impact (affected ancestors)</h2>${uncertainNote}${ancestors}</section>
<section><h2>UI access paths</h2>${paths}</section>
</body></html>`;
}
