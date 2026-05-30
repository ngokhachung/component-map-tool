import { describe, it, expect } from 'vitest';
import { renderHtml } from './html.js';

const data = {
  component: { id: 'InvoiceListPage', componentId: 'C001', selector: 'app-invoice-list-page', filePath: 'src/app/x.ts', standalone: false, module: 'FinanceModule' },
  impact: { target: 'InvoiceListPage', ancestors: ['AppComponent'], uncertain: true, uncertainReason: '2 indirect deps' },
  accessPaths: [{ routeUrl: 'finance/invoices', componentChain: ['InvoiceListPage'], uncertain: false }],
  images: [{ caption: 'Label', dataUri: 'data:image/png;base64,AAAA' }],
};

describe('renderHtml', () => {
  it('produces a self-contained HTML document with the key facts', () => {
    const html = renderHtml(data);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('InvoiceListPage');
    expect(html).toContain('C001');
    expect(html).toContain('finance/invoices');
    expect(html).toContain('AppComponent');
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).not.toMatch(/src="https?:/);
  });

  it('escapes HTML in text fields', () => {
    const html = renderHtml({ ...data, component: { ...data.component, filePath: '<x>&"' } });
    expect(html).toContain('&lt;x&gt;&amp;&quot;');
  });
});
