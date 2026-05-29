import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseTemplate } from '@angular/compiler';
import { Project, SyntaxKind, Node } from 'ts-morph';
import type { TemplateResult, TemplateDep, TaskReport, CaseResult } from '../types.js';
import { scoreCase, scoreTask } from '../harness/report.js';
import { buildMatcher, collectTemplateDeps } from './lib/template-visitor.js';
import type { SelectorEntry } from './lib/template-visitor.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'template');

function parseHtmlFixture(html: string, matcher: ReturnType<typeof buildMatcher>): TemplateResult {
  const parsed = parseTemplate(html, 'fixture.html', { enableBlockSyntax: true });
  const parseErrors = parsed.errors?.length ?? 0;
  const deps = parseErrors > 0 ? [] : collectTemplateDeps(parsed.nodes, matcher);
  return { deps, parseErrors };
}

function parseTsFixture(sourcePath: string): TemplateResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const sf = project.addSourceFileAtPath(sourcePath);
  const deps: TemplateDep[] = [];
  for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyDeclaration)) {
    if (prop.getDecorator('ViewChild') || prop.getDecorator('ViewChildren'))
      deps.push({ tag: 'ViewChild', component: null, kind: 'unresolved-static', reason: '@ViewChild query' });
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (Node.isPropertyAccessExpression(expr) && expr.getName() === 'createComponent')
      deps.push({ tag: 'ViewContainerRef.createComponent', component: null, kind: 'unresolved-static', reason: 'dynamic createComponent' });
  }
  return { deps, parseErrors: 0 };
}

function main(): TaskReport {
  const registry = JSON.parse(readFileSync(join(FIXTURES, 'selectors.json'), 'utf8')) as SelectorEntry[];
  const matcher = buildMatcher(registry);
  const files = readdirSync(FIXTURES);

  const cases: CaseResult[] = [];
  for (const f of files) {
    if (f === 'selectors.json' || f.endsWith('.expected.json')) continue;
    const base = f.replace(/\.(html|ts)$/, '');
    const expectedPath = join(FIXTURES, `${base}.expected.json`);
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as TemplateResult;
    const sourcePath = join(FIXTURES, f);
    const actual = f.endsWith('.html')
      ? parseHtmlFixture(readFileSync(sourcePath, 'utf8'), matcher)
      : parseTsFixture(sourcePath);
    writeFileSync(`${sourcePath}.actual.json`, JSON.stringify(actual, null, 2));
    cases.push(scoreCase(base, actual.deps, expected.deps, actual.parseErrors));
  }
  const report = scoreTask('template', cases);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('spike-template.ts')) main();
export { main as runTemplateSpike };
