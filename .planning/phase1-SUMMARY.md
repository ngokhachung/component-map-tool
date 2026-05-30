# Phase 1 — Static Analysis Core: Summary

**Milestone:** M2 — Phase 1 (Static Analysis Core)
**Dates:** 2026-05-30 → 2026-05-31
**Branch:** feature/phase1-static-analysis-2026-05-30 (47 commits)
**Outcome:** ✅ **Shipped** — a working Angular dependency-graph + UI-access-path tool, verified on real Angular 15 code.

## What shipped

A new TypeScript/Node **ESM** package `tool/` (the **Component Map Tool**) that indexes an Angular codebase into a versioned dependency graph and answers two questions per component — **impact** (affected ancestors) and **UI access path** (routes + component chains):

- **indexer** — component metadata (selector, I/O decorator+signal, filePath) + **version-aware `standalone`** (STND-01: explicit → NgModule membership → Angular-version default; v15 → all NgModule).
- **routes** — order-preserving route tree, full URL paths, guards/outlets/pathMatch, **lazy `forChild` stitching** (incl. a separate `*-routing.module.ts`).
- **edges** — `@angular/compiler` template visitor with the **`*ngIf`/`*ngFor` double-count fixed** (match `TmplAstElement` only); `ng-content`/`ngTemplateOutlet` → indirect, `ngComponentOutlet`/`@ViewChild`/`createComponent` → unresolved-static; **parse errors surfaced, not swallowed**.
- **graph** — assemble + deterministic, versioned `graph.json` (serialize/load).
- **cache** — content-hash manifest + **sound** cache-or-rebuild (full rebuild on any change).
- **query** — flexible locator (componentId / className / file / selector + ambiguity), impact (reverse-BFS, cycle-safe, `uncertain` flag), UI access path (route → component chain).
- **md** — `MdIndex`: `componentId` + source-path link + images from the team's Japanese Markdown format (sample `C000011`), tolerant.
- **cli** — `cmap index` / `cmap query <locator>` (JSON) + `--html` **self-contained offline preview** (base64 images).
- **AST-only** ts-morph throughout (no type-checker) via a checker-free import/export resolver.

## Requirements (M2 / Phase 1)

| REQ-ID | Status |
|---|---|
| SAC-01 indexer · STND-01 standalone | ✅ |
| SAC-02 edges (flags, double-count fix, parse-error-loud) | ✅ |
| SAC-03 route parser + lazy stitching | ✅ |
| SAC-04 versioned graph store | ✅ |
| SAC-05 cache + incremental (full-rebuild-on-change; per-file deferred) | ✅ |
| SAC-06 impact · SAC-07 UI access path | ✅ |
| SAC-08 locator · SAC-09 MdIndex · SAC-11 images · SAC-12 HTML preview | ✅ |
| SAC-10 CLI + library | ✅ |

## Verification

- **78 unit tests / 21 files**, `tsc --noEmit` clean, **coverage 97.6% lines / 88.5% branch / 98.9% func** (≥80% gate).
- **Accuracy gate** (`src/real-sample.test.ts`) on the real Angular 15 sample: 18 components (all NgModule), **19/19 resolved edges = 100%** vs hand-authored ground truth, dynamic cases flagged, `DataTableComponent` reachable via `finance/invoices`.
- **UAT PASS** (2026-05-31) + goal-backward verification PASS (13/13 REQ).
- **QA Gate**: APPROVE WITH CONDITIONS → 0 Critical; 3 Important fixed (image path-traversal blocked, duplicate componentId not assigned, SAC-09 link reconciled).

## Findings during execution (caught by running on real v15 code)

Three real bugs that in-memory unit tests masked — surfaced only by building/running on the real sample, then fixed + regression-tested:
1. Lazy `forChild` lived in a **separate `*-routing.module.ts`** → stitching now follows the lazy module's imports.
2. `toRepoRelative` garbled `filePath` for a **relative `--root`** vs ts-morph absolute paths.
3. `standalone` mis-classification on **Angular 15** (the original POC carry-forward, STND-01) — fixed via version-aware + NgModule-membership resolution.

## Carry to Phase 2 / 2a (backlog)

- **500-component perf benchmark** (full <60s / incremental <5s) — deferred until a real repo is available; design supports it (`buildGraphFromRoot(realRepo)`).
- **Fine-grained incremental** (warm-Project per-file re-parse) — `diffManifest` primitive in place.
- **Class-name collision** id qualification (`relPath#ClassName`); **selector module-scoping** (global matcher can over-match).
- QA suggestions: edge visitor keeps only the last selector match (collect all); `uiAccessPaths` emits one chain per route entry; lazy-symbol recovery brittleness.
- **Full MD schema** (ui_access_path, dynamic deps, パラメータ merge) → **Phase 2a**; **PR bot** → Phase 2.5.

## Decision

Phase 1 (Static Analysis Core, M2) is **complete and shipped**. Next: **M3 — Phase 2a (MD Schema + Parser) + Phase 2.5 (PR bot, early value)**.
