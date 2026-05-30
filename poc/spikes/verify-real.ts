// Smoke / eyeball verifier — runs the three POC parsers against REAL Angular
// source dropped into `poc/real-sample/`. No expected.json, no scoring: it just
// parses and dumps JSON so a human can sanity-check the output on real code.
//
// This is the "validate against a real repo" carry-forward from phase0-SUMMARY.md,
// done in smoke mode. Throwaway POC tooling — not production code.
//
// Run:  npm run verify:real
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { Project, Node, SyntaxKind, ClassDeclaration } from 'ts-morph';
import type {
  ComponentRecord, RouteRecord, TemplateResult,
} from '../types.js';
import type { SelectorEntry } from './lib/template-visitor.js';
import { buildMatcher } from './lib/template-visitor.js';
import { extractComponent, buildModuleMap } from './spike-component.js';
import { parseRoute, findRoutesArray } from './spike-routing.js';
import { parseHtmlFixture, parseTsFixture } from './spike-template.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = join(HERE, '..', 'real-sample');

// Read an inline `template` / `templateUrl` string off a @Component decorator.
function readTemplate(cls: ClassDeclaration): { kind: 'inline' | 'url' | 'none'; value: string | null } {
  const arg = cls.getDecorator('Component')?.getArguments()[0];
  if (!arg || !Node.isObjectLiteralExpression(arg)) return { kind: 'none', value: null };
  const tplInit = arg.getProperty('template')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (tplInit && (Node.isStringLiteral(tplInit) || Node.isNoSubstitutionTemplateLiteral(tplInit)))
    return { kind: 'inline', value: tplInit.getLiteralValue() };
  const urlInit = arg.getProperty('templateUrl')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (urlInit && Node.isStringLiteral(urlInit)) return { kind: 'url', value: urlInit.getLiteralValue() };
  return { kind: 'none', value: null };
}

function isRouteFile(text: string): boolean {
  return /provideRouter|RouterModule\.for(Root|Child)|:\s*Routes\b/.test(text);
}

interface RealReport {
  summary: {
    sourceFiles: number;
    components: number;
    routeFiles: number;
    totalRoutes: number;
    templatesParsed: number;
    totalTemplateParseErrors: number;
    standaloneMisclassified: number;
  };
  components: Array<ComponentRecord & { file: string; standaloneResolved: boolean }>;
  selectorRegistry: SelectorEntry[];
  routes: Array<{ file: string; routes: RouteRecord[] }>;
  templates: Array<{ component: string; file: string; source: 'inline' | 'templateUrl' | 'ts'; result: TemplateResult }>;
}

function main(): void {
  if (!existsSync(REAL) || readdirSync(REAL).filter((f) => !f.startsWith('.') && f !== 'README.md').length === 0) {
    console.error(
      `\n[verify:real] No source found in ${REAL}\n` +
      `Drop real Angular files there (*.component.ts, route files, *.html) then re-run.\n`,
    );
    process.exit(1);
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false, strict: false },
  });
  project.addSourceFilesAtPaths(join(REAL, '**/*.ts'));
  const sourceFiles = project.getSourceFiles();
  const moduleMap = buildModuleMap(project);

  // ---- Components + auto-built selector registry ----
  const components: RealReport['components'] = [];
  const registry: SelectorEntry[] = [];
  for (const sf of sourceFiles) {
    for (const cls of sf.getClasses()) {
      if (!cls.getDecorator('Component')) continue;
      const rec = extractComponent(cls, moduleMap);
      if (!rec) continue;
      const file = relative(REAL, sf.getFilePath());
      // NgModule-membership cross-check: a component declared in an @NgModule is
      // definitively NOT standalone, regardless of the version-default heuristic.
      // (Proposed Phase 1 fix — the spike's raw `standalone` assumes the v19 default.)
      const standaloneResolved = rec.module != null ? false : rec.standalone;
      components.push({ ...rec, file, standaloneResolved });
      if (rec.selector) registry.push({ selector: rec.selector, className: rec.className });
    }
  }

  // ---- Routes ----
  const matcher = buildMatcher(registry);
  const routes: RealReport['routes'] = [];
  let totalRoutes = 0;
  for (const sf of sourceFiles) {
    if (!isRouteFile(sf.getFullText())) continue;
    const arr = findRoutesArray(project, sf.getFilePath());
    if (!arr) continue;
    const parsed = arr.getElements().filter(Node.isObjectLiteralExpression).map(parseRoute);
    if (parsed.length === 0) continue;
    routes.push({ file: relative(REAL, sf.getFilePath()), routes: parsed });
    totalRoutes += parsed.length;
  }

  // ---- Templates (per component) ----
  const templates: RealReport['templates'] = [];
  let totalTemplateParseErrors = 0;
  for (const sf of sourceFiles) {
    for (const cls of sf.getClasses()) {
      if (!cls.getDecorator('Component')) continue;
      const className = cls.getName() ?? '<anon>';
      const file = relative(REAL, sf.getFilePath());
      const tpl = readTemplate(cls);
      if (tpl.kind === 'inline' && tpl.value !== null) {
        const result = parseHtmlFixture(tpl.value, matcher);
        totalTemplateParseErrors += result.parseErrors;
        templates.push({ component: className, file, source: 'inline', result });
      } else if (tpl.kind === 'url' && tpl.value) {
        const htmlPath = join(sf.getDirectoryPath(), tpl.value);
        if (existsSync(htmlPath)) {
          const result = parseHtmlFixture(readFileSync(htmlPath, 'utf8'), matcher);
          totalTemplateParseErrors += result.parseErrors;
          templates.push({ component: className, file: relative(REAL, htmlPath), source: 'templateUrl', result });
        }
      }
      // Always scan the .ts for @ViewChild / ViewContainerRef.createComponent.
      const tsResult = parseTsFixture(sf.getFilePath());
      if (tsResult.deps.length > 0) templates.push({ component: className, file, source: 'ts', result: tsResult });
    }
  }

  const report: RealReport = {
    summary: {
      sourceFiles: sourceFiles.length,
      components: components.length,
      routeFiles: routes.length,
      totalRoutes,
      templatesParsed: templates.length,
      totalTemplateParseErrors,
      standaloneMisclassified: components.filter((c) => c.standalone !== c.standaloneResolved).length,
    },
    components,
    selectorRegistry: registry,
    routes,
    templates,
  };

  console.log(JSON.stringify(report, null, 2));
  const out = join(REAL, 'verify-real.actual.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.error(`\n[verify:real] Summary: ${JSON.stringify(report.summary)}`);
  console.error(`[verify:real] Full JSON written to ${relative(join(HERE, '..'), out)} (gitignored)`);
}

main();
