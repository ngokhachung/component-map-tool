# Phase 1 — Plan 2: Indexer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Index every Angular component in a codebase into `ComponentRecord[]` — selector, className, filePath, template kind, inputs/outputs — with **version-aware, NgModule-membership-cross-checked** `standalone` resolution (STND-01), so Angular ≤18 components are not mis-labelled standalone.

**Architecture:** Two tasks. T4 extracts per-class metadata (pure AST, including the *raw* `standalone` signal). T5 builds the NgModule declarations map + Angular-version default, then resolves the final `standalone` and orchestrates `indexComponents()` → `ComponentRecord[]`. Builds on Plan 1's `createProject`/`addSources`. No type-checker calls.

**Tech Stack:** ts-morph (AST), Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "indexComponents(project, {root}) returns one ComponentRecord per @Component class with correct selector/className/filePath/templateKind/inputs/outputs."
    - "A component with no explicit `standalone` that IS declared in an @NgModule resolves to standalone:false; one explicitly `standalone:true` resolves true; with no module and Angular<19 default, false."
    - "buildModuleMap maps declared component class names to their NgModule — including declarations written as a spread of a local const array (the POC gap)."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/indexer/component.ts — extractComponentMeta(cls, filePath) -> ComponentMeta | null (+ io classification)"
    - "tool/src/indexer/version.ts — angularMajorFromPkg / detectAngularMajor / standaloneDefault"
    - "tool/src/indexer/module-map.ts — buildModuleMap(project) (identifier + spread-of-const)"
    - "tool/src/indexer/index.ts — resolveStandalone + indexComponents(project, {root}) -> ComponentRecord[]"
    - "tests for each"
  required_wiring:
    - "Edge builder (Plan 4) consumes ComponentRecord[] (selector registry); Graph (Plan 5) turns records into ComponentNode."
    - "indexComponents uses createProject/addSources from Plan 1 (caller wires the Project)."
  key_links:
    - "STND-01 standalone resolution -> explicit ?? (module!=null ? false : versionDefault) (RESEARCH, real-sample v15: all false)"
    - "NgModule membership via declarations incl. spread -> buildModuleMap (POC gap fix, QA)"
    - "filePath field present on every record (QA S1 carry-forward)"
```

---

## File Structure

- `tool/src/indexer/component.ts` — single-class metadata extraction + I/O classification (decorator + signal).
- `tool/src/indexer/version.ts` — Angular version detection + standalone default.
- `tool/src/indexer/module-map.ts` — NgModule `declarations` → `className → module` map.
- `tool/src/indexer/index.ts` — `resolveStandalone` + `indexComponents` orchestrator (ties the above into `ComponentRecord[]`).
- Tests alongside each (`*.test.ts`).

---

## Wave 2

### Task 4: Component metadata extractor

<model>opus</model>

<read_first>
- `tool/src/types.ts` (ComponentRecord, IoPort, IoKind)
- `poc/spikes/spike-component.ts` (the proven recipe: decorator arg reading + classifyIo for decorator & signal I/O) — port, don't reinvent
- `docs/specs/2026-05-30-phase1-static-analysis-core-design.md` §6
</read_first>

**Files:**
- Create: `tool/src/indexer/component.ts`
- Test: `tool/src/indexer/component.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/indexer/component.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { extractComponentMeta } from './component.js';

function firstClass(src: string) {
  const p = new Project({ useInMemoryFileSystem: true });
  const sf = p.createSourceFile('/c.ts', src);
  return sf.getClasses()[0];
}

describe('extractComponentMeta', () => {
  it('returns null for a class without @Component', () => {
    expect(extractComponentMeta(firstClass('export class Plain {}'), 'c.ts')).toBeNull();
  });

  it('extracts selector, templateKind, filePath and decorator I/O', () => {
    const cls = firstClass(`
      import { Component, Input, Output, EventEmitter } from '@angular/core';
      @Component({ selector: 'app-foo', templateUrl: './foo.html' })
      export class FooComponent {
        @Input() value = 0;
        @Input('aliasName') internal = '';
        @Output() changed = new EventEmitter<string>();
      }`);
    const m = extractComponentMeta(cls, 'src/foo.component.ts')!;
    expect(m.className).toBe('FooComponent');
    expect(m.selector).toBe('app-foo');
    expect(m.filePath).toBe('src/foo.component.ts');
    expect(m.templateKind).toBe('templateUrl');
    expect(m.standaloneExplicit).toBeNull();
    expect(m.inputs).toEqual([
      { name: 'value', alias: null, kind: 'decorator', required: false },
      { name: 'internal', alias: 'aliasName', kind: 'decorator', required: false },
    ]);
    expect(m.outputs).toEqual([{ name: 'changed', alias: null, kind: 'decorator', required: false }]);
  });

  it('reads explicit standalone + inline template + signal I/O', () => {
    const cls = firstClass(`
      import { Component, input, output, model } from '@angular/core';
      @Component({ selector: 'app-bar', standalone: true, template: '<div></div>' })
      export class BarComponent {
        name = input.required<string>();
        size = input<number>(0, { alias: 'sz' });
        changed = output<void>();
        value = model<string>('');
      }`);
    const m = extractComponentMeta(cls, 'bar.ts')!;
    expect(m.standaloneExplicit).toBe(true);
    expect(m.templateKind).toBe('inline');
    expect(m.inputs).toEqual([
      { name: 'name', alias: null, kind: 'signal', required: true },
      { name: 'size', alias: 'sz', kind: 'signal', required: false },
      { name: 'value', alias: null, kind: 'signal', required: false }, // model() is input+output
    ]);
    expect(m.outputs).toEqual([
      { name: 'changed', alias: null, kind: 'signal', required: false },
      { name: 'value', alias: null, kind: 'signal', required: false },
    ]);
  });

  it('captures explicit standalone:false', () => {
    const cls = firstClass(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-x', standalone: false, template: '' })
      export class XComponent {}`);
    expect(extractComponentMeta(cls, 'x.ts')!.standaloneExplicit).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it FAILS**

Run: `cd tool && npx vitest run src/indexer/component.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tool/src/indexer/component.ts`**

```ts
import { ClassDeclaration, ObjectLiteralExpression, SyntaxKind, Node } from 'ts-morph';
import type { IoPort } from '../types.js';

export interface ComponentMeta {
  className: string;
  selector: string | null;
  filePath: string;
  templateKind: 'inline' | 'templateUrl' | 'none';
  inputs: IoPort[];
  outputs: IoPort[];
  standaloneExplicit: boolean | null; // explicit `standalone:` literal, or null when omitted
}

function decoratorArg(cls: ClassDeclaration): ObjectLiteralExpression | null {
  const arg = cls.getDecorator('Component')?.getArguments()[0];
  return arg && Node.isObjectLiteralExpression(arg) ? arg : null;
}

function stringProp(obj: ObjectLiteralExpression, name: string): string | null {
  const init = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  return init && Node.isStringLiteral(init) ? init.getLiteralValue() : null;
}

function boolProp(obj: ObjectLiteralExpression, name: string): boolean | null {
  const init = obj.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (!init) return null;
  if (init.getKind() === SyntaxKind.TrueKeyword) return true;
  if (init.getKind() === SyntaxKind.FalseKeyword) return false;
  return null;
}

// Classify one class property as input/output/both/none, decorator- or signal-based.
function classifyIo(prop: Node): { dir: 'in' | 'out' | 'both' | null; port: Omit<IoPort, 'name'>; name: string } | null {
  if (!Node.isPropertyDeclaration(prop)) return null;
  const name = prop.getName();
  const inDec = prop.getDecorator('Input');
  const outDec = prop.getDecorator('Output');
  if (inDec || outDec) {
    const aliasArg = (inDec ?? outDec)?.getArguments()[0];
    const alias = aliasArg && Node.isStringLiteral(aliasArg) ? aliasArg.getLiteralValue() : null;
    return { dir: inDec ? 'in' : 'out', name, port: { alias, kind: 'decorator', required: false } };
  }
  const init = prop.getInitializer();
  if (init && Node.isCallExpression(init)) {
    const callee = init.getExpression().getText();
    const optsObj = init.getArguments().find(Node.isObjectLiteralExpression);
    const alias = optsObj ? stringProp(optsObj, 'alias') : null;
    if (callee === 'input' || callee === 'input.required')
      return { dir: 'in', name, port: { alias, kind: 'signal', required: callee.endsWith('required') } };
    if (callee === 'output')
      return { dir: 'out', name, port: { alias, kind: 'signal', required: false } };
    if (callee === 'model' || callee === 'model.required')
      return { dir: 'both', name, port: { alias, kind: 'signal', required: callee.endsWith('required') } };
  }
  return null;
}

export function extractComponentMeta(cls: ClassDeclaration, filePath: string): ComponentMeta | null {
  const obj = decoratorArg(cls);
  if (!obj) return null;
  const inputs: IoPort[] = [];
  const outputs: IoPort[] = [];
  for (const prop of cls.getProperties()) {
    const io = classifyIo(prop);
    if (!io) continue;
    if (io.dir === 'in' || io.dir === 'both') inputs.push({ name: io.name, ...io.port });
    if (io.dir === 'out' || io.dir === 'both') outputs.push({ name: io.name, ...io.port });
  }
  return {
    className: cls.getName() ?? '<anon>',
    selector: stringProp(obj, 'selector'),
    filePath,
    templateKind: obj.getProperty('template') ? 'inline' : obj.getProperty('templateUrl') ? 'templateUrl' : 'none',
    inputs,
    outputs,
    standaloneExplicit: boolProp(obj, 'standalone'),
  };
}
```

- [ ] **Step 4: Run test, verify it PASSES** (4 tests)

Run: `cd tool && npx vitest run src/indexer/component.test.ts`

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/indexer/component.ts src/indexer/component.test.ts
git commit -m "feat(tool): component metadata extractor (selector/io/templateKind/standalone-explicit)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/indexer/component.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS; tsc clean. Covers: no-@Component → null; decorator I/O with alias; signal I/O (`input.required`/`input`+alias/`output`/`model` → both lists); explicit `standalone` true AND false captured; `filePath` echoed.
</verify>

<done>
`extractComponentMeta` returns full per-class metadata with the *raw* `standaloneExplicit` (resolution happens in T5). I/O classification handles decorator + signal forms. Green + typechecked.
</done>

---

### Task 5: Standalone resolver + version detect + NgModule map + orchestrator

<model>opus</model>

<read_first>
- `tool/src/indexer/component.ts` (ComponentMeta, from T4)
- `tool/src/types.ts` (ComponentRecord)
- `poc/spikes/spike-component.ts` `buildModuleMap` (recipe) — extend it to flatten spread elements (POC gap)
- `.planning/phase1-RESEARCH.md` §5 (membership is global), STND-01 note
</read_first>

**Files:**
- Create: `tool/src/indexer/version.ts`
- Test: `tool/src/indexer/version.test.ts`
- Create: `tool/src/indexer/module-map.ts`
- Test: `tool/src/indexer/module-map.test.ts`
- Create: `tool/src/indexer/index.ts`
- Test: `tool/src/indexer/index.test.ts`

<action>

- [ ] **Step 1: Write the failing test for version** — `tool/src/indexer/version.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { angularMajorFromPkg, standaloneDefault } from './version.js';

describe('angularMajorFromPkg', () => {
  it('reads the major from dependencies', () => {
    expect(angularMajorFromPkg({ dependencies: { '@angular/core': '15.2.9' } })).toBe(15);
  });
  it('handles range prefixes and devDependencies', () => {
    expect(angularMajorFromPkg({ devDependencies: { '@angular/core': '^17.0.0' } })).toBe(17);
  });
  it('returns null when @angular/core is absent', () => {
    expect(angularMajorFromPkg({ dependencies: { rxjs: '7.0.0' } })).toBeNull();
  });
});

describe('standaloneDefault', () => {
  it('is false for Angular <= 18 (NgModule-default era) and unknown', () => {
    expect(standaloneDefault(15)).toBe(false);
    expect(standaloneDefault(18)).toBe(false);
    expect(standaloneDefault(null)).toBe(false);
  });
  it('is true from Angular 19 (standalone became the default)', () => {
    expect(standaloneDefault(19)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/indexer/version.test.ts`

- [ ] **Step 3: Implement `tool/src/indexer/version.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface PkgLike { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; }

export function angularMajorFromPkg(pkg: PkgLike): number | null {
  const dep = pkg.dependencies?.['@angular/core'] ?? pkg.devDependencies?.['@angular/core'];
  if (!dep) return null;
  const m = String(dep).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function detectAngularMajor(root: string): number | null {
  const p = join(root, 'package.json');
  return existsSync(p) ? angularMajorFromPkg(JSON.parse(readFileSync(p, 'utf8')) as PkgLike) : null;
}

// Angular made `standalone: true` the DEFAULT in v19. <=18 (and unknown) default to NgModule (false).
export function standaloneDefault(major: number | null): boolean {
  return major != null && major >= 19;
}
```

- [ ] **Step 4: Run, verify PASS** (5 tests).

- [ ] **Step 5: Write the failing test for module-map** — `tool/src/indexer/module-map.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { buildModuleMap } from './module-map.js';

function projectWith(src: string): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/m.ts', src);
  return p;
}

describe('buildModuleMap', () => {
  it('maps declared components (inline identifiers) to their NgModule', () => {
    const p = projectWith(`
      import { NgModule } from '@angular/core';
      class AComponent {} class BComponent {}
      @NgModule({ declarations: [AComponent, BComponent] })
      export class FeatureModule {}`);
    const map = buildModuleMap(p);
    expect(map.get('AComponent')).toBe('FeatureModule');
    expect(map.get('BComponent')).toBe('FeatureModule');
  });

  it('flattens a spread of a local const array (the POC gap)', () => {
    const p = projectWith(`
      import { NgModule } from '@angular/core';
      class CComponent {}
      const SHARED = [CComponent];
      @NgModule({ declarations: [...SHARED] })
      export class SharedModule {}`);
    expect(buildModuleMap(p).get('CComponent')).toBe('SharedModule');
  });

  it('ignores classes not in any declarations array', () => {
    const p = projectWith(`class Lonely {}`);
    expect(buildModuleMap(p).get('Lonely')).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run, verify FAIL.** `cd tool && npx vitest run src/indexer/module-map.test.ts`

- [ ] **Step 7: Implement `tool/src/indexer/module-map.ts`**

```ts
import { Project, SourceFile, ArrayLiteralExpression, Node, SyntaxKind } from 'ts-morph';

// Collect declared class names from a declarations array, flattening `...LOCAL_CONST` spreads.
function flatten(arr: ArrayLiteralExpression, sf: SourceFile): string[] {
  const out: string[] = [];
  for (const el of arr.getElements()) {
    if (Node.isSpreadElement(el)) {
      const expr = el.getExpression();
      if (Node.isIdentifier(expr)) {
        const init = sf.getVariableDeclaration(expr.getText())?.getInitializer();
        if (init && Node.isArrayLiteralExpression(init)) out.push(...flatten(init, sf));
      }
    } else if (Node.isIdentifier(el)) {
      out.push(el.getText());
    }
  }
  return out;
}

// className -> declaring NgModule name, for every component listed in an @NgModule declarations array.
export function buildModuleMap(project: Project): Map<string, string> {
  const map = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      const arg = cls.getDecorator('NgModule')?.getArguments()[0];
      if (!arg || !Node.isObjectLiteralExpression(arg)) continue;
      const decls = arg.getProperty('declarations')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
      if (!decls || !Node.isArrayLiteralExpression(decls)) continue;
      const moduleName = cls.getName() ?? '<anon>';
      for (const name of flatten(decls, sf)) map.set(name, moduleName);
    }
  }
  return map;
}
```

- [ ] **Step 8: Run, verify PASS** (3 tests).

- [ ] **Step 9: Write the failing test for the orchestrator** — `tool/src/indexer/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { resolveStandalone, indexComponents } from './index.js';

describe('resolveStandalone', () => {
  it('honors an explicit flag over everything', () => {
    expect(resolveStandalone(true, 'M', false)).toBe(true);
    expect(resolveStandalone(false, null, true)).toBe(false);
  });
  it('NgModule membership forces non-standalone when flag omitted', () => {
    expect(resolveStandalone(null, 'FeatureModule', true)).toBe(false);
  });
  it('falls back to the version default when no flag and no module', () => {
    expect(resolveStandalone(null, null, true)).toBe(true);
    expect(resolveStandalone(null, null, false)).toBe(false);
  });
});

describe('indexComponents', () => {
  it('produces records with resolved standalone (v15-like repo: no package.json => default false)', () => {
    const p = new Project({ useInMemoryFileSystem: true });
    p.createSourceFile('/src/feat.ts', `
      import { Component, NgModule } from '@angular/core';
      @Component({ selector: 'app-a', template: '' }) export class AComponent {}
      @Component({ selector: 'app-b', standalone: true, template: '' }) export class BComponent {}
      @NgModule({ declarations: [AComponent] }) export class FeatureModule {}`);
    const recs = indexComponents(p, { root: '/src' });
    const a = recs.find((r) => r.className === 'AComponent')!;
    const b = recs.find((r) => r.className === 'BComponent')!;
    expect(a.module).toBe('FeatureModule');
    expect(a.standalone).toBe(false);          // omitted flag + in NgModule => false
    expect(a.filePath).toBe('feat.ts');        // repo-relative to root
    expect(b.module).toBeNull();
    expect(b.standalone).toBe(true);           // explicit true
    expect(recs).toHaveLength(2);
  });
});
```

- [ ] **Step 10: Run, verify FAIL.** `cd tool && npx vitest run src/indexer/index.test.ts`

- [ ] **Step 11: Implement `tool/src/indexer/index.ts`**

```ts
import { Project } from 'ts-morph';
import { posix } from 'node:path';
import type { ComponentRecord } from '../types.js';
import { extractComponentMeta } from './component.js';
import { buildModuleMap } from './module-map.js';
import { detectAngularMajor, standaloneDefault } from './version.js';

// explicit flag wins; else NgModule membership => not standalone; else the Angular-version default.
export function resolveStandalone(explicit: boolean | null, module: string | null, versionDefault: boolean): boolean {
  if (explicit !== null) return explicit;
  if (module !== null) return false;
  return versionDefault;
}

function toRepoRelative(filePath: string, root: string): string {
  return posix.relative(root.replace(/\\/g, '/'), filePath.replace(/\\/g, '/'));
}

export function indexComponents(project: Project, opts: { root: string }): ComponentRecord[] {
  const moduleMap = buildModuleMap(project);
  const versionDefault = standaloneDefault(detectAngularMajor(opts.root));
  const records: ComponentRecord[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = toRepoRelative(sf.getFilePath(), opts.root);
    for (const cls of sf.getClasses()) {
      const meta = extractComponentMeta(cls, filePath);
      if (!meta) continue;
      const module = moduleMap.get(meta.className) ?? null;
      records.push({
        className: meta.className,
        selector: meta.selector,
        filePath: meta.filePath,
        standalone: resolveStandalone(meta.standaloneExplicit, module, versionDefault),
        module,
        templateKind: meta.templateKind,
        inputs: meta.inputs,
        outputs: meta.outputs,
      });
    }
  }
  return records;
}
```

- [ ] **Step 12: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 13: Commit**

```bash
cd tool && git add src/indexer/version.ts src/indexer/version.test.ts src/indexer/module-map.ts src/indexer/module-map.test.ts src/indexer/index.ts src/indexer/index.test.ts
git commit -m "feat(tool): version-aware standalone resolver + NgModule map + indexComponents (STND-01)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. Critically: `indexComponents` resolves an NgModule-declared, flag-omitted component to `standalone:false` (the v15 correctness fix — STND-01), an explicit `standalone:true` to true, and `buildModuleMap` flattens a `...SHARED` spread.
</verify>

<done>
`indexComponents(project, {root})` yields `ComponentRecord[]` with correct selectors, I/O, filePaths, NgModule membership, and **version-aware standalone** resolution. On a v15 repo every NgModule component resolves to `standalone:false`. The selector registry for the edge builder (Plan 4) is now derivable from these records.
</done>

---

## Self-Review (Plan 2)

- **Spec coverage:** SAC-01 (component metadata incl. filePath), STND-01 (version-aware + membership resolution), NgModule map with spread (POC/QA gap), decorator + signal I/O. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `ComponentMeta` (T4 intermediate, has `standaloneExplicit`) vs `ComponentRecord` (final, has resolved `standalone` + `module`, from `types.ts`); `indexComponents` maps one to the other. Signal `model()` correctly emits into BOTH inputs and outputs. `IoPort` shape matches `types.ts`. NodeNext `.js` imports. ✓
- **Standalone cutoff:** implemented as `major >= 19` (v19 flipped the default) — this supersedes the spec §9 shorthand "< 17 ⇒ false"; result for the v15 target is identical (false). Flagged so QA doesn't treat it as drift. ✓
- **Verify bounds:** both tasks verify <60s. ✓
