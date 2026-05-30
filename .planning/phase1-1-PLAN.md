# Phase 1 — Plan 1: Foundation (Scaffold + Types + Shared Project) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development (recommended) or happypowerprocess:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `tool/` package (ESM TS, Node ≥20), define the shared data contracts (`Graph`/`ComponentNode`/`Edge`/`RouteNode`), and build the shared ts-morph `Project` factory + a **type-checker-free** cross-file resolver (export-index) that every later wave depends on.

**Architecture:** Approach A (pipeline → versioned graph + query layer). This foundation wave delivers nothing user-facing — it locks the contracts and the AST-only ts-morph access pattern so Waves 2–7 plug in without re-deciding them. The resolver replaces the POC's `getDefinitionNodes()` (a type-checker call) with manual module/import resolution to keep the whole analysis checker-free (RESEARCH §1).

**Tech Stack:** Node ≥20 + TypeScript (ESM/NodeNext), `tsx`, `vitest` (+ `@vitest/coverage-v8`), pinned `@angular/compiler@19.2.14`, `ts-morph@24.0.0`.

---

```yaml
must_haves:
  observable_truths:
    - "`cd tool && npm install && npx tsc --noEmit` succeeds — the scaffold compiles under strict NodeNext ESM."
    - "`cd tool && npm test` is green — unit tests for the shared types module and the Project/resolver pass."
    - "`resolveImportFile` resolves a relative specifier to its in-project SourceFile and returns null for bare specifiers; `getExportedDeclaration` finds an exported class AND an exported const, null otherwise — with NO type-checker call."
  required_artifacts:
    - "tool/package.json (ESM, bin-less for now, Node>=20, pinned deps), tool/tsconfig.json, tool/vitest.config.ts, tool/.gitignore"
    - "tool/src/types.ts — Graph/ComponentNode/Edge/RouteNode/IoPort/LazyTarget + SCHEMA_VERSION (the JSON contract for all waves)"
    - "tool/src/shared/project.ts — createProject(), addSources(), resolveImportFile(), getExportedDeclaration()"
    - "tool/src/types.test.ts, tool/src/shared/project.test.ts"
  required_wiring:
    - "Every later wave imports contracts from tool/src/types.js and the Project/resolver from tool/src/shared/project.js."
    - "Routes (Plan 3, T7) resolves imported route consts + lazy modules via resolveImportFile/getExportedDeclaration — NOT ts-morph getDefinitionNodes — keeping the analysis type-checker-free."
  key_links:
    - "AST-only ts-morph (no type-checker) -> createProject skip flags + manual resolver (RESEARCH §1)"
    - "versioned graph -> SCHEMA_VERSION const in types; mismatch => full rebuild (RESEARCH §8, SAC-04)"
    - "artifacts isolated -> .gitignore ignores .cmap/ + generated files (RESEARCH §8 leftover-file trap)"
```

---

## File Structure

- `tool/package.json` — ESM package, pinned deps, scripts (`test`, `test:cov`, `typecheck`).
- `tool/tsconfig.json` — strict NodeNext ESM, `noEmit` (run via `tsx`).
- `tool/vitest.config.ts` — node env, coverage (v8) thresholds wired (enforced in Plan 10).
- `tool/.gitignore` — `node_modules/`, `.cmap/`, `*.actual.*`, `dist/`.
- `tool/src/types.ts` — all shared interfaces + `SCHEMA_VERSION`. One responsibility: data contracts.
- `tool/src/shared/project.ts` — ts-morph Project factory + checker-free resolver. One responsibility: source access.
- `tool/src/types.test.ts`, `tool/src/shared/project.test.ts` — unit tests.

---

## Wave 1

### Task 1: Scaffold the `tool/` package

<model>sonnet</model>

<read_first>
- `docs/specs/2026-05-30-phase1-static-analysis-core-design.md` §5 (module layout), §11 (verify)
- `.planning/phase1-RESEARCH.md` §1, §8 (ts-morph flags, Node≥20 parseArgs, `.cmap/` artifacts)
- `poc/package.json` (pinned versions to carry forward)
</read_first>

**Files:**
- Create: `tool/package.json`
- Create: `tool/tsconfig.json`
- Create: `tool/vitest.config.ts`
- Create: `tool/.gitignore`

<action>

- [ ] **Step 1: Create `tool/package.json`**

```json
{
  "name": "component-map",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "description": "Angular component dependency-graph + UI access-path tool (Phase 1 — Static Analysis Core).",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:cov": "vitest run --coverage"
  },
  "dependencies": {
    "@angular/compiler": "19.2.14",
    "ts-morph": "24.0.0"
  },
  "devDependencies": {
    "@types/node": "22.19.19",
    "tsx": "4.19.2",
    "typescript": "5.6.3",
    "vitest": "2.1.8",
    "@vitest/coverage-v8": "2.1.8"
  }
}
```

Note: exact pins (no `^`). `@types/node` is REQUIRED because `tsconfig.json` sets `types: ["node"]` and the tool uses `node:path`/`node:fs`/`node:util` — without it `tsc --noEmit` fails TS2688. If `@angular/compiler@19.2.14` is unavailable, use the nearest published `19.2.x` and record the resolved version in the commit message.

- [ ] **Step 2: Create `tool/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `tool/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // thresholds enforced in Plan 10 (verification wave)
    },
  },
});
```

- [ ] **Step 4: Create `tool/.gitignore`**

```
node_modules/
.cmap/
*.actual.*
dist/
```

- [ ] **Step 5: Install dependencies**

Run: `cd tool && npm install`
Expected: installs without error; `node_modules/` present. (Note the resolved `@angular/compiler` version.)

</action>

<verify>
Run (Nyquist <60s, after the one-time `npm install`): `cd tool && npx tsc --noEmit`
Expected: exits 0 with no output (empty `src/` compiles cleanly under strict NodeNext). If `tsc` reports "No inputs were found", that is acceptable for this task — it means config is valid and there are simply no source files yet; proceed.
</verify>

<done>
`npm install` succeeds and `npx tsc --noEmit` exits 0. The `tool/` ESM workspace exists with pinned deps and Node≥20 engine; `.cmap/` and generated files are gitignored.
</done>

- [ ] **Step 6: Commit**

```bash
cd tool && git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore(tool): scaffold component-map ESM package (Node>=20, pinned deps)"
```

---

### Task 2: Shared data contracts (`types.ts`)

<model>sonnet</model>

<read_first>
- `docs/specs/2026-05-30-phase1-static-analysis-core-design.md` §6 (data model — authoritative shapes)
</read_first>

**Files:**
- Create: `tool/src/types.ts`
- Test: `tool/src/types.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/types.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION } from './types.js';
import type { Graph, ComponentNode, Edge, RouteNode } from './types.js';

describe('types contract', () => {
  it('exposes an integer SCHEMA_VERSION', () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('a sample Graph object satisfies the contract shapes', () => {
    const node: ComponentNode = {
      id: 'FooComponent',
      componentId: null,
      className: 'FooComponent',
      selector: 'app-foo',
      filePath: 'src/app/foo.component.ts',
      standalone: false,
      module: 'AppModule',
      templateKind: 'none',
      inputs: [{ name: 'x', alias: null, kind: 'decorator', required: false }],
      outputs: [],
      docPath: null,
      images: [],
    };
    const edge: Edge = { from: 'FooComponent', to: 'BarComponent', kind: 'resolved', via: 'template', reason: null };
    const route: RouteNode = {
      fullPath: 'foo', component: 'FooComponent', redirectTo: null,
      loadChildren: null, loadComponent: null, outlet: null, pathMatch: null,
      guards: [], children: [],
    };
    const graph: Graph = { schemaVersion: SCHEMA_VERSION, components: [node], edges: [edge], routes: [route] };

    expect(graph.components[0].selector).toBe('app-foo');
    expect(graph.edges[0].kind).toBe('resolved');
    expect(graph.routes[0].fullPath).toBe('foo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tool && npx vitest run src/types.test.ts`
Expected: FAIL — cannot find module `./types.js` / `SCHEMA_VERSION` not exported.

- [ ] **Step 3: Implement `tool/src/types.ts`**

```ts
// Shared data contracts for the Component Map Tool (Phase 1).
// Bump SCHEMA_VERSION on any shape change; a graph.json whose version != this forces a full rebuild.
export const SCHEMA_VERSION = 1;

// ---- Component I/O ----
export type IoKind = 'decorator' | 'signal';
export interface IoPort {
  name: string;          // class property name
  alias: string | null;  // public binding name if aliased, else null
  kind: IoKind;
  required: boolean;
}

// Raw extraction from the indexer (Plan 2), before graph-level fields are added.
export interface ComponentRecord {
  className: string;
  selector: string | null;
  filePath: string;                          // repo-relative, forward-slash
  standalone: boolean;                       // resolved (STND-01)
  module: string | null;                     // NgModule that declares it, else null
  templateKind: 'inline' | 'templateUrl' | 'none';
  inputs: IoPort[];
  outputs: IoPort[];
}

// Graph node: a ComponentRecord plus identity + MD-derived fields.
export interface ComponentNode extends ComponentRecord {
  id: string;                                // canonical: className, or `relPath#ClassName` on collision
  componentId: string | null;                // from MD (Plan 8), else null
  docPath: string | null;                    // linked .md path, else null
  images: { caption: string | null; path: string }[];  // representative images from MD
}

// ---- Edges ----
export type DepKind = 'resolved' | 'indirect' | 'unresolved-static';
export interface Edge {
  from: string;              // ComponentNode.id
  to: string | null;         // ComponentNode.id, or null when not statically knowable
  kind: DepKind;
  via: 'template' | 'route';
  reason: string | null;     // e.g. 'ng-content', 'ngTemplateOutlet', 'ngComponentOutlet'
}

// ---- Routes ----
export interface LazyTarget {
  importPath: string;        // literal specifier from import('...')
  symbol: string | null;     // member from .then(m => m.X), or null
}
export interface RouteNode {
  fullPath: string;          // resolved full URL path (parent segments concatenated)
  component: string | null;  // eager component class name
  redirectTo: string | null;
  loadChildren: LazyTarget | null;
  loadComponent: LazyTarget | null;
  outlet: string | null;     // named outlet, null = primary
  pathMatch: string | null;  // 'full' | 'prefix' | null
  guards: string[];
  children: RouteNode[];     // ORDER PRESERVED
}

// ---- Graph artifact ----
export interface Graph {
  schemaVersion: number;
  components: ComponentNode[];
  edges: Edge[];
  routes: RouteNode[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tool && npx vitest run src/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/types.ts src/types.test.ts
git commit -m "feat(tool): shared data contracts (Graph/ComponentNode/Edge/RouteNode) + SCHEMA_VERSION"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/types.test.ts`
Expected: PASS — `SCHEMA_VERSION === 1` and the sample `Graph`/`ComponentNode`/`Edge`/`RouteNode` objects compile and satisfy the contract.
</verify>

<done>
`tool/src/types.ts` defines every shared shape once (the JSON contract for all waves) and its test is green. Later waves import these types via `./types.js`.
</done>

---

### Task 3: Shared ts-morph Project + checker-free resolver

<model>opus</model>

<read_first>
- `.planning/phase1-RESEARCH.md` §1 (skip flags, NO type-checker, own export index), §3/§4 (why getDefinitionNodes is banned)
- `poc/spikes/spike-routing.ts:72-91` (the POC `findRoutesArray` + `getDefinitionNodes` it replaces)
- ts-morph docs concept: `Project`, `SourceFile.getClass/getVariableDeclaration`, `addSourceFilesAtPaths`
</read_first>

**Files:**
- Create: `tool/src/shared/project.ts`
- Test: `tool/src/shared/project.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/shared/project.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { createProject, resolveImportFile, getExportedDeclaration } from './project.js';

function mkProject(): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/src/b.ts', `export class FinanceModule {}\nexport const routes = [{ path: 'x' }];\nclass Hidden {}`);
  p.createSourceFile('/src/a.ts', `import { FinanceModule } from './b';`);
  return p;
}

describe('createProject', () => {
  it('returns a usable AST-only Project', () => {
    const p = createProject();
    const sf = p.createSourceFile('/m.ts', 'export class A {}');
    expect(sf.getClassOrThrow('A').getName()).toBe('A');
  });
});

describe('resolveImportFile', () => {
  it('resolves a relative specifier to its SourceFile', () => {
    const p = mkProject();
    expect(resolveImportFile(p, '/src/a.ts', './b')?.getFilePath()).toBe('/src/b.ts');
  });
  it('returns null for bare (non-relative) specifiers', () => {
    const p = mkProject();
    expect(resolveImportFile(p, '/src/a.ts', '@angular/core')).toBeNull();
  });
});

describe('getExportedDeclaration', () => {
  it('finds an exported class', () => {
    const b = mkProject().getSourceFileOrThrow('/src/b.ts');
    expect(getExportedDeclaration(b, 'FinanceModule')?.getKindName()).toBe('ClassDeclaration');
  });
  it('finds an exported const', () => {
    const b = mkProject().getSourceFileOrThrow('/src/b.ts');
    expect(getExportedDeclaration(b, 'routes')?.getKindName()).toBe('VariableDeclaration');
  });
  it('returns null for missing or non-exported names', () => {
    const b = mkProject().getSourceFileOrThrow('/src/b.ts');
    expect(getExportedDeclaration(b, 'Hidden')).toBeNull(); // declared but NOT exported
    expect(getExportedDeclaration(b, 'Nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tool && npx vitest run src/shared/project.test.ts`
Expected: FAIL — module `./project.js` / its exports not found.

- [ ] **Step 3: Implement `tool/src/shared/project.ts`**

```ts
import { Project, SourceFile, ClassDeclaration, VariableDeclaration } from 'ts-morph';
import { posix } from 'node:path';

// AST-only Project: no tsconfig, no dependency walking, no type info.
// NEVER call getType/getSymbol/findReferences/getDefinitionNodes on files from this Project
// (each boots the TS type-checker — see RESEARCH §1).
export function createProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false, strict: false },
  });
}

// Add all .ts under `root`, excluding tests / generated / build dirs.
// ts-morph stores paths with forward slashes; globs use them too.
export function addSources(project: Project, root: string): SourceFile[] {
  const r = root.replace(/\\/g, '/').replace(/\/$/, '');
  return project.addSourceFilesAtPaths([
    `${r}/**/*.ts`,
    `!${r}/**/*.spec.ts`,
    `!${r}/**/*.actual.*`,
    `!${r}/**/dist/**`,
    `!${r}/**/node_modules/**`,
  ]);
}

// Resolve a RELATIVE import specifier (from `fromFile`) to a SourceFile already in the project.
// Returns null for bare specifiers (e.g. '@angular/core') — Phase 1 only follows relative imports.
// Pure path math + project lookup; no type-checker.
export function resolveImportFile(project: Project, fromFile: string, specifier: string): SourceFile | null {
  if (!specifier.startsWith('.')) return null;
  const fromDir = posix.dirname(fromFile.replace(/\\/g, '/'));
  const base = posix.normalize(posix.join(fromDir, specifier));
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    const sf = project.getSourceFile(candidate);
    if (sf) return sf;
  }
  return null;
}

// Find an EXPORTED class or top-level const named `name` in `sf`. No type-checker.
export function getExportedDeclaration(
  sf: SourceFile,
  name: string,
): ClassDeclaration | VariableDeclaration | null {
  const cls = sf.getClass(name);
  if (cls?.isExported()) return cls;
  const v = sf.getVariableDeclaration(name);
  if (v && v.getVariableStatement()?.isExported()) return v;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tool && npx vitest run src/shared/project.test.ts`
Expected: PASS (6 tests) — including the `Hidden` (declared-but-not-exported) → null case.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/shared/project.ts src/shared/project.test.ts
git commit -m "feat(tool): AST-only ts-morph Project + checker-free import/export resolver"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test`
Expected: PASS — `resolveImportFile` resolves `./b` → `/src/b.ts` and returns null for `@angular/core`; `getExportedDeclaration` finds the exported class + const and returns null for the non-exported `Hidden` and the missing `Nope`. This proves cross-file resolution works WITHOUT the type-checker (the routing wave will use these instead of `getDefinitionNodes`).
</verify>

<done>
`tool/src/shared/project.ts` exposes `createProject`/`addSources`/`resolveImportFile`/`getExportedDeclaration`, all green. The analysis can now resolve imported route consts and lazy modules without ever invoking the TS type-checker — the foundation every later wave builds on.
</done>

---

## Self-Review (Plan 1)

- **Spec coverage:** scaffold + module layout (spec §5), data model contracts (spec §6 — Graph/ComponentNode/Edge/RouteNode incl. `componentId`/`docPath`/`images`/`outlet`/`pathMatch`), AST-only access + checker-free resolver (spec §5 `shared/`, RESEARCH §1). Indexer/edges/routes/etc. are later plans — this wave is foundation only. ✓
- **Placeholder scan:** every step has complete code/commands; no TBD. ✓
- **Type consistency:** `ComponentRecord` (indexer output) vs `ComponentNode` (graph node, extends it with id/componentId/docPath/images) defined once; `Edge.to` nullable; `RouteNode` carries `outlet`/`pathMatch` (used by Plan 3 T6) + ordered `children`; `SCHEMA_VERSION` integer (used by Plan 5 graph store). Resolver returns `ClassDeclaration | VariableDeclaration | null` (consumed by Plan 3). All NodeNext imports use `.js`. ✓
- **Verify bounds:** all three tasks verify in <60s (`tsc --noEmit`, `vitest run`). ✓
