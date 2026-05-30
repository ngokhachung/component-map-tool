# Phase 1 — Plan 3: Route Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Parse an Angular route configuration into an order-preserving `RouteNode[]` tree with resolved full URL paths, lazy `loadChildren`/`loadComponent` recovery, guards, named outlets and `pathMatch` — and **stitch lazy `forChild` modules** so a child page gets its true full URL (e.g. `finance/invoices`).

**Architecture:** Two tasks. T6 = the per-array parser + restricted route-array detection (drops the POC's over-broad fallback). T7 = `parseRoutes(project, {root})` orchestrator that finds `forRoot`/`provideRouter` roots and recursively grafts each lazy route's target-module `forChild` routes — resolving the module file via Plan 1's checker-free `resolveImportFile` (NOT `getDefinitionNodes`).

**Tech Stack:** ts-morph (AST), Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "parseRouteArray parses path/component/redirectTo/loadChildren/loadComponent/outlet/pathMatch/guards/children with full paths that collapse empty segments (`finance` + `''` + `invoices` => `finance/invoices`)."
    - "Route-array detection only accepts arrays fed to provideRouter / RouterModule.forRoot / forChild (inline or a local const) — NOT an arbitrary array literal."
    - "parseRoutes stitches a lazy loadChildren route to its target module's forChild routes, producing the child's true full path."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/routes/parse.ts — recoverLazy, parseRoute, parseRouteArray, findRootRouteArrays, findChildRouteArrays"
    - "tool/src/routes/index.ts — parseRoutes(project, {root}) with lazy forChild stitching"
    - "tests for both"
  required_wiring:
    - "Graph (Plan 5) embeds parseRoutes output as Graph.routes; UI-access-path (Plan 7) walks it."
    - "Stitching uses resolveImportFile from Plan 1 (no type-checker)."
  key_links:
    - "drop over-broad findRoutesArray fallback -> router-fed arrays only (RESEARCH §4, QA)"
    - "lazy forChild stitching via export-index -> full URL across lazy boundary (RESEARCH §4)"
    - "order-preserving children + empty-segment collapse (SAC-03)"
```

---

## File Structure

- `tool/src/routes/parse.ts` — pure parsing of a route object/array + restricted array detection. One responsibility: turn route AST into `RouteNode`s within one file.
- `tool/src/routes/index.ts` — cross-file orchestration: collect roots, stitch lazy modules. One responsibility: assemble the full route tree.
- Tests alongside.

---

## Wave 3

### Task 6: Route parser (single-file)

<model>opus</model>

<read_first>
- `tool/src/types.ts` (RouteNode, LazyTarget)
- `poc/spikes/spike-routing.ts` (recoverLazy/parseRoute recipe) — port, but DROP the over-broad `findRoutesArray` fallback and ADD outlet/pathMatch + fullPath concatenation
- `.planning/phase1-RESEARCH.md` §4
</read_first>

**Files:**
- Create: `tool/src/routes/parse.ts`
- Test: `tool/src/routes/parse.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/routes/parse.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind, ArrayLiteralExpression } from 'ts-morph';
import { parseRouteArray, findRootRouteArrays, findChildRouteArrays } from './parse.js';

function firstArray(src: string): ArrayLiteralExpression {
  const p = new Project({ useInMemoryFileSystem: true });
  const sf = p.createSourceFile('/r.ts', src);
  return sf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);
}

describe('parseRouteArray', () => {
  it('parses paths, components, redirects, guards, outlets, pathMatch and nested full paths', () => {
    const arr = firstArray(`const r = [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'admin', component: AdminComponent, canActivate: [authGuard], children: [
        { path: 'users', component: UsersComponent },
        { path: '', component: AdminHomeComponent }
      ]},
      { path: 'aux', component: AuxComponent, outlet: 'side' },
      { path: '**', component: NotFoundComponent }
    ];`);
    const routes = parseRouteArray(arr, '');
    expect(routes[0]).toMatchObject({ fullPath: '', redirectTo: 'home', pathMatch: 'full', component: null });
    expect(routes[1]).toMatchObject({ fullPath: 'admin', component: 'AdminComponent', guards: ['authGuard'] });
    expect(routes[1].children[0]).toMatchObject({ fullPath: 'admin/users', component: 'UsersComponent' });
    expect(routes[1].children[1].fullPath).toBe('admin'); // empty child segment collapses
    expect(routes[2]).toMatchObject({ fullPath: 'aux', outlet: 'side' });
    expect(routes[3].fullPath).toBe('**');
  });

  it('recovers lazy loadChildren / loadComponent targets', () => {
    const arr = firstArray(`const r = [
      { path: 'lazy', loadChildren: () => import('./feature/x.module').then(m => m.XModule) },
      { path: 'lc', loadComponent: () => import('./y.component').then(m => m.YComponent) }
    ];`);
    const routes = parseRouteArray(arr, '');
    expect(routes[0].loadChildren).toEqual({ importPath: './feature/x.module', symbol: 'XModule' });
    expect(routes[1].loadComponent).toEqual({ importPath: './y.component', symbol: 'YComponent' });
  });
});

describe('route-array detection (restricted)', () => {
  it('finds arrays fed to forRoot/provideRouter (root) and forChild (child), inline or local const', () => {
    const p = new Project({ useInMemoryFileSystem: true });
    const sf = p.createSourceFile('/m.ts', `
      const routes = [{ path: 'a' }];
      RouterModule.forRoot(routes);
      provideRouter([{ path: 'b' }]);
      RouterModule.forChild([{ path: 'c' }]);
      const NOT_ROUTES = [{ foo: 1 }];`);
    expect(findRootRouteArrays(sf)).toHaveLength(2);  // forRoot(routes) + provideRouter([...])
    expect(findChildRouteArrays(sf)).toHaveLength(1); // forChild([...])
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/routes/parse.test.ts`

- [ ] **Step 3: Implement `tool/src/routes/parse.ts`**

```ts
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

// Join a parent path with a child segment, collapsing empty segments.
function joinPath(base: string, seg: string | null): string {
  return [base, seg ?? ''].filter((s) => s.length > 0).join('/');
}

// Recover `() => import('path').then(m => m.Symbol)` into a LazyTarget.
function recoverLazy(init: Node | undefined): LazyTarget | null {
  if (!init || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return null;
  const importCall = init.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getKind() === SyntaxKind.ImportKeyword);
  const specArg = importCall?.getArguments()[0];
  if (!specArg || !Node.isStringLiteral(specArg)) return null; // dynamic / non-literal => unresolved (null)
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

// Resolve a router-API argument to its array literal: inline, or a local const identifier.
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
```

- [ ] **Step 4: Run, verify PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/routes/parse.ts src/routes/parse.test.ts
git commit -m "feat(tool): route parser (paths/redirect/outlet/pathMatch/guards/lazy) + restricted array detection"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/routes/parse.test.ts && npx tsc --noEmit`
Expected: 3 tests PASS; tsc clean. Covers nested full-path concat + empty-segment collapse, redirect (no component), guards, outlet, pathMatch, wildcard, lazy load recovery, and restricted detection (router-fed only — the bare `NOT_ROUTES` array is ignored).
</verify>

<done>
`parse.ts` turns a route array into `RouteNode[]` with correct full paths and metadata, and detects route arrays only when fed to a router API (no over-broad fallback). Lazy targets recovered as `LazyTarget`.
</done>

---

### Task 7: Route orchestrator + lazy `forChild` stitching

<model>opus</model>

<read_first>
- `tool/src/routes/parse.ts` (T6)
- `tool/src/shared/project.ts` (resolveImportFile — checker-free cross-file resolution)
- `.planning/phase1-RESEARCH.md` §4 (lazy stitching)
</read_first>

**Files:**
- Create: `tool/src/routes/index.ts`
- Test: `tool/src/routes/index.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/routes/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { parseRoutes } from './index.js';

function repo(): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/src/app-routing.module.ts', `
    import { RouterModule } from '@angular/router';
    const routes = [
      { path: '', redirectTo: 'finance', pathMatch: 'full' },
      { path: 'finance', loadChildren: () => import('./feature/finance.module').then(m => m.FinanceModule) }
    ];
    RouterModule.forRoot(routes);`);
  p.createSourceFile('/src/feature/finance.module.ts', `
    import { RouterModule } from '@angular/router';
    const routes = [
      { path: '', redirectTo: 'invoices', pathMatch: 'full' },
      { path: 'invoices', component: InvoiceListPage }
    ];
    RouterModule.forChild(routes);`);
  return p;
}

describe('parseRoutes', () => {
  it('stitches a lazy loadChildren route to its target module forChild routes (full URL)', () => {
    const roots = parseRoutes(repo(), { root: '/src' });
    expect(roots).toHaveLength(2);
    expect(roots[0]).toMatchObject({ fullPath: '', redirectTo: 'finance', pathMatch: 'full' });

    const finance = roots[1];
    expect(finance.fullPath).toBe('finance');
    expect(finance.loadChildren).toEqual({ importPath: './feature/finance.module', symbol: 'FinanceModule' });
    // grafted from the lazy module's forChild routes, re-rooted under 'finance':
    const invoices = finance.children.find((c) => c.component === 'InvoiceListPage')!;
    expect(invoices.fullPath).toBe('finance/invoices');
    expect(finance.children.find((c) => c.redirectTo === 'invoices')?.fullPath).toBe('finance');
  });

  it('returns [] when there are no root route arrays', () => {
    const p = new Project({ useInMemoryFileSystem: true });
    p.createSourceFile('/src/x.ts', `const a = [{ path: 'nope' }];`);
    expect(parseRoutes(p, { root: '/src' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/routes/index.test.ts`

- [ ] **Step 3: Implement `tool/src/routes/index.ts`**

```ts
import { Project, SourceFile } from 'ts-morph';
import { resolveImportFile } from '../shared/project.js';
import { findRootRouteArrays, findChildRouteArrays, parseRouteArray } from './parse.js';
import type { RouteNode } from '../types.js';

// Files reachable via `sf`'s relative imports (one level) — a lazy feature module usually
// holds RouterModule.forChild() in a SEPARATE `*-routing.module.ts` that it imports.
function importedFiles(project: Project, sf: SourceFile): SourceFile[] {
  const out: SourceFile[] = [];
  for (const imp of sf.getImportDeclarations()) {
    const f = resolveImportFile(project, sf.getFilePath(), imp.getModuleSpecifierValue());
    if (f) out.push(f);
  }
  return out;
}

// A lazy module's forChild routes: in the resolved module file OR a routing module it imports.
function lazyChildRoutes(project: Project, moduleFile: SourceFile, basePath: string): { routes: RouteNode[]; file: SourceFile } {
  for (const f of [moduleFile, ...importedFiles(project, moduleFile)]) {
    const arrays = findChildRouteArrays(f);
    if (arrays.length > 0) return { routes: arrays.flatMap((a) => parseRouteArray(a, basePath)), file: f };
  }
  return { routes: [], file: moduleFile };
}

// Recursively stitch: descend statically-defined children (same file), then graft a lazy
// route's target-module forChild routes (re-rooted under the lazy route's full path).
function stitch(node: RouteNode, project: Project, fromFile: string): void {
  for (const c of node.children) stitch(c, project, fromFile);
  if (node.loadChildren) {
    const target = resolveImportFile(project, fromFile, node.loadChildren.importPath);
    if (target) {
      const { routes: grafted, file } = lazyChildRoutes(project, target, node.fullPath);
      for (const c of grafted) stitch(c, project, file.getFilePath());
      node.children = [...node.children, ...grafted];
    }
  }
}

// Parse the whole codebase's routes: roots come from forRoot/provideRouter; lazy children stitched in.
export function parseRoutes(project: Project, _opts: { root: string }): RouteNode[] {
  const roots: { node: RouteNode; file: string }[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const arr of findRootRouteArrays(sf)) {
      for (const node of parseRouteArray(arr, '')) roots.push({ node, file: sf.getFilePath() });
    }
  }
  for (const r of roots) stitch(r.node, project, r.file);
  return roots.map((r) => r.node);
}
```

- [ ] **Step 4: Run, verify PASS** (2 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/routes/index.ts src/routes/index.test.ts
git commit -m "feat(tool): route orchestrator with lazy forChild stitching (full URL across lazy boundary)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. Critically: a lazy `loadChildren` route's child resolves to its true full URL `finance/invoices` by stitching the target module's `forChild` routes via `resolveImportFile` (no type-checker); a file with only a bare array yields no roots.
</verify>

<done>
`parseRoutes(project, {root})` returns the full route forest with lazy modules stitched, so UI-access-path (Plan 7) can walk component chains to real URLs. Cross-file resolution is checker-free.
</done>

---

## Self-Review (Plan 3)

- **Spec coverage:** SAC-03 (order-preserving tree, full paths, lazy recovery, guards, outlet, pathMatch), restricted array detection (drops POC over-broad fallback), lazy forChild stitching (RESEARCH §4). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `RouteNode` fields (fullPath/component/redirectTo/loadChildren/loadComponent/outlet/pathMatch/guards/children) match `types.ts` exactly; `LazyTarget` {importPath,symbol}; `parseRouteArray(arr, basePath)` signature shared by T6+T7; stitching uses `resolveImportFile` (Plan 1). NodeNext `.js` imports. ✓
- **Known limitation:** a dynamic/non-literal `loadChildren` import path yields `loadChildren: null` (no stitch) — Phase 1 records statically-resolvable lazy only (RouteNode has no `unresolvedLazy` field in the committed contract); acceptable, noted for the UI-access-path certainty work. ✓
- **Verify bounds:** both tasks <60s. ✓
