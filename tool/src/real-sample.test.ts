import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { buildGraphFromRoot } from './graph/index.js';
import { uiAccessPaths } from './query/index.js';

const ROOT = fileURLToPath(new URL('../../poc/real-sample/src', import.meta.url));

const EXPECTED_EDGES = [
  'AppComponent->NotificationBannerComponent',
  'InvoiceListPage->SearchBoxComponent',
  'InvoiceListPage->InvoiceManagementComponent',
  'InvoiceListPage->DataTableComponent',
  'InvoiceListPage->PaginationComponent',
  'PaymentDetailPage->NotificationBannerComponent',
  'PaymentDetailPage->TooltipComponent',
  'PaymentDetailPage->PaymentSummaryComponent',
  'ReportDashboardPage->ReportFilterComponent',
  'ReportDashboardPage->DataTableComponent',
  'InvoiceManagementComponent->FormControlWrapperComponent',
  'InvoiceManagementComponent->DataTableComponent',
  'InvoiceManagementComponent->PaymentSummaryComponent',
  'InvoiceManagementComponent->ModalContainerComponent',
  'PaymentSummaryComponent->ProgressIndicatorComponent',
  'PaymentSummaryComponent->ErrorMessageComponent',
  'ReportFilterComponent->DropdownSelectorComponent',
  'ReportFilterComponent->SearchBoxComponent',
  'ReportFilterComponent->FileUploaderComponent',
].sort();

describe('real Angular 15 sample (ground truth)', () => {
  const { graph, parseErrors } = buildGraphFromRoot(ROOT);
  const resolved = graph.edges
    .filter((e) => e.kind === 'resolved' && e.to)
    .map((e) => `${e.from}->${e.to}`)
    .sort();

  it('indexes 18 components, all NgModule (standalone:false), with no parse errors', () => {
    expect(graph.components).toHaveLength(18);
    expect(graph.components.every((c) => c.standalone === false)).toBe(true);
    expect(parseErrors).toEqual([]);
  });

  it('resolved edges match the hand-authored ground truth (>=95% accuracy)', () => {
    const expectedSet = new Set(EXPECTED_EDGES);
    const matched = resolved.filter((e) => expectedSet.has(e));
    const accuracy = matched.length / EXPECTED_EDGES.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
    expect(resolved).toEqual(EXPECTED_EDGES);
  });

  it('flags the dynamic/indirect cases (ng-content, outlets, ViewChild, createComponent)', () => {
    const dyn = graph.edges.filter((e) => e.kind !== 'resolved');
    const reasons = new Set(dyn.map((e) => e.reason));
    expect(reasons.has('ng-content')).toBe(true);
    expect(reasons.has('ngTemplateOutlet')).toBe(true);
    expect(reasons.has('ngComponentOutlet')).toBe(true);
    expect(dyn.some((e) => e.reason?.includes('ViewChild'))).toBe(true);
    expect(dyn.some((e) => e.reason === 'createComponent')).toBe(true);
  });

  it('resolves a UI access path to a deep shared component', () => {
    const paths = uiAccessPaths(graph, 'DataTableComponent').map((p) => p.routeUrl);
    expect(paths).toContain('finance/invoices');
  });
});
