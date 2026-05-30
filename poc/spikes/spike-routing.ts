import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  Project, SyntaxKind, Node, ArrayLiteralExpression, ObjectLiteralExpression, CallExpression,
} from 'ts-morph';
import type { RouteRecord, LazyTarget, TaskReport } from '../types.js';
import { scoreCase, scoreTask } from '../harness/report.js';
import { loadFixtures } from './lib/load-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'routing');

function recoverLazy(init: Node | undefined): { lazy: LazyTarget | null; unresolved: boolean } {
  if (!init || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return { lazy: null, unresolved: false };
  const importCall = init.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getKind() === SyntaxKind.ImportKeyword);
  if (!importCall) return { lazy: null, unresolved: true };
  const specArg = importCall.getArguments()[0];
  if (!specArg || !Node.isStringLiteral(specArg)) return { lazy: null, unresolved: true };
  const importPath = specArg.getLiteralValue();
  let symbol: string | null = null;
  const thenAccess = init.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .find((p) => p.getName() === 'then');
  const thenCall = thenAccess?.getParentIfKind(SyntaxKind.CallExpression) as CallExpression | undefined;
  const cb = thenCall?.getArguments()[0];
  if (cb && (Node.isArrowFunction(cb) || Node.isFunctionExpression(cb))) {
    const ret = cb.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).pop();
    symbol = ret?.getName() ?? null;
  }
  return { lazy: { importPath, symbol }, unresolved: false };
}

function strProp(obj: ObjectLiteralExpression, name: string): string | null {
  const init = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  return init && Node.isStringLiteral(init) ? init.getLiteralValue() : null;
}

function identProp(obj: ObjectLiteralExpression, name: string): string | null {
  const init = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  return init && Node.isIdentifier(init) ? init.getText() : null;
}

function guardNames(obj: ObjectLiteralExpression, name: string): string[] {
  const init = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (init && Node.isArrayLiteralExpression(init)) return init.getElements().map((e) => e.getText());
  return [];
}

function parseRoute(obj: ObjectLiteralExpression): RouteRecord {
  const loadChildrenInit = obj.getProperty('loadChildren')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  const loadComponentInit = obj.getProperty('loadComponent')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  const lc = recoverLazy(loadChildrenInit);
  const lcomp = recoverLazy(loadComponentInit);
  const childrenInit = obj.getProperty('children')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  const children = childrenInit && Node.isArrayLiteralExpression(childrenInit)
    ? childrenInit.getElements().filter(Node.isObjectLiteralExpression).map(parseRoute)
    : [];
  const guards = [...guardNames(obj, 'canActivate'), ...guardNames(obj, 'canMatch'), ...guardNames(obj, 'canActivateChild')];
  return {
    path: strProp(obj, 'path'),
    component: identProp(obj, 'component'),
    redirectTo: strProp(obj, 'redirectTo'),
    loadChildren: lc.lazy,
    loadComponent: lcomp.lazy,
    guards,
    children,
    unresolvedLazy: lc.unresolved || lcomp.unresolved,
  };
}

function findRoutesArray(project: Project, sourcePath: string): ArrayLiteralExpression | null {
  const sf = project.getSourceFileOrThrow(sourcePath);
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (exprText === 'provideRouter' || exprText === 'RouterModule.forRoot' || exprText === 'RouterModule.forChild') {
      const arg = call.getArguments()[0];
      if (arg && Node.isArrayLiteralExpression(arg)) return arg;
      if (arg && Node.isIdentifier(arg)) {
        const decl = arg.getDefinitionNodes().find(Node.isVariableDeclaration);
        const init = decl?.getInitializer();
        if (init && Node.isArrayLiteralExpression(init)) return init;
      }
    }
  }
  const v = sf.getVariableDeclaration((d) => {
    const init = d.getInitializer();
    return !!init && Node.isArrayLiteralExpression(init);
  });
  const init = v?.getInitializer();
  return init && Node.isArrayLiteralExpression(init) ? init : null;
}

function main(): TaskReport {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  project.addSourceFilesAtPaths(join(FIXTURES, '*.ts'));
  const fixtures = loadFixtures<RouteRecord[]>(FIXTURES, '.ts');
  const cases = fixtures.map((fx) => {
    const arr = findRoutesArray(project, fx.sourcePath);
    const actual = arr ? arr.getElements().filter(Node.isObjectLiteralExpression).map(parseRoute) : [];
    writeFileSync(`${fx.sourcePath}.actual.json`, JSON.stringify(actual, null, 2));
    return scoreCase(fx.name, actual, fx.expected);
  });
  const report = scoreTask('routing', cases);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('spike-routing.ts')) main();
export { main as runRoutingSpike, parseRoute, findRoutesArray };
