import {
  ObjectLiteralExpression, ArrayLiteralExpression, SourceFile, Node, SyntaxKind,
} from 'ts-morph';
import type { RouteNode, LazyTarget } from '../types.js';

function initOf(obj: ObjectLiteralExpression, name: string): Node | undefined {
  return obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
}
function strProp(obj: ObjectLiteralExpression, name: string): string | null {
  const i = initOf(obj, name);
  return i && Node.isStringLiteral(i) ? i.getLiteralValue() : null;
}
function identProp(obj: ObjectLiteralExpression, name: string): string | null {
  const i = initOf(obj, name);
  return i && Node.isIdentifier(i) ? i.getText() : null;
}
function guardNames(obj: ObjectLiteralExpression, name: string): string[] {
  const i = initOf(obj, name);
  return i && Node.isArrayLiteralExpression(i) ? i.getElements().map((e) => e.getText()) : [];
}

function joinPath(base: string, seg: string | null): string {
  return [base, seg ?? ''].filter((s) => s.length > 0).join('/');
}

function recoverLazy(init: Node | undefined): LazyTarget | null {
  if (!init || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return null;
  const importCall = init.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getKind() === SyntaxKind.ImportKeyword);
  const specArg = importCall?.getArguments()[0];
  if (!specArg || !Node.isStringLiteral(specArg)) return null;
  const importPath = specArg.getLiteralValue();
  let symbol: string | null = null;
  const thenAccess = init.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).find((p) => p.getName() === 'then');
  const cb = thenAccess?.getParentIfKind(SyntaxKind.CallExpression)?.getArguments()[0];
  if (cb && (Node.isArrowFunction(cb) || Node.isFunctionExpression(cb))) {
    symbol = cb.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).pop()?.getName() ?? null;
  }
  return { importPath, symbol };
}

export function parseRoute(obj: ObjectLiteralExpression, basePath: string): RouteNode {
  const fullPath = joinPath(basePath, strProp(obj, 'path'));
  const childrenInit = initOf(obj, 'children');
  const children = childrenInit && Node.isArrayLiteralExpression(childrenInit)
    ? childrenInit.getElements().filter(Node.isObjectLiteralExpression).map((c) => parseRoute(c, fullPath))
    : [];
  return {
    fullPath,
    component: identProp(obj, 'component'),
    redirectTo: strProp(obj, 'redirectTo'),
    loadChildren: recoverLazy(initOf(obj, 'loadChildren')),
    loadComponent: recoverLazy(initOf(obj, 'loadComponent')),
    outlet: strProp(obj, 'outlet'),
    pathMatch: strProp(obj, 'pathMatch'),
    guards: [...guardNames(obj, 'canActivate'), ...guardNames(obj, 'canActivateChild'), ...guardNames(obj, 'canMatch')],
    children,
  };
}

export function parseRouteArray(arr: ArrayLiteralExpression, basePath: string): RouteNode[] {
  return arr.getElements().filter(Node.isObjectLiteralExpression).map((o) => parseRoute(o, basePath));
}

function asRouteArray(arg: Node | undefined, sf: SourceFile): ArrayLiteralExpression | null {
  if (!arg) return null;
  if (Node.isArrayLiteralExpression(arg)) return arg;
  if (Node.isIdentifier(arg)) {
    const init = sf.getVariableDeclaration(arg.getText())?.getInitializer();
    if (init && Node.isArrayLiteralExpression(init)) return init;
  }
  return null;
}

function routerArrays(sf: SourceFile, exprNames: string[]): ArrayLiteralExpression[] {
  const out: ArrayLiteralExpression[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!exprNames.includes(call.getExpression().getText())) continue;
    const arr = asRouteArray(call.getArguments()[0], sf);
    if (arr) out.push(arr);
  }
  return out;
}

export function findRootRouteArrays(sf: SourceFile): ArrayLiteralExpression[] {
  return routerArrays(sf, ['provideRouter', 'RouterModule.forRoot']);
}
export function findChildRouteArrays(sf: SourceFile): ArrayLiteralExpression[] {
  return routerArrays(sf, ['RouterModule.forChild']);
}
