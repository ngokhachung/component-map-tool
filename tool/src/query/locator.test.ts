import { describe, it, expect } from 'vitest';
import { resolveLocator } from './locator.js';
import type { Graph, ComponentNode } from '../types.js';

function node(p: Partial<ComponentNode> & { className: string }): ComponentNode {
  return {
    id: p.className, componentId: null, selector: null,
    filePath: `src/${p.className}.ts`, standalone: false, module: null,
    templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null,
    ...p,
  };
}
function graph(components: ComponentNode[]): Graph {
  return { schemaVersion: 1, components, edges: [], routes: [] };
}

const g = graph([
  node({ className: 'InvoiceManagementComponent', selector: 'app-invoice', componentId: 'C001', filePath: 'src/finance/invoice.component.ts' }),
  node({ className: 'DataTableComponent', selector: 'app-data-table', filePath: 'src/shared/data-table.component.ts' }),
  node({ className: 'DupComponent', selector: 'app-dup', filePath: 'src/a/dup.component.ts' }),
  node({ className: 'DupComponent', selector: 'app-dup2', filePath: 'src/b/dup.component.ts' }),
]);

describe('resolveLocator', () => {
  it('resolves by componentId', () => {
    const r = resolveLocator(g, 'C001');
    expect(r.ok && r.node.className).toBe('InvoiceManagementComponent');
  });
  it('resolves by class name (case-insensitive, optional Component suffix)', () => {
    expect(resolveLocator(g, 'invoicemanagement').ok && resolveLocator(g, 'invoicemanagement')).toBeTruthy();
    const r = resolveLocator(g, 'InvoiceManagement');
    expect(r.ok && r.node.selector).toBe('app-invoice');
  });
  it('resolves by file basename or full path', () => {
    expect((resolveLocator(g, 'data-table.component.ts') as { node: ComponentNode }).node?.className).toBe('DataTableComponent');
    expect((resolveLocator(g, 'src/shared/data-table.component.ts') as { node: ComponentNode }).node?.className).toBe('DataTableComponent');
  });
  it('resolves by selector', () => {
    expect((resolveLocator(g, 'app-data-table') as { node: ComponentNode }).node?.className).toBe('DataTableComponent');
  });
  it('reports ambiguous with candidates when >1 match (duplicate class name)', () => {
    const r = resolveLocator(g, 'DupComponent');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('ambiguous');
    expect(r.ok === false && r.reason === 'ambiguous' && r.candidates.map((c) => c.filePath).sort())
      .toEqual(['src/a/dup.component.ts', 'src/b/dup.component.ts']);
  });
  it('reports not-found', () => {
    const r = resolveLocator(g, 'nope');
    expect(r.ok === false && r.reason).toBe('not-found');
  });
});
