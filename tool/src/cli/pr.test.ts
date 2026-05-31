import { describe, it, expect } from 'vitest';
import { renderPrComment, PR_MARKER, type PrComponent } from './pr.js';

const base: PrComponent = {
  id: 'DataTableComponent', componentId: 'C001', selector: 'app-data-table', filePath: 'src/x.ts',
  description: 'A reusable table.', ancestors: ['InvoiceListPage', 'ReportDashboardPage'], uncertain: true,
  accessPaths: [{ routeUrl: 'finance/invoices', componentChain: ['InvoiceListPage', 'DataTableComponent'] }],
  gaps: ['ngComponentOutlet'],
};

describe('renderPrComment', () => {
  it('renders marker + component facts', () => {
    const md = renderPrComment([base]);
    expect(md.startsWith(PR_MARKER)).toBe(true);
    expect(md).toContain('DataTableComponent');
    expect(md).toContain('C001');
    expect(md).toContain('InvoiceListPage');
    expect(md).toContain('finance/invoices');
    expect(md).toContain('A reusable table.');
    expect(md).toContain('ngComponentOutlet');
    expect(md.toLowerCase()).toContain('incomplete');
  });

  it('empty list still returns the marker + a no-changes line', () => {
    const md = renderPrComment([]);
    expect(md.startsWith(PR_MARKER)).toBe(true);
    expect(md.toLowerCase()).toContain('no mapped');
  });

  it('caps ancestors and truncates under the byte cap', () => {
    const many: PrComponent = { ...base, ancestors: Array.from({ length: 30 }, (_, i) => `A${i}`) };
    const capped = renderPrComment([many], { maxAncestors: 5 });
    expect(capped).toContain('(+25 more)');

    const lots = Array.from({ length: 50 }, (_, i) => ({ ...base, id: `Comp${i}` }));
    const truncated = renderPrComment(lots, { maxBytes: 800 });
    expect(truncated.toLowerCase()).toContain('truncated');
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(900);
  });
});
