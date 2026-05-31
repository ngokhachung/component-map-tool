import { writeFileSync } from 'node:fs';
import type { Graph } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';
import { scaffoldGaps } from '../overrides/gaps.js';
import { computeIssues } from './lint.js';
import { acceptInto, emptyBaseline, writeBaseline } from './baseline.js';

export interface Coverage {
  totalComponents: number;
  withMd: number;
  needingDoc: number;   // components with ≥1 unresolved-static construct
  documented: number;   // needingDoc whose constructs are all covered (no open gap)
  missingMd: string[];  // filePaths with no componentId (sorted)
}

// component ids that have at least one pinnable dynamic construct (mirrors gaps.constructsByComponent keys)
function componentsWithConstructs(graph: Graph): Set<string> {
  const s = new Set<string>();
  for (const e of graph.edges) if (e.kind === 'unresolved-static' && e.reason) s.add(e.from);
  return s;
}

export function computeCoverage(graph: Graph, issues: Map<string, string[]>): Coverage {
  const totalComponents = graph.components.length;
  const withMd = graph.components.filter((c) => c.componentId !== null).length;
  const missingMd = graph.components.filter((c) => c.componentId === null).map((c) => c.filePath).sort();

  const constructIds = componentsWithConstructs(graph);
  const idToFile = new Map(graph.components.map((c) => [c.id, c.filePath]));
  let openGapComponents = 0;
  for (const id of constructIds) {
    const fp = idToFile.get(id);
    if (fp && (issues.get(fp) ?? []).some((c) => c.startsWith('gap:'))) openGapComponents += 1;
  }
  const needingDoc = constructIds.size;
  return { totalComponents, withMd, needingDoc, documented: needingDoc - openGapComponents, missingMd };
}

export function renderCoverageMd(cov: Coverage): string {
  const pct = (n: number, d: number) => (d === 0 ? '100%' : `${Math.round((n / d) * 100)}%`);
  const lines = [
    '# Component Map — Coverage',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Total components | ${cov.totalComponents} |`,
    `| With project MD | ${cov.withMd} / ${cov.totalComponents} (${pct(cov.withMd, cov.totalComponents)}) |`,
    `| Dynamic-dep components documented | ${cov.documented} / ${cov.needingDoc} (${pct(cov.documented, cov.needingDoc)}) |`,
    '',
    `## Components missing project MD (${cov.missingMd.length})`,
    '',
    ...(cov.missingMd.length ? cov.missingMd.map((f) => `- ${f}`) : ['_none_']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export interface MigrateResult {
  scaffolded: string[];
  scaffoldWarnings: string[];
  baselinePath: string;
  coveragePath: string;
  coverage: Coverage;
}

export function migrate(
  graph: Graph,
  overrides: Map<string, CmapOverride>,
  opts: { overridesDir: string; baselinePath: string; coveragePath: string },
): MigrateResult {
  const { written, warnings } = scaffoldGaps(graph, overrides, opts.overridesDir);
  const issues = computeIssues(graph, overrides);
  writeBaseline(opts.baselinePath, acceptInto(emptyBaseline(), issues));
  const coverage = computeCoverage(graph, issues);
  writeFileSync(opts.coveragePath, renderCoverageMd(coverage));
  writeFileSync(opts.coveragePath.replace(/\.md$/, '.json'), `${JSON.stringify(coverage, null, 2)}\n`);
  return { scaffolded: written, scaffoldWarnings: warnings, baselinePath: opts.baselinePath, coveragePath: opts.coveragePath, coverage };
}
