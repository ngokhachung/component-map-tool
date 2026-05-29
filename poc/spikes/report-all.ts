import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { TaskReport } from '../types.js';
import { runComponentSpike } from './spike-component.js';
import { runRoutingSpike } from './spike-routing.js';
import { runTemplateSpike } from './spike-template.js';

export type Verdict = 'GO' | 'GO-with-caveats' | 'NO-GO';

const COMPONENT_TYPE_MIN = 5; // spec §5: >=5 correct of EACH type

export function verdictForRateTask(rate: number): Verdict {
  if (rate <= 0.5) return 'NO-GO';
  if (rate < 0.8) return 'GO-with-caveats';
  return 'GO';
}

export function verdictForComponent(r: TaskReport): Verdict {
  if (r.rate <= 0.5) return 'NO-GO';
  const sa = r.meta?.standalonePassed;
  const ng = r.meta?.ngModulePassed;
  if (sa === undefined || ng === undefined) return 'NO-GO';
  // Spec §5: confident GO needs rate >=80% AND >=5 correct of EACH type.
  if (r.rate >= 0.8 && sa >= COMPONENT_TYPE_MIN && ng >= COMPONENT_TYPE_MIN) return 'GO';
  return 'GO-with-caveats';
}

function verdictForReport(r: TaskReport): Verdict {
  return r.task === 'component' ? verdictForComponent(r) : verdictForRateTask(r.rate);
}

export function overallVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.includes('NO-GO')) return 'NO-GO';
  if (verdicts.includes('GO-with-caveats')) return 'GO-with-caveats';
  return 'GO';
}

function renderTaskSection(r: TaskReport): string {
  const v = verdictForReport(r);
  const rows = r.cases.map((c) =>
    `| ${c.fixture} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.borderline ? 'yes' : ''} | ${c.notes} |`).join('\n');
  const metaLine = r.task === 'component' && r.meta
    ? `Type split: standalone ${r.meta.standalonePassed} correct, NgModule ${r.meta.ngModulePassed} correct (gate: >=${COMPONENT_TYPE_MIN} each)`
    : '';
  return [
    `### ${r.task} — ${v}`,
    `Pass rate: **${r.passed}/${r.total}** (${(r.rate * 100).toFixed(0)}%)`,
    metaLine,
    '',
    '| Fixture | Result | Borderline | Notes |',
    '|---|---|---|---|',
    rows,
    '',
  ].join('\n');
}

export function buildReport(reports: TaskReport[], compilerVersion: string): string {
  const verdicts = reports.map(verdictForReport);
  const overall = overallVerdict(verdicts);
  const component = reports.find((r) => r.task === 'component');
  const lines = [
    '# Phase 0 — Feasibility Report',
    '',
    `**Generated:** see git commit date  `,
    `**@angular/compiler pinned:** ${compilerVersion}  `,
    `**Overall verdict: ${overall}**`,
    '',
    '> Gate (spec §5): NO-GO if routing or template <=50%; GO-with-caveats 50-80%; confident GO >=80% per task AND component correct for >=5 of each type.',
    '',
    '## Per-task results',
    '',
    ...reports.map(renderTaskSection),
    '## Notes & risks carried to Phase 1',
    '',
    '- @angular/compiler template API is experimental/private and version-sensitive — GO is scoped to Angular 19 only; Phase 1 should evaluate the bundled-compiler vendoring pattern for multi-version (research P-AC2).',
    '- Import paths used: `parseTemplate`, `TmplAst*`, `CssSelector`, `SelectorMatcher` from `@angular/compiler`; `Project` from `ts-morph`.',
    `- Component coverage: ${component?.total ?? 0} components; standalone passed ${component?.meta?.standalonePassed ?? 0}, NgModule passed ${component?.meta?.ngModulePassed ?? 0} (requirement: >=5 each).`,
    '- Borderline cases (if any) are flagged in the tables above — review before trusting the percentage.',
    '',
  ];
  return lines.join('\n');
}

function main(): void {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const reports = [runComponentSpike(), runRoutingSpike(), runTemplateSpike()];
  const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const md = buildReport(reports, pkg.dependencies['@angular/compiler']);
  writeFileSync(join(HERE, '..', 'FEASIBILITY-REPORT.md'), md);
  console.log(md);
}

if (process.argv[1] && process.argv[1].endsWith('report-all.ts')) main();
