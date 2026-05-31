import { posix } from 'node:path';
import type { Graph } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';
import { findGaps } from '../overrides/gaps.js';
import { computeCoverage, type Coverage } from '../cli/migrate.js';
import { computeIssues } from '../cli/lint.js';

export interface StaleEntry {
  component: string;
  kind: 'md' | 'override';
  componentFile: string;
  docFile: string;
  componentMtime: number;
  docMtime: number;
}
export interface AuditReport {
  stale: StaleEntry[];
  coverage: Coverage;
  overrideOrphans: string[];
  gaps: { component: string; filePath: string; uncovered: string[] }[];
  warnings: string[];
}

export interface AuditOpts {
  mtimes: Map<string, number>;
  root: string;
  overrideFiles: Map<string, string>;
  warnings: string[];
}

export function auditReport(graph: Graph, overrides: Map<string, CmapOverride>, opts: AuditOpts): AuditReport {
  const { mtimes, root, overrideFiles, warnings } = opts;
  const stale: StaleEntry[] = [];
  for (const node of graph.components) {
    const compM = mtimes.get(posix.join(root, node.filePath));
    if (compM === undefined) continue;
    if (node.docPath) {
      const docM = mtimes.get(node.docPath);
      if (docM !== undefined && compM > docM) {
        stale.push({ component: node.id, kind: 'md', componentFile: node.filePath, docFile: node.docPath, componentMtime: compM, docMtime: docM });
      }
    }
    if (node.componentId && overrides.has(node.componentId)) {
      const ovPath = overrideFiles.get(node.componentId);
      const ovM = ovPath ? mtimes.get(ovPath) : undefined;
      if (ovPath && ovM !== undefined && compM > ovM) {
        stale.push({ component: node.id, kind: 'override', componentFile: node.filePath, docFile: ovPath, componentMtime: compM, docMtime: ovM });
      }
    }
  }
  const nodeIds = new Set(graph.components.map((c) => c.componentId).filter((x): x is string => x !== null));
  const overrideOrphans = [...overrides.keys()].filter((id) => !nodeIds.has(id)).sort();
  const issues = computeIssues(graph, overrides);
  const coverage = computeCoverage(graph, issues);
  const gaps = findGaps(graph, overrides).map((g) => ({ component: g.componentId ?? g.id, filePath: g.filePath, uncovered: g.uncovered }));
  return { stale, coverage, overrideOrphans, gaps, warnings };
}

export function renderAuditMd(r: AuditReport): string {
  const pct = (n: number, d: number) => (d === 0 ? '100%' : `${Math.round((n / d) * 100)}%`);
  const lines = [
    '# Component Map — Audit',
    '',
    `## Stale docs (${r.stale.length})`,
    '',
    ...(r.stale.length
      ? r.stale.map((s) => `- \`${s.component}\` — ${s.kind} doc \`${s.docFile}\` is older than the component (\`${s.componentFile}\`)`)
      : ['_none — all docs are at least as new as their components_']),
    '',
    '## Coverage',
    '',
    `- With project MD: ${r.coverage.withMd} / ${r.coverage.totalComponents} (${pct(r.coverage.withMd, r.coverage.totalComponents)})`,
    `- Dynamic-dep components documented: ${r.coverage.documented} / ${r.coverage.needingDoc} (${pct(r.coverage.documented, r.coverage.needingDoc)})`,
    '',
    `## Orphans (${r.overrideOrphans.length} override(s) with no matching component)`,
    '',
    ...(r.overrideOrphans.length ? r.overrideOrphans.map((o) => `- \`${o}\``) : ['_none_']),
    '',
    `## Open gaps (${r.gaps.length})`,
    '',
    ...(r.gaps.length ? r.gaps.map((g) => `- \`${g.component}\` (${g.filePath}): ${g.uncovered.join(', ')}`) : ['_none_']),
    '',
  ];
  if (r.warnings.length) lines.push('## Warnings', '', ...r.warnings.map((w) => `- ${w}`), '');
  return `${lines.join('\n')}\n`;
}
