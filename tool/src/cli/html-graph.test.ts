import { describe, it, expect } from 'vitest';
import { renderHtml, type HtmlData } from './html.js';
import { mermaidRuntime } from '../render/assets.js';

function baseData(): HtmlData {
  return {
    component: { id: 'T', componentId: null, selector: 't-sel', filePath: 'src/T.ts', standalone: false, module: null },
    impact: { target: 'T', ancestors: ['A'], uncertain: false, uncertainReason: null },
    accessPaths: [{ routeUrl: '/x', componentChain: ['A', 'T'], uncertain: false }],
    images: [],
  };
}

describe('renderHtml graph section', () => {
  it('embeds the mermaid def + inlined runtime + tooltip map when given a mermaidDef', () => {
    const html = renderHtml({ ...baseData(), mermaidDef: 'flowchart TD\n  nT["T"]:::target', tips: { T: 'src/T.ts · t-sel' }, mermaidRuntime: '/*MERMAID-RUNTIME*/' });
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('flowchart TD');
    expect(html).toContain('/*MERMAID-RUNTIME*/');
    expect(html).toContain('CMAP_TIP');
    expect(html).not.toContain('https://');
  });

  it('is unchanged (no graph section) when mermaidDef is absent', () => {
    expect(renderHtml(baseData())).not.toContain('class="mermaid"');
  });
});

describe('mermaidRuntime', () => {
  it('returns a non-empty inlinable runtime', () => {
    expect(mermaidRuntime().length).toBeGreaterThan(1000);
  });
});
