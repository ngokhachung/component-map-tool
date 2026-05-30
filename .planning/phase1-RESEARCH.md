# Phase 1 — Research (Static Analysis Core)

**Date:** 2026-05-30 · **Mode A** (Stack + Pitfall agents) · **Input to:** writing-plans (STEP 6)
**Design:** `docs/specs/2026-05-30-phase1-static-analysis-core-design.md`
Claims tagged `[VERIFIED]` (confirmed via docs/code), `[CITED]` (source URL), `[ASSUMED]` (judgment).

## 1. ts-morph at scale + incremental
- Single shared `Project({ skipAddingFilesFromTsConfig:true, skipFileDependencyResolution:true })` + `addSourceFilesAtPaths(glob)`. `[VERIFIED — ts-morph.com/setup/adding-source-files]`
- **Stay AST-only — never call the type-checker.** `getType/getSymbol/findReferences/getDefinitionNodes` all boot the checker (slow + memory at 500 files). The POC routing spike's `arg.getDefinitionNodes()` (`spike-routing.ts:81`) is a checker call → **replace with our own export/symbol index** to resolve cross-file route consts. `[VERIFIED — ts-morph.com/manipulation/performance]`
- Wrap per-file extraction in `forgetNodesCreatedInBlock()` to bound memory; discard template ASTs after edge extraction (don't retain `TmplAst` in the graph). `[VERIFIED/ASSUMED]`
- Incremental per changed path: `removeSourceFile`+`addSourceFileAtPath` (or `sourceFile.refreshFromFileSystem()`); a long-lived Project does NOT auto-notice disk changes. Drive from our own content-hash `manifest.json`; unchanged files reuse cached `ComponentRecord[]` and are never re-parsed. `[CITED ts-morph.com/details/source-files; ASSUMED for the cache design]`

## 2. @angular/compiler version strategy
- Pinning ONE compiler (POC = 19.2.14) to parse older (v15) templates is the established pattern — angular-eslint ships `@angular-eslint/bundled-angular-compiler` exactly because compiler internals are unstable across majors. v15 templates are a subset of what v19 accepts (no `@if/@for/@defer`), so newer-parses-older is the safe direction. `[CITED npmjs.com/package/@angular-eslint/bundled-angular-compiler; VERIFIED — POC parseErrors:0]`
- **Decision: keep the direct pinned `@angular/compiler@19.2.x`** (simpler, POC-proven); document the pin as the compatibility matrix; vendor the bundled compiler only if a future target repo breaks.
- `parseTemplate(html, url, { preserveWhitespaces: true, ...interpolation? })` — **read `preserveWhitespaces` + custom `interpolation` from the `@Component` decorator** and pass them in, else interpolation/whitespace nodes can misparse. Treat ICU (`{count, plural}`) / `i18n` nodes as non-edges. `[CITED angular-eslint template-parser; angular compiler parseTemplate options]`

## 3. Edge builder pitfalls (SAC-02)
- **`*ngIf`/`*ngFor` DOUBLE-COUNT — confirmed reproducible with the pinned compiler & present in the sample** (`invoice-list.page.html`). Desugaring `<app-x *ngIf>` produces a `TmplAstTemplate` with `tagName==='app-x'` wrapping a `TmplAstElement` also `app-x` → POC visitor (`template-visitor.ts:52-59`) matches both → 2 edges. **Fix:** the desugared Template carries the directive in `templateAttrs` (`ngIf`/`ngFor`/`ngSwitchCase`) while the inner Element does not → match selectors only on `TmplAstElement`; match a `TmplAstTemplate` only when it is a genuine `<ng-template>` (tagName `null`/`'ng-template'`). Add a dedup guard per `(tag,target,sourceSpan)`. `[VERIFIED — agent ran the compiler]`
- **Parse-error handling:** POC zeroes `deps:[]` on any parse error → silently hides edges, violating the "never drop a dependency" attribute. **Fail loudly per template** (record the error, surface it) instead. `[VERIFIED — phase0 behavior]`
- Selector matching is global (over-match risk if two modules reuse a selector); acceptable Phase 1 limitation, document it; module-import scoping is a later phase. `[ASSUMED]`

## 4. Route parser pitfalls (SAC-03)
- **Drop the over-broad `findRoutesArray` fallback** (`spike-routing.ts:86-91` grabs the first array-literal const). Restrict to arrays typed `Routes`/`Route[]` (read the type annotation text syntactically) OR fed to `provideRouter`/`RouterModule.forRoot|forChild`. `[VERIFIED]`
- Handle: empty-path `{path:''}`, `pathMatch:'full'`, `redirectTo` (NO component edge), `''` children, `**` wildcard, **named outlets** (`outlet:'x'` → distinct access-path root, not a primary child), matrix params. POC ignores `outlet` + `pathMatch`. Full-path concat must collapse empty segments (`finance` + `''` + `invoices` → `finance/invoices`, not `finance//invoices`). The sample has TWO redirect hops + a lazy boundary. `[VERIFIED in sample]`
- **Lazy `forChild` stitching:** resolve `loadChildren` import path → find the NgModule in that file → graft its `forChild` routes as children of the lazy route (so `InvoiceListPage` full URL = `finance/invoices`). Imported route consts resolved via our export index (not `getDefinitionNodes`). Record `unresolved` when a symbol can't be statically recovered — never drop. `[VERIFIED in sample]`

## 5. Incremental-build SOUNDNESS (SAC-05) — highest correctness risk
- Selector→component matching is **global**: changing B's `selector` or NgModule membership changes how A's *unchanged* template resolves. Naive "re-parse only changed files" → silently wrong/missing edges. **Fix:** (1) always rebuild the FULL selector+NgModule-membership registry from all current component records before resolving any template (cheap — metadata only); (2) re-resolve templates of any component whose file changed OR that references a changed selector (when in doubt, re-resolve all — re-matching cached ASTs is trivial, still <5s); (3) make registry+membership part of the cache-invalidation key, not just file hashes. `[VERIFIED — soundness analysis]`

## 6. Query traversal pitfalls (SAC-06/07)
- Cycles in the containment graph (recursive/shared-layout components) → BFS infinite loop. **visited-set keyed by nodeId in BOTH impact and UI-path traversals + depth cap; record a `cycle` flag.** `[ASSUMED — common in real Angular]`
- A component reachable from multiple routes → SAC-07 returns a list (correct); enumerate distinct simple paths only, de-dup chains differing only past the target to avoid blow-up.
- UI-path walks ONLY `resolved` edges for the certain chain; any path through `indirect`/`unresolved`/lazy hop → `uncertain:true`; an edge with `to:null` cannot extend a path. `[VERIFIED by data model]`

## 7. MD / componentId (SAC-09)
- Read YAML frontmatter with **`js-yaml`** + a ~10-line `---` fence split (don't hand-roll YAML). Phase 1 reads only the single scalar `componentId`. **Policy note:** js-yaml is a generic data parser, not an Angular analysis tool (constraint names Compodoc/Nx/ng-analyzer) → judged in-policy; **needs owner sign-off**. If undesired, a minimal `key: value` reader is defensible at single-scalar scope. `[ASSUMED — policy interpretation]`
- Reuse the SAC-08 locator resolver for MD→node links (one matcher, consistent ambiguity rules). Detect duplicate `componentId` across MD files → hard error listing both paths; orphan ids (MD → no node) → warning, never fail; nodes without MD → `componentId:null`. `[VERIFIED by design intent]`

## 8. CLI + graph artifact
- CLI via built-in **`node:util` `parseArgs`** (zero deps; stable Node ≥20) — subcommand from `positionals[0]`, flags via `options`. Add `engines.node: ">=20"`. `[VERIFIED — nodejs.org/api/util]`
- `graph.json`: plain pretty JSON, **integer `schemaVersion`**; on mismatch → full rebuild (no migration). Keep `graph.json` + `manifest.json` separate. **Deterministic key/array ordering** (route order preserved + golden-baseline stability). `[ASSUMED — standard pattern]`
- **Write all artifacts to a separate out dir (`.cmap/`), never alongside sources**; scope the source glob and ignore `*.spec.ts`, `*.actual.*`, `dist/` (avoids the POC `.actual.json` leftover-ingestion trap). `[VERIFIED — phase0 idempotency bug]`

## Decisions carried into the plan
1. AST-only ts-morph (no checker; own export index for cross-file refs); single Project; `forgetNodesCreatedInBlock`; content-hash `manifest.json`; artifacts to `.cmap/`.
2. Pinned direct `@angular/compiler@19.2.x`; `parseTemplate` with decorator-read `preserveWhitespaces`/`interpolation`; ICU/i18n = non-edges.
3. Edge visitor: match `TmplAstElement` only (Template only for real `<ng-template>`) + `(tag,target,span)` dedup → fixes `*ngIf/*ngFor` double-count. **Parse error = loud failure, not empty deps.**
4. Route parser: typed/router-fed array detection only; outlets + pathMatch + redirect chains + empty-segment collapse; lazy `forChild` stitching via export index.
5. Incremental: rebuild full registry before resolve; re-resolve changed-or-affected templates; registry+membership in invalidation key.
6. Query: visited-set + depth cap + cycle flag; resolved-only chains with `uncertain` flag.
7. MD: js-yaml + fence split (owner sign-off), reuse locator, dup=error / orphan=warning.
8. CLI `node:util parseArgs` (Node ≥20); graph integer `schemaVersion`, deterministic order, separate manifest.

## Open item for owner
- Confirm `js-yaml` (generic YAML parser) is acceptable under the "no external open-source analysis tools" policy. Fallback: single-scalar hand-parser.
