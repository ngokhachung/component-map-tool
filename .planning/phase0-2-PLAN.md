# Phase 0 POC — Plan 2: TS-Morph Spikes (Component + Routing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development (recommended) or happypowerprocess:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove `ts-morph` can extract Angular 19 component metadata (POC-01) and routing config (POC-02) correctly from synthetic fixtures, scored through the shared harness.

**Architecture:** Two independent spikes (`spike-component.ts`, `spike-routing.ts`), each reading its own `fixtures/<task>/` tree where every fixture `.ts` is paired with an `expected.json`. Each spike emits per-fixture `CaseResult[]` via the harness and prints a `TaskReport`. Zero file overlap between the two tasks → same wave.

**Tech Stack:** `ts-morph` 24.x, TypeScript ESM, `tsx`. Depends on Plan 1 (`poc/types.ts`, `poc/harness/`).

---

```yaml
must_haves:
  observable_truths:
    - "`npm run spike:component` prints a component TaskReport with passed == total for the clean fixtures and correctly extracts signal vs decorator I/O on the mixed fixture."
    - "`npm run spike:routing` prints a routing TaskReport that recovers lazy import path+symbol and flags the deliberately-unresolvable lazy route."
    - "Component spike produces correct records for >=5 NgModule-based AND >=5 standalone components."
  required_artifacts:
    - "poc/spikes/spike-component.ts + poc/fixtures/component/*.component.ts + matching *.expected.json (>=10; >=5 NgModule AND >=5 standalone)"
    - "poc/spikes/spike-routing.ts + poc/fixtures/routing/*.ts + matching *.expected.json (>=5)"
    - "(poc/spikes/lib/load-fixtures.ts is created in Plan 1; both spikes only import it)"
  required_wiring:
    - "Both spikes import ComponentRecord/RouteRecord from poc/types.ts and scoreCase/scoreTask from poc/harness/report.ts."
    - "Each spike writes <fixture>.actual.json next to the fixture and returns a TaskReport (consumed by Plan 3 report-all)."
  key_links:
    - "ts-morph on-disk Project with skipFileDependencyResolution -> avoids pulling node_modules (research P-TM1)"
    - "signal input()/output()/model() detection -> initializer CallExpression callee text (research P-TM4)"
    - "standalone defaults true in v19 -> absent `standalone:false` => standalone:true"
```

---

## File Structure

- `poc/spikes/lib/load-fixtures.ts` — **created in Plan 1**; loads a fixture dir, pairs each source file with its `.expected.json`. Imported (read-only) by both spikes here.
- `poc/spikes/spike-component.ts` — component metadata extractor + scorer.
- `poc/spikes/spike-routing.ts` — routing extractor + scorer.
- `poc/fixtures/component/` — `.component.ts` + `.expected.json` pairs.
- `poc/fixtures/routing/` — `.ts` route configs + `.expected.json` pairs.

---

## Wave 3

### Task 3: Component metadata spike + fixtures (POC-01)

<model>sonnet</model>

<read_first>
- `poc/types.ts` (`ComponentRecord`, `IoPort`)
- `poc/harness/report.ts` (`scoreCase`, `scoreTask`)
- `poc/spikes/lib/load-fixtures.ts` (created in Plan 1 — `loadFixtures`)
- `.planning/phase0-RESEARCH.md` — ts-morph component extraction recipe + P-TM3/P-TM4
</read_first>

**Files:**
- Create: `poc/spikes/spike-component.ts`
- Create: `poc/fixtures/component/*.component.ts` (≥10; ≥5 NgModule AND ≥5 standalone) + `*.expected.json`
- Read-only: `poc/spikes/lib/load-fixtures.ts` (from Plan 1)

<action>

- [ ] **Step 1: Confirm the shared loader exists** — `poc/spikes/lib/load-fixtures.ts` was created in Plan 1 Task 1. Do not recreate it; this spike imports `loadFixtures` from it. If it is missing, Plan 1 was not completed — stop and finish Plan 1 first.

- [ ] **Step 2: Implement the component extractor + scorer** — `poc/spikes/spike-component.ts`

```ts
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  Project, ClassDeclaration, ObjectLiteralExpression, SyntaxKind, Node,
} from 'ts-morph';
import type { ComponentRecord, IoPort, TaskReport } from '../types.js';
import { scoreCase, scoreTask } from '../harness/report.js';
import { loadFixtures } from './lib/load-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'component');

function getComponentDecoratorArg(cls: ClassDeclaration): ObjectLiteralExpression | null {
  const dec = cls.getDecorator('Component');
  const arg = dec?.getArguments()[0];
  return arg && Node.isObjectLiteralExpression(arg) ? arg : null;
}

function readStringProp(obj: ObjectLiteralExpression, name: string): string | null {
  const p = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment);
  const init = p?.getInitializer();
  return init && Node.isStringLiteral(init) ? init.getLiteralValue() : null;
}

function readBoolProp(obj: ObjectLiteralExpression, name: string): boolean | null {
  const p = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment);
  const init = p?.getInitializer();
  if (!init) return null;
  if (init.getKind() === SyntaxKind.TrueKeyword) return true;
  if (init.getKind() === SyntaxKind.FalseKeyword) return false;
  return null;
}

// Classify a property as input/output via decorator OR signal initializer (research P-TM4).
function classifyIo(prop: Node): { dir: 'in' | 'out' | 'both' | null; port: Omit<IoPort, 'name'> | null; name: string } | null {
  if (!Node.isPropertyDeclaration(prop)) return null;
  const name = prop.getName();
  const inDec = prop.getDecorator('Input');
  const outDec = prop.getDecorator('Output');
  if (inDec || outDec) {
    const alias = (inDec ?? outDec)?.getArguments()[0];
    const aliasVal = alias && Node.isStringLiteral(alias) ? alias.getLiteralValue() : null;
    return { dir: inDec ? 'in' : 'out', name, port: { alias: aliasVal, kind: 'decorator', required: false } };
  }
  const init = prop.getInitializer();
  if (init && Node.isCallExpression(init)) {
    const callee = init.getExpression().getText(); // 'input' | 'input.required' | 'output' | 'model' | 'model.required'
    const aliasArgObj = init.getArguments().find(Node.isObjectLiteralExpression);
    const aliasVal = aliasArgObj ? readStringProp(aliasArgObj, 'alias') : null;
    if (callee === 'input' || callee === 'input.required')
      return { dir: 'in', name, port: { alias: aliasVal, kind: 'signal', required: callee.endsWith('required') } };
    if (callee === 'output')
      return { dir: 'out', name, port: { alias: aliasVal, kind: 'signal', required: false } };
    if (callee === 'model' || callee === 'model.required')
      return { dir: 'both', name, port: { alias: aliasVal, kind: 'signal', required: callee.endsWith('required') } };
  }
  return null;
}

function buildModuleMap(project: Project): Map<string, string> {
  const map = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      const modDec = cls.getDecorator('NgModule');
      const arg = modDec?.getArguments()[0];
      if (arg && Node.isObjectLiteralExpression(arg)) {
        const decls = arg.getProperty('declarations')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
        if (decls && Node.isArrayLiteralExpression(decls)) {
          for (const el of decls.getElements()) map.set(el.getText(), cls.getName() ?? '<anon>');
        }
      }
    }
  }
  return map;
}

export function extractComponent(cls: ClassDeclaration, moduleMap: Map<string, string>): ComponentRecord | null {
  const obj = getComponentDecoratorArg(cls);
  if (!obj) return null;
  const className = cls.getName() ?? '<anon>';
  const standaloneExplicit = readBoolProp(obj, 'standalone');
  const inputs: IoPort[] = [];
  const outputs: IoPort[] = [];
  for (const prop of cls.getProperties()) {
    const io = classifyIo(prop);
    if (!io || !io.port) continue;
    if (io.dir === 'in' || io.dir === 'both') inputs.push({ name: io.name, ...io.port });
    if (io.dir === 'out' || io.dir === 'both') outputs.push({ name: io.name, ...io.port });
  }
  return {
    className,
    selector: readStringProp(obj, 'selector'),
    standalone: standaloneExplicit === null ? true : standaloneExplicit, // v19 default true
    templateKind: obj.getProperty('template') ? 'inline' : obj.getProperty('templateUrl') ? 'templateUrl' : 'none',
    inputs,
    outputs,
    module: moduleMap.get(className) ?? null,
  };
}

function main(): TaskReport {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false, strict: false },
  });
  project.addSourceFilesAtPaths(join(FIXTURES, '*.component.ts'));
  const moduleMap = buildModuleMap(project);

  const fixtures = loadFixtures<ComponentRecord>(FIXTURES, '.component.ts');
  let standalonePassed = 0;
  let ngModulePassed = 0;
  const cases = fixtures.map((fx) => {
    const sf = project.getSourceFileOrThrow(fx.sourcePath);
    // each fixture file declares exactly one @Component
    const cls = sf.getClasses().find((c) => c.getDecorator('Component'));
    const actual = cls ? extractComponent(cls, moduleMap) : null;
    writeFileSync(`${fx.sourcePath}.actual.json`, JSON.stringify(actual, null, 2));
    const result = scoreCase(fx.name, actual, fx.expected);
    // count passes by EXPECTED type so the report can apply the spec §5 component gate
    if (result.pass) (fx.expected.standalone ? standalonePassed++ : ngModulePassed++);
    return result;
  });

  const report = scoreTask('component', cases);
  report.meta = { standalonePassed, ngModulePassed };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// Run when invoked directly.
if (process.argv[1] && process.argv[1].endsWith('spike-component.ts')) main();
export { main as runComponentSpike };
```

- [ ] **Step 3: Author fixture exemplar — standalone with signal inputs** — `poc/fixtures/component/user-card.component.ts`

```ts
import { Component, input, output, model } from '@angular/core';

@Component({
  selector: 'app-user-card',
  standalone: true,
  template: `<div>{{ name() }}</div>`,
})
export class UserCardComponent {
  name = input.required<string>();
  avatarUrl = input<string>('');
  selected = model<boolean>(false);
  remove = output<void>();
}
```

`poc/fixtures/component/user-card.component.expected.json`:

```json
{
  "className": "UserCardComponent",
  "selector": "app-user-card",
  "standalone": true,
  "templateKind": "inline",
  "inputs": [
    { "name": "name", "alias": null, "kind": "signal", "required": true },
    { "name": "avatarUrl", "alias": null, "kind": "signal", "required": false },
    { "name": "selected", "alias": null, "kind": "signal", "required": false }
  ],
  "outputs": [
    { "name": "selected", "alias": null, "kind": "signal", "required": false },
    { "name": "remove", "alias": null, "kind": "signal", "required": false }
  ],
  "module": null
}
```

- [ ] **Step 4: Author fixture exemplar — NgModule-based with decorator + aliased output (messy/mixed)** — `poc/fixtures/component/legacy-widget.component.ts`

```ts
import { Component, Input, Output, EventEmitter, input } from '@angular/core';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-legacy-widget',
  standalone: false,
  templateUrl: './legacy-widget.component.html',
})
export class LegacyWidgetComponent {
  @Input() title = '';
  @Input('data-id') dataId = 0;     // aliased decorator input
  @Output('save') onSave = new EventEmitter<void>();  // aliased decorator output
  count = input<number>(0);          // mixed: signal input in a non-standalone component
}

@NgModule({ declarations: [LegacyWidgetComponent] })
export class LegacyModule {}
```

`poc/fixtures/component/legacy-widget.component.expected.json`:

```json
{
  "className": "LegacyWidgetComponent",
  "selector": "app-legacy-widget",
  "standalone": false,
  "templateKind": "templateUrl",
  "inputs": [
    { "name": "title", "alias": null, "kind": "decorator", "required": false },
    { "name": "dataId", "alias": "data-id", "kind": "decorator", "required": false },
    { "name": "count", "alias": null, "kind": "signal", "required": false }
  ],
  "outputs": [
    { "name": "onSave", "alias": "save", "kind": "decorator", "required": false }
  ],
  "module": "LegacyModule"
}
```

- [ ] **Step 5: Author the remaining ≥9 fixtures per this table** (each `<name>.component.ts` + `<name>.expected.json`, one `@Component` per file). **Hard count requirement (POC-01): the full set must contain ≥5 standalone AND ≥5 NgModule-based components including the two exemplars.** With the table below the totals are **6 standalone + 5 NgModule = 11**.

| File | Type | Distinguishing features | Expected highlights |
|---|---|---|---|
| `nav-bar.component.ts` | standalone | `standalone:true`, two `@Input()` decorators, one `@Output()` | standalone:true, 2 decorator inputs, 1 decorator output, module:null |
| `icon-button.component.ts` | standalone | `standalone` omitted entirely (v19 default) | standalone:true (default), records I/O present, module:null |
| `data-table.component.ts` | standalone | `input.required()` + `output()` + `model()` | required:true on the required input; model appears in both arrays |
| `search-box.component.ts` | standalone | aliased signal `input('q', ...)` form via `{alias:'q'}` | alias:"q" on that input |
| `chart.component.ts` | standalone | inline `template`, `model.required()` | required:true model in both arrays |
| `tab-panel.component.ts` | NgModule | `standalone:false`, declared in a module with 2 declarations | module set to the module class name |
| `accordion.component.ts` | NgModule | `standalone:false`, `templateUrl`, decorator inputs only | templateKind:"templateUrl" |
| `tooltip.component.ts` | NgModule | `standalone:false`, no inputs/outputs | empty inputs/outputs arrays |
| `breadcrumb.component.ts` | NgModule | `standalone:false`, one `@Input()` decorator, declared in a module | module set; 1 decorator input |

(Standalone: user-card[exemplar], nav-bar, icon-button, data-table, search-box, chart = 6. NgModule: legacy-widget[exemplar], tab-panel, accordion, tooltip, breadcrumb = 5.) Remember v19: an NgModule-declared component must set `standalone: false` explicitly (default is true).

For each: write the minimal Angular 19 component matching the features, then hand-author its `expected.json` exactly per the `ComponentRecord` shape (mirror the two exemplars). Ground-truth is authored by reading the component, not by running the spike (research P-M1 — do NOT copy `.actual.json` into `expected.json`).

</action>

<verify>
Run (Nyquist: <60s): `cd poc && npm run spike:component`
Expected: printed `TaskReport` JSON with `task:"component"`, `total >= 11`, `passed == total`, and `meta` showing `standalonePassed >= 5` AND `ngModulePassed >= 5` (the spec §5 component gate). If any case fails, the `cases[]` entry names the fixture and says `mismatch`; inspect the written `<fixture>.actual.json` vs `expected.json` to see the diff.
</verify>

<done>
`spike:component` reports correct `ComponentRecord` extraction (passed == total) for ≥5 NgModule-based and ≥5 standalone Angular 19 components, including correct signal-vs-decorator I/O classification, aliasing, `model()` two-way handling, and NgModule membership. POC-01 demonstrated.
</done>

- [ ] **Step 6: Commit**

```bash
cd poc && git add spikes/spike-component.ts fixtures/component/
git commit -m "feat(poc): component metadata spike + fixtures (POC-01)"
```

---

### Task 4: Routing spike + fixtures (POC-02)

<model>sonnet</model>

<read_first>
- `poc/types.ts` (`RouteRecord`, `LazyTarget`)
- `poc/harness/report.ts` (`scoreCase`, `scoreTask`)
- `poc/spikes/lib/load-fixtures.ts` (created in Plan 1)
- `.planning/phase0-RESEARCH.md` — ts-morph routing recipe + P-TM5 (lazy import recovery; flag unresolvable)
</read_first>

**Files:**
- Create: `poc/spikes/spike-routing.ts`
- Create: `poc/fixtures/routing/*.ts` (≥5) + `*.expected.json`

<action>

- [ ] **Step 1: Implement the routing extractor + scorer** — `poc/spikes/spike-routing.ts`

```ts
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

// Recover { importPath, symbol } from `() => import('./x').then(m => m.Y)`.
// Returns { lazy, unresolved }: unresolved=true when a load* arrow exists but the
// import specifier is not a string literal (research P-TM5).
function recoverLazy(init: Node | undefined): { lazy: LazyTarget | null; unresolved: boolean } {
  if (!init || !(Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return { lazy: null, unresolved: false };
  // find the dynamic import() call among descendants
  const importCall = init.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getKind() === SyntaxKind.ImportKeyword);
  if (!importCall) return { lazy: null, unresolved: true };
  const specArg = importCall.getArguments()[0];
  if (!specArg || !Node.isStringLiteral(specArg)) return { lazy: null, unresolved: true }; // dynamic/template specifier
  const importPath = specArg.getLiteralValue();
  // member name from `.then(m => m.Symbol)`
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

// Find the routes array: provideRouter(<arr>), RouterModule.forRoot/forChild(<arr>),
// resolving an identifier arg back to its `const routes = [...]`.
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
  // fallback: a top-level `const routes: Routes = [...]`
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
export { main as runRoutingSpike };
```

Note: the loader's `.expected.json` filter must not collide with `.ts` sources; `loadFixtures(FIXTURES, '.ts')` already filters `!f.endsWith('.expected.json')`. Keep fixture sources named `*.ts` (not `*.expected.json`).

- [ ] **Step 2: Author fixture exemplar — lazy module + lazy standalone + guard** — `poc/fixtures/routing/app.routes.ts`

```ts
import { Routes } from '@angular/router';
import { HomeComponent } from './home.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'admin', loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule), canActivate: [authGuard] },
  { path: 'profile', loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent) },
  { path: 'legacy', redirectTo: '', pathMatch: 'full' },
];
```

`poc/fixtures/routing/app.routes.expected.json`:

```json
[
  { "path": "", "component": "HomeComponent", "redirectTo": null, "loadChildren": null, "loadComponent": null, "guards": [], "children": [], "unresolvedLazy": false },
  { "path": "admin", "component": null, "redirectTo": null, "loadChildren": { "importPath": "./admin/admin.module", "symbol": "AdminModule" }, "loadComponent": null, "guards": ["authGuard"], "children": [], "unresolvedLazy": false },
  { "path": "profile", "component": null, "redirectTo": null, "loadChildren": null, "loadComponent": { "importPath": "./profile/profile.component", "symbol": "ProfileComponent" }, "guards": [], "children": [], "unresolvedLazy": false },
  { "path": "legacy", "component": null, "redirectTo": "", "loadChildren": null, "loadComponent": null, "guards": [], "children": [], "unresolvedLazy": false }
]
```

- [ ] **Step 3: Author fixture exemplar — deliberately-unresolvable lazy route (messy)** — `poc/fixtures/routing/dynamic.routes.ts`

```ts
import { Routes } from '@angular/router';

const featurePath = './features/' + 'reports';
export const routes: Routes = [
  // import specifier is a computed expression, not a string literal -> unresolvable
  { path: 'reports', loadComponent: () => import(/* @vite-ignore */ featurePath).then((m: any) => m.ReportsComponent) },
];
```

`poc/fixtures/routing/dynamic.routes.expected.json`:

```json
[
  { "path": "reports", "component": null, "redirectTo": null, "loadChildren": null, "loadComponent": null, "guards": [], "children": [], "unresolvedLazy": true }
]
```

- [ ] **Step 4: Author the remaining ≥3 routing fixtures per this table** (≥5 total incl. the two exemplars)

| File | Distinguishing features | Expected highlights |
|---|---|---|
| `feature.routes.ts` | `provideRouter([...])` inline array with 2 plain component routes | both routes component set, no lazy |
| `nested.routes.ts` | parent route with `children: [...]` (2 child routes, one lazy) | `children[]` populated; nested lazy recovered |
| `module-routing.module.ts` | `RouterModule.forChild(routes)` where `routes` is a separate `const` | identifier arg resolved back to the const array |

Hand-author each `expected.json` per the `RouteRecord[]` shape by reading the route config (not from `.actual.json`).

</action>

<verify>
Run (Nyquist: <60s): `cd poc && npm run spike:routing`
Expected: printed `TaskReport` with `task:"routing"`, `total >= 5`, `passed == total`. Specifically: `app.routes` recovers both lazy targets (path+symbol) and the `authGuard` name; `dynamic.routes` yields `unresolvedLazy:true`; `nested.routes` recovers the child array. Inspect `<fixture>.actual.json` for any mismatch.
</verify>

<done>
`spike:routing` correctly extracts the route tree (path, component, lazy `loadChildren`/`loadComponent` literal path+symbol, children, guard names) for ≥5 configs including lazy routes, and flags the deliberately-unresolvable lazy route. POC-02 demonstrated.
</done>

- [ ] **Step 5: Commit**

```bash
cd poc && git add spikes/spike-routing.ts fixtures/routing/
git commit -m "feat(poc): routing spike + fixtures incl. unresolvable lazy (POC-02)"
```

---

## Self-Review (Plan 2)

- **Spec coverage:** POC-01 (component metadata, signal+decorator, standalone default, NgModule membership, **6 standalone + 5 NgModule = 11**, messy mixed fixture) ✓; POC-02 (route tree, lazy literal path+symbol, children, guards, unresolvable-lazy flag, ≥5 incl. lazy) ✓.
- **Placeholder scan:** Spike code complete; exemplar fixtures complete; remaining fixtures specified by exact feature + expected-field table (synthetic test data, authored to the documented `ComponentRecord`/`RouteRecord[]` shape — not a logic placeholder). ✓
- **Type consistency:** `ComponentRecord`/`IoPort`/`RouteRecord`/`LazyTarget` match `poc/types.ts`; both spikes use `scoreCase`/`scoreTask` and `loadFixtures`; `.js` ESM import extensions. `runComponentSpike`/`runRoutingSpike` exported for Plan 3's `report-all`. ✓
- **Wave/overlap:** `lib/load-fixtures.ts` now created in Plan 1 (foundation) → Tasks 3, 4 (and Plan 3 Task 5) only *read* it, no intra-wave creation dependency. Task 3 writes `fixtures/component/` + `spike-component.ts`; Task 4 writes `fixtures/routing/` + `spike-routing.ts`. Zero write overlap → both safely Wave 3. ✓
