# Phase 1 — Goal-Backward Verification

**Milestone:** M2 — Phase 1 (Static Analysis Core)
**Date:** 2026-05-31
**Branch:** feature/phase1-static-analysis-2026-05-30 (43 commits)
**Method:** Cross-reference each REQ-ID / must_have against the implemented artifact and its automated verification. Evidence: `cd tool && npm run test:cov` (76 tests / 21 files, coverage 96% lines / 88% branch / 99% func) + `npx tsc --noEmit` (clean) + the real-sample accuracy gate `src/real-sample.test.ts`.

## REQ coverage

| REQ-ID | Artifact | Verified by | Status |
|---|---|---|---|
| SAC-01 Indexer | `src/indexer/component.ts` + `index.ts` | `component.test.ts`, `index.test.ts`; real-sample → 18 components | ✅ |
| STND-01 Version-aware standalone | `src/indexer/version.ts`, `module-map.ts`, `resolveStandalone` | `version.test.ts`, `module-map.test.ts`, `index.test.ts`; real-sample → 18/18 `standalone:false` (v15) | ✅ |
| SAC-02 Edge builder + flags | `src/edges/template-visitor.ts`, `index.ts` | `template-visitor.test.ts` (double-count fix, parse-error-loud), `edges/index.test.ts`; real-sample dynamic cases flagged | ✅ |
| SAC-03 Route parser | `src/routes/parse.ts`, `index.ts` | `parse.test.ts`, `routes/index.test.ts` (incl. separate-routing-module stitching); real-sample → `finance/invoices` etc. | ✅ |
| SAC-04 Graph store (versioned) | `src/graph/assemble.ts` | `assemble.test.ts` (serialize/load, schemaVersion guard, deterministic order) | ✅ |
| SAC-05 Cache + incremental | `src/cache/manifest.ts`, `index.ts` | `manifest.test.ts`, `cache/index.test.ts` (cache hit / rebuild on change). Sound full-rebuild-on-change; per-file re-parse deferred | ✅ (perf benchmark deferred) |
| SAC-06 Impact query | `src/query/index.ts` `impact` | `query/index.test.ts` (ancestors, cycle-safe, uncertain flag) | ✅ |
| SAC-07 UI access path | `src/query/index.ts` `uiAccessPaths` | `query/index.test.ts`; real-sample → DataTable reachable via `finance/invoices` | ✅ |
| SAC-08 Locator | `src/query/locator.ts` | `locator.test.ts` (componentId/className/file/selector + ambiguity + not-found) | ✅ |
| SAC-09 MdIndex | `src/md/parse.ts`, `index.ts` | `md/parse.test.ts` (C000011 format), `md/index.test.ts` (source-suffix link, dup/orphan warnings) | ✅ |
| SAC-10 CLI + library | `src/cli/index.ts`, `run.ts`, `cmap` script | `cli/index.test.ts`; real CLI smoke `cmap query app-data-table --root ../poc/real-sample/src` | ✅ |
| SAC-11 Images in node | `src/md/parse.ts` (画面レイアウト) + `node.images` | `md/parse.test.ts` (2 images + captions) | ✅ |
| SAC-12 HTML preview | `src/cli/html.ts` + `--html` wiring | `cli/html.test.ts` (self-contained, base64), `cli/index.test.ts` (--html writes file) | ✅ |

## Observable truths (from plan must_haves) — confirmed

- ts-morph stays **AST-only** (no type-checker); cross-file resolution via own export index (`shared/project.ts`). ✅
- `standalone` resolved version-aware → **18/18 NgModule** on real v15 (the confirmed STND-01 fix). ✅
- `*ngIf`/`*ngFor` **double-count eliminated** (match `TmplAstElement` only) — verified unit + real-sample exact-edge gate. ✅
- Parse errors surfaced **loudly** (not empty deps). ✅
- Lazy `forChild` stitched (incl. **separate routing module**) → full URLs. ✅
- Graph **deterministic + versioned**; cache **sound** (full rebuild on any change). ✅
- Queries **cycle-safe**, resolved-only chains with **uncertain** flag (zero missed-impact honesty). ✅
- Accuracy gate: **19/19 resolved edges = 100%** vs hand-authored ground truth on real Angular 15 sample. ✅

## Gaps / deferred (recorded, not blocking Phase 1 acceptance)

- **500-component perf benchmark** (full <60s / incremental <5s) — deferred until a real repo is available (decision 2026-05-30). Not gated here.
- **Fine-grained incremental** (warm-Project per-file re-parse) — `diffManifest` primitive in place; deferred.
- **Class-name collision** id qualification (`relPath#ClassName`) — id=className for Phase 1; documented.
- **Selector module-scoping** (global matcher can over-match if two modules reuse a selector) — documented Phase 1 limitation.
- **MD parser** is targeted (componentId/source/images only); full schema (ui_access_path, dynamic deps, パラメータ merge) → Phase 2a.

## Verdict

All 13 Phase-1 REQ-IDs (SAC-01..12 + STND-01) implemented and verified by automated tests + the real-sample accuracy gate. Deferred items are explicitly out of Phase 1 scope and recorded for later milestones. **Goal-backward verification: PASS** (pending user UAT confirmation in `phase1-UAT.md`).
