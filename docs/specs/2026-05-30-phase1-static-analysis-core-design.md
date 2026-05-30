# Phase 1 — Static Analysis Core: Design Spec

**Milestone:** M2 — Phase 1 (Static Analysis Core)
**Date:** 2026-05-30
**Status:** Draft for review
**Predecessor:** Phase 0 POC (GO) — see `.planning/phase0-SUMMARY.md`
**Full plan:** `specs/component-map-plan-v2.md` (Phase 1 section)

## 1. Context

Phase 0 proved (on a real Angular 15.2.9 sample) that `ts-morph` + `@angular/compiler@19`
can extract component metadata, route trees, and template dependencies with 0 parse
errors. Phase 1 turns those throwaway spikes into a real, queryable **static analysis
core**: index an Angular codebase into a dependency graph and answer two questions for
any component:

1. **Impact** — which parents/ancestors are affected when this component changes?
2. **UI access path** — which routes + component chains lead to this component on the UI?

The POC under `poc/` stays as a reference. Phase 1 is a clean rewrite in a new package,
porting the proven recipes (selector matching, lazy-route recovery, template visitor,
ViewChild/createComponent detection, NgModule-membership cross-check).

## 2. Goals / Non-goals

**Goals**
- Index a codebase (NgModule + standalone, Angular ≤19) into a versioned graph.
- Answer impact + UI-access-path queries via a component locator.
- Library API + thin CLI; JSON output.
- Incremental rebuild via file-hash cache.

**Non-goals (deferred)**
- Full MD schema parsing (ui_access_path, dynamic deps, パラメータ I/O merge) → Phase 2a.
  Phase 1 reads ONLY `componentId`, the source-path link, and representative images from MD.
- PR bot → Phase 2.5. Full **interactive** renderer/HTML report → Phase 3. Phase 1 ships
  only a **minimal self-contained HTML preview** (single component) for the image-display ask.
- Real 500-component performance benchmark + 20-component real-repo ground truth →
  deferred until the real repo is available (decision 2026-05-30). Phase 1 verifies on
  the 18-component `poc/real-sample/` with hand-authored ground truth and is designed to
  point at a real repo unchanged.

## 3. Quality attributes (ATAM, from plan v2)

Priority order: **Correctness > Maintainability > Performance**. Concretely: never
silently drop a dependency (a flagged "uncertain" edge beats a missing one — supports the
"zero missed-impact" success criterion). Edges carry a `kind` so consumers see certainty.

## 4. Requirements (Phase 1 / M2)

| REQ-ID | Requirement |
|---|---|
| SAC-01 | Indexer extracts, for every component (NgModule + standalone), a record: `className`, `selector`, `filePath`, `inputs`/`outputs`, NgModule membership. |
| STND-01 | Version-aware `standalone` resolution: explicit flag → NgModule-`declarations` membership (⇒ non-standalone) → Angular-version default (detected from `package.json`). |
| SAC-02 | Edge builder resolves template child-component deps (static, `*ngIf`/`*ngFor`/`*ngSwitch`) and flags indirect (`ng-content`, `ngTemplateOutlet`) and unresolved-static (`ngComponentOutlet`, `@ViewChild`, `ViewContainerRef.createComponent`) — never silently dropped. |
| SAC-03 | Route parser builds an order-preserving route tree with resolved full paths, lazy `loadChildren`/`loadComponent` recovery, and guard names. |
| SAC-04 | Graph store assembles nodes + edges into a `graph.json` carrying `schemaVersion`; can serialize and load it. |
| SAC-05 | Caching + incremental build: a content-hash manifest re-parses only changed files and reassembles. Targets full < 60s / incremental < 5s (measured on real repo when available). |
| SAC-06 | Impact query: locator → ancestors, marking paths that traverse `indirect`/`unresolved-static` edges as uncertain. |
| SAC-07 | UI-access-path query: locator → list of `{ routeUrl, componentChain }`, flagging segments crossing lazy boundaries or indirect/unresolved edges. |
| SAC-08 | Component locator resolves by `componentId` (MD alias) → `className` → file (path or basename) → `selector`; matching > 1 node → error listing all candidates with full paths. |
| SAC-09 | `MdIndex`: from a configurable docs folder (read recursively), parse each component `.md` for `componentId` (metadata table col `コンポーネントID`) and link it to a node via the `## ソースパス` source path (normalize `\`→`/`, resolve against the configured src root). Tolerant (no MD ⇒ `componentId: null`); duplicate `componentId` → error; orphan source path → warning. Targeted Markdown extraction (no YAML / heavy parser). |
| SAC-10 | Deliverable: TS library API + CLI (`cmap index`, `cmap query <locator>`), JSON output. |
| SAC-11 | Extract representative component images from MD (`## 画面レイアウト` → `![caption](path)`), resolved relative to the `.md` file, into `node.images[]`. |
| SAC-12 | `cmap query <locator> --html <out>`: single self-contained HTML preview — component image(s) embedded base64 (offline), plus impact + UI-access-path. Full interactive renderer stays Phase 3. |

100% of these map to milestone M2 (Phase 1) in ROADMAP.

## 5. Architecture (Approach A — pipeline → graph artifact + query layer)

New package `tool/` (TS/Node ESM; `tsx`, `vitest` — same toolchain as `poc/`).

```
tool/
  src/
    indexer/    # *.ts -> ComponentRecord[]  (SAC-01)
    version/    # Angular version detect + standalone resolver  (STND-01)
    routes/     # route tree, path concat, lazy resolve, guards  (SAC-03)
    edges/      # @angular/compiler template visitor -> edges  (SAC-02)
    graph/      # assemble + (de)serialize graph.json, schemaVersion  (SAC-04)
    cache/      # content-hash manifest, incremental build  (SAC-05)
    query/      # locator resolver, impact, ui-access-path  (SAC-06/07/08)
    md/         # MdIndex: componentId aliases from docs folder  (SAC-09)
    cli/        # cmap index | query  (SAC-10)
  package.json  # bin: cmap
```

Each module is independently testable with a clear interface. The pipeline is one
direction: `indexer + routes -> edges -> graph.assemble -> serialize`. Query reads an
in-memory graph (freshly built or loaded from `graph.json`).

## 6. Data model

```ts
ComponentNode {
  id: string;            // canonical: className, or `relPath#ClassName` if className collides
  componentId: string | null;  // from MD (SAC-09), else null
  className: string;
  selector: string | null;
  filePath: string;      // repo-relative
  standalone: boolean;   // resolved (STND-01)
  module: string | null; // NgModule that declares it
  inputs: IoPort[]; outputs: IoPort[];
  docPath: string | null;  // linked .md (SAC-09), else null
  images: { caption: string | null; path: string }[];  // representative images from MD (SAC-11)
}
Edge { from: nodeId; to: nodeId | null; kind: 'resolved'|'indirect'|'unresolved-static';
       via: 'template'|'route'; reason: string | null; }
RouteNode { fullPath: string; component: string | null; lazy: LazyTarget | null;
            guards: string[]; children: RouteNode[];  /* order preserved */ }
Graph { schemaVersion: number; components: ComponentNode[]; edges: Edge[]; routes: RouteNode[]; }
```

`unresolved-static` edges may have `to: null` (target not statically knowable) but are
still recorded with a `reason`.

## 7. Build pipeline & incremental

- **Full build:** one shared `ts-morph` Project (fixes POC per-file perf note) → index
  components → parse routes → build edges (template visitor over each component's
  template, matching against the global selector registry) → assemble graph → write
  `graph.json` + `manifest.json` (per-file content hash).
- **Incremental:** diff hashes → re-parse only changed files. Then **always rebuild the
  full selector + NgModule-membership registry** from all current component records (cheap,
  metadata-only) before resolving any template — a changed selector/membership affects
  *other* files' edges, so a naive per-file resolve is unsound. Re-resolve templates of any
  component whose file changed OR that references a changed selector → reassemble. Parsing
  is the cost; re-matching cached ASTs over ≤500 nodes is trivial → meets < 5s. See
  `.planning/phase1-RESEARCH.md` §5 for the soundness analysis.

## 8. Query design

- **Locator resolution (SAC-08):** build lookup maps `byComponentId`, `byClassName`
  (case-insensitive, optional `Component` suffix), `byFilePath` (full + basename),
  `bySelector`. Resolve in that priority. Multiple matches → error with candidate list.
- **Impact (SAC-06):** reverse-BFS over edges from the target node → ancestors. Annotate
  any ancestor reached only through an `indirect`/`unresolved-static` edge as
  `uncertain: true`.
- **UI access path (SAC-07):** for target X, find route entry points whose component
  subtree (via `resolved` template edges) contains X; emit `{ routeUrl, componentChain }`.
  Lazy boundaries (`loadChildren`/`loadComponent`) continue the path into the lazy target's
  routes. Segments crossing lazy/indirect/unresolved hops are flagged.

## 9. Standalone & version (STND-01)

Detect Angular version from the target repo's `package.json`. Resolve `standalone`:
explicit flag if present → else `false` when the component is in some NgModule's
`declarations` → else the Angular-version default (`>= 19` ⇒ true — the `standalone`
default flipped to true in Angular 19; `≤ 18` / unknown ⇒ false). Validated against
`poc/real-sample/` (Angular 15, all NgModule): every component must resolve to
`standalone: false`.

## 10. MD / componentId / images (SAC-09, SAC-11, SAC-12)

`componentId` is human-assigned in per-component Markdown docs (optional). Format pinned
from the team sample `docs/components/C000011_Common_Table_Cell.md` (Japanese, table-based):

- **componentId** — from the metadata table column `コンポーネントID` (e.g. `C000011`); the
  H1 `# [C000011] …` and filename are cross-checks.
- **MD → component link** — the `## ソースパス` section's code-span path
  (`features\…\common-table.component.ts`), normalized `\`→`/`. Linked to a node by a
  **full-segment suffix match** against the node's `filePath` — the MD's src-root convention
  need not equal the analyzed root, so the docs folder is location-independent. If the suffix
  matches **>1 node → ambiguous**: skipped with a warning (never silently mis-links).
- **images** — the `## 画面レイアウト` section's `![caption](./page/x.png)` links, resolved
  relative to the `.md` file → `node.images[]`.

`MdIndex(docsDir)` reads the configurable folder **recursively**; targeted Markdown
extraction (no YAML / heavy parser — Phase 1 needs only these three fields). Tolerant:
no MD ⇒ `componentId: null`, `images: []`; a source path resolving to no node → warning
(orphan); an ambiguous suffix match → warning + skip. A **duplicate `componentId`** across
docs is reported (warning) and **not assigned to any node** (the alias namespace stays
unambiguous for the query locator) — never fatal. `MdIndex` is the last, isolated task — the
core never blocks on it.

**Image display (SAC-12):** `cmap query <locator> --html <out>` writes one self-contained
HTML file — the component's image(s) embedded as base64 `data:` URIs (offline, satisfies
the single-file security constraint) plus the impact list and UI-access paths. The full
interactive graph renderer remains Phase 3.

## 11. Verification strategy

- **Accuracy:** hand-author `graph.expected.json` for the 18 `poc/real-sample/` components;
  a checker (reusing the `verify:real:check` golden-baseline pattern) asserts ≥ 95% of
  edges match.
- **Units:** per-module unit tests (`vitest`); coverage ≥ 80%.
- **Performance:** deferred to real-repo availability; optionally generate a synthetic
  large tree to sanity-check build time. Code points at a real repo via a path argument
  unchanged.

## 12. Risks & dependencies

- **Dynamic edges** (🔴 from plan v2): `ngComponentOutlet`/ViewChild/createComponent are
  `unresolved-static` by design — covered by MD layer in Phase 2. Phase 1 only guarantees
  they are flagged, not resolved.
- **MD format dependency:** SAC-09 is gated on the user's sample `.md`.
- **Multi-version compiler:** `@angular/compiler` pinned (POC used 19.2.14); template API
  is version-sensitive. Revisit vendoring (`@angular-eslint/bundled-angular-compiler`)
  if the target repo's templates expose breakage.
- **No real repo in workspace:** acceptance numbers (95% on 20, < 60s on 500) are verified
  against `real-sample` + deferred to the real repo.

## 13. Out of scope (Phase 1)

Full MD schema/parser, PR bot, renderer/HTML, route-order-sensitive diff (Phase 2.5),
multi-Angular-version switching beyond standalone-default, IDE extension.
