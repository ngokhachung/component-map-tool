import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraphFromRoot } from '../graph/index.js';
import { enrichGraph } from '../md/index.js';
import { readOverrides } from './parse.js';
import { applyOverrides } from './merge.js';
import { findGaps } from './gaps.js';

const ROOT = fileURLToPath(new URL('../../../poc/real-sample/src', import.meta.url));

describe('overrides end-to-end on the real Angular 15 sample', () => {
  it('documenting ReportDashboardPage ngComponentOutlet adds a via:override edge + closes the gap', () => {
    const { graph } = buildGraphFromRoot(ROOT);

    expect(graph.edges.some((e) => e.from === 'ReportDashboardPage' && e.kind === 'unresolved-static' && e.reason === 'ngComponentOutlet')).toBe(true);
    expect(findGaps(graph, new Map()).some((g) => g.id === 'ReportDashboardPage')).toBe(true);

    const docs = mkdtempSync(join(tmpdir(), 'cmap-docs-'));
    const ovDir = mkdtempSync(join(tmpdir(), 'cmap-ov-'));
    try {
      writeFileSync(join(docs, 'RPT.md'), `# [RPT-DASH] Report Dashboard

|x|コンポーネントID|y|
|:--|:--|:--|
|a|RPT-DASH|b|

## ソースパス
\`features/finance/pages/report-dashboard/report-dashboard.page.ts\`
`);
      enrichGraph(graph, docs);
      expect(graph.components.find((c) => c.className === 'ReportDashboardPage')?.componentId).toBe('RPT-DASH');

      writeFileSync(join(ovDir, 'RPT-DASH.cmap.yaml'), `schemaVersion: 1
componentId: RPT-DASH
dynamicDeps:
  - target: PaymentSummaryComponent
    reason: ngComponentOutlet
`);
      const { overrides } = readOverrides(ovDir);
      const { warnings } = applyOverrides(graph, overrides);
      expect(warnings).toEqual([]);

      expect(graph.edges).toContainEqual({ from: 'ReportDashboardPage', to: 'PaymentSummaryComponent', kind: 'resolved', via: 'override', reason: 'ngComponentOutlet' });
      expect(findGaps(graph, overrides).some((g) => g.id === 'ReportDashboardPage')).toBe(false);
    } finally {
      rmSync(docs, { recursive: true, force: true });
      rmSync(ovDir, { recursive: true, force: true });
    }
  });
});
