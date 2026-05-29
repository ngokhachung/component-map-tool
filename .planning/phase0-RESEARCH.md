# Phase 0 Research

**Date:** 2026-05-29
**Mode:** A (2 agents: Stack + Pitfall)
**Input:** Brainstorm output + approved design (`docs/specs/2026-05-29-phase0-poc-validation-design.md`)

## Phase Requirements → Findings map

| REQ-ID | Key finding |
|---|---|
| POC-01 | ts-morph extraction recipes verified (decorator + signal `input()`/`output()`/`model()`); standalone defaults `true` in v19 |
| POC-02 | Dynamic-import string + `.then` member name are reliably text-recoverable; flag dynamic/unresolvable lazy routes |
| POC-03 | `parseTemplate` + `TmplAst*` nodes verified for v19.2.x; control-flow blocks parsed by default; visitor must recurse block children |
| POC-04 | `ng-content`/`ngTemplateOutlet` = indirect; `*ngComponentOutlet`/`ViewContainerRef`/`@ViewChild` = unresolved-static (latter two are TS-level, not in template AST) |
| POC-05 | Report must record exact pinned version + import paths; raw counts alongside % |

## Standard Stack (VERIFIED)

- **`@angular/compiler@^19.2`** (latest 19.2.24). **ESM-only** (`"type":"module"`, FESM2022, no CommonJS bundle). → POC must be ESM: `poc/package.json` `"type":"module"` + `tsx` runner. CJS `require()` will fail. `[CITED: npm + jsdelivr package.json]`
- **`parseTemplate(template, templateUrl, options): ParsedTemplate`** from `@angular/compiler` (verified signature). Returns `{ nodes: TmplAstNode[], errors: ParseError[] | null }`. `[CITED: angular/angular@19.2.x render3/view/template.ts]`
- **`ts-morph` (latest 28.x)** — bundles its own TS; no need to match Angular's TS version. `[CITED: npm]`
- Runs **standalone in plain Node** — no zone.js / compiler-cli / TestBed needed. Proven by `@angular-eslint/template-parser` calling `parseTemplate` inside ESLint. `[CITED: angular-eslint template-parser]` (LOW-confidence on *zero* peer deps for exact patch → smoke-test first.)

## Verified API surface (lift directly into the plan)

**Template AST node exports (v19, `TmplAst*` prefix at package root):**
`TmplAstElement` (`.name`, `.children`, `.attributes`, `.inputs`), `TmplAstTemplate` (`.tagName`, `.templateAttrs`, `.children` — this is where `*ngIf`/`*ngFor` desugar), `TmplAstContent` (ng-content), `TmplAstIfBlock`/`IfBlockBranch`, `TmplAstForLoopBlock`/`ForLoopBlockEmpty`, `TmplAstSwitchBlock`/`SwitchBlockCase`, `TmplAstDeferredBlock`, `TmplAstLetDeclaration`. Walker: `TmplAstRecursiveVisitor` + `tmplAstVisitAll(visitor, nodes)`. `[CITED: r3_ast.ts @19.2.x]`

**Selector matching:** use Angular's own `CssSelector.parse()` + `SelectorMatcher` (exported from `@angular/compiler`) — handles attribute selectors, multi-selectors (`a, b`), `:not()`. `[CITED: packages/compiler/src/selector.ts]`

**ts-morph component extraction:** `classDecl.getDecorator("Component")` → `getArguments()[0]` ObjectLiteral → `getProperty("selector"|"standalone"|"template"|"templateUrl"|"imports")`. Inputs/outputs: decorator form via `prop.getDecorator("Input"|"Output")`; signal form via `prop.getInitializer()` being a `CallExpression` with callee text `input`/`input.required`/`output`/`model`/`model.required`. `[CITED: ts-morph decorators docs] / [ASSUMED-high: signal recipe]`

**ts-morph routing:** descendant `CallExpression`s matching `RouterModule.forRoot|forChild` / `provideRouter`; resolve identifier route arrays back to their `const routes = [...]`. Lazy: inner dynamic-`import()` first arg (string literal) + `.then(m => m.X)` member name. `[ASSUMED-high]`

**ts-morph project setup:** on-disk `Project` with `skipAddingFilesFromTsConfig: true` + `skipFileDependencyResolution: true`, then add only fixture paths (avoids pulling node_modules). `[CITED: ts-morph docs + issue #1252]`

## Don't Hand-Roll

- HTML/template parsing → `@angular/compiler` `parseTemplate` (never regex / generic HTML parser; only it desugars `*ngIf`→`Template` and parses `@if`/`@for`).
- AST traversal → `TmplAstRecursiveVisitor` + `tmplAstVisitAll`.
- Selector matching → `CssSelector` + `SelectorMatcher` (hand-rolled tag equality is the #1 false-negative source).
- TS AST navigation → ts-morph (not the raw TS compiler API).

## Common Pitfalls (and required mitigations)

| ID | Pitfall | Mitigation (bake into plan) |
|---|---|---|
| P-AC2 | `@angular/compiler` template API is **published but officially experimental/private**; breaks across majors (angular-eslint vendors its own to cope; v19.3 renamed AST nodes, v20 flipped error-suppression default) | Pin **exact** `@angular/compiler@19.x.y` (not `^`); record resolved version + import paths in report; scope GO to "Angular 19 only"; recommend bundled-compiler pattern for Phase 1 multi-version |
| P-AC3 | `enableBlockSyntax` defaults true but if off, `@if`/`@for` silently mis-tokenized (no error) | Pass `enableBlockSyntax: true` explicitly; **assert** block fixtures yield `TmplAstIfBlock`/`ForLoopBlock`/`SwitchBlock` |
| P-AC4 | `parseTemplate` returns `errors` (doesn't throw) → reading only `.nodes` silently under-reports | Harness **fails any case where `result.errors` is non-null** |
| P-DC1 | Structural-directive wrapper: component under `*ngIf` lives in `Template.children`; top-level-only walk misses it (silent false negative) | Visitor recurses through `Template`/`IfBlock`/`ForLoopBlock`/`SwitchBlock`/`DeferredBlock` children |
| P-TM4 | Signal `input()` false-positives on any local `input(` call; `model()` is two-way; aliasing | Gate on initializer call to `@angular/core`-imported symbol; treat `model` as both in+out; add mixed-form fixture |
| P-M1/P-M2 | Ground-truth bias + clean synthetic fixtures → falsely high GO | Add 1-2 **"messy" fixtures per task** (attribute/multi-selector, mixed I/O, deliberately-unresolvable lazy route); report **raw counts**, list borderline cases explicitly |
| P-M3 | "Unresolved correctly" can mask a parse failure that produced no node | Distinguish "detected-and-flagged" from "absent"; combined with P-AC4 errors-check |
| P-M5 | Small-N (~5/task): one fixture = 20% → noisy gate | Report counts + percentages; surface borderline cases rather than letting them silently tip the gate |

## Assumptions Log (need validation)

- LOW: `parseTemplate`-only path needs zero peer deps for the exact 19.x patch → **first task is a 5-line smoke import** to confirm before building fixtures.
- HIGH: signal I/O detection recipe; routing dynamic-import recovery; `ngTemplateOutlet`/`*ngComponentOutlet` surface as `Template` attributes (confirm exact placement in-spike).
- `tsx`/`vitest` handle the ESM-only import without extra config (standard, unverified against this exact package).

## Open Questions (for user / plan)

1. **`@defer` blocks** — not in the approved hard set, but `@defer` wraps children with the same recursion concern as control flow. Research recommends adding **one `@defer` fixture**. Include in Phase 0, or defer to Phase 1?
2. **Lazy-route target resolution** — capture literal path+symbol only (resolution off, simpler), or resolve target class across files? Recommend literal-only for POC (satisfies POC-02).
3. **"Messy" fixtures** — add 1-2 per task to combat ground-truth bias (research strongly recommends). Adds scope but materially improves go/no-go honesty.

## Sources

Angular source (19.2.x / 19.0.0): `packages/compiler/src/compiler.ts`, `render3/view/template.ts`, `render3/r3_ast.ts`, `selector.ts`. npm/jsdelivr package metadata for `@angular/compiler` + `ts-morph`. angular-eslint `template-parser` source + CHANGELOG + PR #720 (compiler-instability rationale). ts-morph.com docs (setup, decorators) + issues #681/#813/#1252. angular.dev (inputs guide, NgComponentOutlet, ViewContainerRef, standalone migration, Angular Package Format). Full URL list in the two research agent transcripts.
