# Project State

## Current Position

**Phase:** Step 3 — Mode Gate complete (M3 brainstorm done, Mode A approved)
**Status:** in_progress
**Last updated:** 2026-05-31

## Current Milestone

**Milestone:** M3 — Phase 2a + 2.5: MD Overrides + PR Bot (in progress, started 2026-05-31)
**Started:** 2026-05-31
**Completed:** —
**Next milestone:** M4 — Phase 2b (MD Migration + Enforcement)
**Prior:** M2 — Phase 1 Static Analysis Core (COMPLETE, merged, 2026-05-31)

## Next Action

STEP 4 Research decision for M3 (focused: js-yaml, GitHub Actions sticky PR-comment pattern, git diff in CI) vs skip, then writing-plans (STEP 6). M3 design approved: `docs/specs/2026-05-31-phase2-md-overrides-pr-bot-design.md`. Working on master (no feature branch yet — create at execute).

## Execution Log

- T1 DONE (commit a6c36be): ESM workspace + loader + smoke. GATE-ZERO PASSED — @angular/compiler@19.2.14 runs standalone in Node ESM; all export names verified; ts-morph OK. Smoke assertion filters to hyphenated tags (visitor descends Template children → confirms research P-DC1).
- T2 DONE (commit 0b54790): shared harness — multiset diff + scoreCase/scoreTask. 9/9 vitest green; parse-error→FAIL gating locked in.
- T3 DONE (commit 113793e): component spike + 11 fixtures. 11/11 passed, meta 6 standalone / 5 NgModule. POC-01 demonstrated.
- T4 DONE (commit 6c141e1): routing spike + 5 fixtures. 5/5 passed. Lazy path+symbol recovered; unresolvable-lazy flagged; identifier-const + nested children work. POC-02 demonstrated.
- T5 DONE (commit 195697c): template spike (opus) + 5 fixtures. 5/5 passed, parseErrors 0. Canary confirms block-child recursion (@if/@for/@switch/@defer); outlets + attribute/multi selectors via SelectorMatcher. POC-03/04 demonstrated.
- T6 DONE (commit c9bf12c): report-all + GO/NO-GO. 19/19 vitest green. FEASIBILITY-REPORT.md → Overall verdict GO (component 11/11 6+5, routing 5/5, template 5/5). POC-05 demonstrated. Fixed spike-template idempotency bug (skip generated *.actual.json on re-run); verified stable.
- STEP 7 COMPLETE — all 6 tasks done, all reviews passed.
- STEP 8 UAT accepted (GO) + goal-backward verification (.planning/phase0-VERIFICATION.md).
- STEP 9 QA Gate: APPROVE WITH CONDITIONS → I1 fixed (component verdict enforces rate>=80%); 20/20 tests green.
- STEP 10/11: SUMMARY written (.planning/phase0-SUMMARY.md), ROADMAP updated (M1 done, M2 active), feature branch merged to master. M1 COMPLETE.

## Phase 1 Execution Log

- W1/T1 DONE (2c62775): `tool/` scaffold (ESM, Node≥20, pinned @angular/compiler 19.2.14 + ts-morph 24.0.0). Note: npm audit flags transitive vulns in dev tooling → for QA (STEP 9).
- W1 fix (8c32ed5): added `@types/node` (tsconfig `types:["node"]` needed it) + fixed `types.test.ts` sample missing `templateKind` — both caught by first `tsc --noEmit` (vitest/esbuild don't typecheck). Plan 1 updated.
- W1/T2 DONE (98c81f3): `src/types.ts` — Graph/ComponentNode/Edge/RouteNode/IoPort/LazyTarget + SCHEMA_VERSION=1. 2 tests.
- W1/T3 DONE (e0e1461): `src/shared/project.ts` — createProject (AST-only) + resolveImportFile + getExportedDeclaration (checker-free). 6 tests. Implemented by controller after T3 subagent hit a session limit (code verbatim from approved plan). Full suite 8/8 green, tsc clean.
- W2/T4 DONE (3c692b4): `src/indexer/component.ts` — extractComponentMeta (selector/io decorator+signal/templateKind/standaloneExplicit). 4 tests.
- W2/T5 DONE (a9601d8): `src/indexer/{version,module-map,index}.ts` — angularMajorFromPkg/standaloneDefault, buildModuleMap (incl. spread flatten), resolveStandalone + indexComponents (STND-01). 12 tests. Full suite **24/24 green, tsc clean**. v15 NgModule components correctly resolve standalone:false.
- P3/T6 DONE (3899048): `src/routes/parse.ts` — parseRoute/parseRouteArray (path/redirect/outlet/pathMatch/guards/children/lazy + fullPath collapse) + restricted route-array detection (forRoot/forChild/provideRouter only, dropped over-broad fallback). 3 tests.
- P3/T7 DONE (4fc07c0): `src/routes/index.ts` — parseRoutes with lazy forChild stitching via resolveImportFile (full URL e.g. finance/invoices). 2 tests. Full suite **29/29 green, tsc clean**.
- P4/T8 DONE (2e9152b): `src/edges/template-visitor.ts` — buildMatcher/collectTemplateDeps/parseTemplateDeps. **Fixed *ngIf/*ngFor double-count** (match TmplAstElement only, skip desugared Template) + parse-error-loud. 3 tests. (Adapted the malformed-template test input — spec's `<div [.="x">` produced 0 errors in v19.2.14; used unterminated `<div`; impl verbatim. Plan updated.)
- P4/T9 DONE (491c125): `src/edges/index.ts` — buildSelectorRegistry + buildEdges (template + @ViewChild/createComponent → deduped Edge[], per-component parseErrors). 2 tests. Full suite **34/34 green, tsc clean**. ParentComponent→ChildComponent = ONE edge despite *ngIf (double-count fix verified end-to-end).
- P5/T10 DONE (ce06c71): `src/graph/assemble.ts` — assembleGraph (records→ComponentNode, id=className, null MD fields) + deterministic serializeGraph/loadGraph (schemaVersion guard). 4 tests.
- P5/T11 DONE (4421351): `src/graph/index.ts` — buildGraph(project,{root}) (index+edges+routes+assemble) + buildGraphFromRoot + writeGraph(.cmap/graph.json). 2 tests. Full suite **40/40 green, tsc clean**. Full build pipeline works end-to-end.
- P10/T18+T19 DONE (606206e, ec600d1): `src/real-sample.test.ts` — ground-truth accuracy gate (18 comp all NgModule, **19/19 resolved edges exact-match = 100%**, dynamic cases flagged, DataTable→finance/invoices) + vitest coverage thresholds ≥80% (actual **96%/88%/99%/96%**). **STEP 7 EXECUTE COMPLETE: 10 plans / 19 tasks, 76 tests, tsc clean.**
- P9/T16+T17 DONE (a41a1c8, 73e96cc): `src/cli/html.ts` (renderHtml — self-contained, base64 images) + `src/cli/{index,run}.ts` (runCli: `cmap index`/`query <locator>` via node:util parseArgs, --html, enrichGraph each run) + `cmap` npm script. 6 tests. **+ fix (after 73e96cc): toRepoRelative for relative roots** — CLI smoke exposed garbled filePath with `--root ../poc/...`; fixed + regression test. Full suite **72/72 green, tsc clean**. Real CLI: `query app-data-table --root ../poc/real-sample/src` → DataTableComponent, filePath clean, accessPaths finance/invoices+reports.
- P8/T15 DONE (e8c2649): `src/md/{parse,index}.ts` — parseMdDoc (componentId from コンポーネントID table col + title fallback; ソースパス source link; 画面レイアウト images w/ heading captions) + enrichGraph (source-path suffix match → node.componentId/docPath/images; dup/orphan warnings). 7 tests. Full suite **64/64 green, tsc clean**.
- P7/T13+T14 DONE (4a600b9 + fix, c31bbdc): `src/query/locator.ts` (resolveLocator: componentId→className→file→selector + ambiguity) + `src/query/index.ts` (impact reverse-BFS cycle-safe + uncertain flag; uiAccessPaths route→chain). 11 tests. Full suite **57/57 green, tsc clean**. (Fixed a TS2783 in the locator test helper I'd authored — duplicate className via spread.)
- P6/T12 DONE (ed6b972): `src/cache/{manifest,index}.ts` — hashSources/manifest io/diff + buildIncremental (cache-or-rebuild; any change → full sound rebuild). 5 tests. Full suite **46/46 green, tsc clean**. (Fine-grained per-file re-parse deferred.)
- **End-to-end validation on real-sample** (buildGraphFromRoot ../poc/real-sample/src): 18 comp (0 standalone ✓), 28 deduped edges (19 resolved/4 indirect/5 unresolved-static ✓), 0 parse errors. Caught + FIXED a real bug — lazy stitching missed forChild in a SEPARATE `*-routing.module.ts` imported by the feature module. Fix (commit after 4421351): `stitch` now follows the lazy module's imports. Re-validated: `finance/invoices`, `finance/payments/:id`, `finance/reports` stitch correctly. +1 test (routes suite now 3); full suite **41/41 green**.

## Open Blockers

- None

## Key Decisions Made

- 2026-05-29: First milestone = Phase 0 (POC Validation) — de-risk parsing before Phase 1 build
- 2026-05-29: POC is throwaway spikes + a FEASIBILITY-REPORT.md (not reusable modules) — matches go/no-go intent
- 2026-05-29: Target Angular 19 (latest) — pulls @if/@for/@switch built-in control flow into scope
- 2026-05-29: Full hard template set covered (static/structural/control-flow + ng-content + dynamic + ngTemplateOutlet/@ViewChild) for an honest go/no-go
- 2026-05-29: Synthetic fixtures with hand-authored expected.json as ground truth (no real repo yet)
- 2026-05-29: Approach A — independent spikes + shared assertion harness; tooling Node+TS, tsx runner, vitest
- 2026-05-29: Gate thresholds — NO-GO if routing/template ≤50% pass; GO-with-caveats 50-80%; confident GO ≥80%
- 2026-05-29: Mode A approved (0/5 Mode B signals) — source of truth for all downstream phases
- 2026-05-29: STEP 4 research — @angular/compiler ESM-only; pin exact v19.x.y; must check parseTemplate errors; use CssSelector/SelectorMatcher; visitor recurses block children
- 2026-05-29: Scope additions — messy fixtures (1-2/task), one @defer fixture, literal-only lazy-route resolution
- 2026-05-29: STEP 6 plans written — 3 plan files (.planning/phase0-{1,2,3}-PLAN.md), 6 tasks, 4 waves; Plan Checker (11 dims) passed after 1 revision loop (fixed blocker: NgModule fixture count)
- 2026-05-29: Plans approved; execution mode = Subagent-Driven (fresh subagent per task + review checkpoints)
- 2026-05-30: **M2/Phase 1 kicked off.** STEP 1 Fast Lane = NOT eligible (milestone-scale). STEP 2 Brainstorm + STEP 3 Mode Gate complete.
- 2026-05-30: Phase 1 design = **Approach A** (pipeline → versioned `graph.json` + query layer; incremental via content-hash). New package `tool/` (clean rewrite from POC recipes; `poc/` kept as reference).
- 2026-05-30: Verify on `poc/real-sample/` (18 comp) with hand-authored ground truth; real-repo 500-comp benchmark **deferred** until repo available.
- 2026-05-30: Query scope = impact + UI access path. Deliverable = library API + thin CLI (`cmap`), JSON output.
- 2026-05-30: Locator resolves `componentId` (MD alias) → `className` → file → selector; >1 match → error+candidates. Internal node id = `className` (qualified `relPath#ClassName` on collision).
- 2026-05-30: `componentId` comes from per-component MD in a **centralized docs folder** (`docs/components/`); MD format pinned from a user-provided **sample** (pending). `MdIndex` is isolated + sequenced last — does not block core. Full MD schema = Phase 2a.
- 2026-05-30: Phase 1 REQ-IDs = SAC-01..10 + STND-01 (see REQUIREMENTS.md).
- 2026-05-30: Mode A approved for M2 (0/5 Mode B signals) — source of truth for all Phase 1 downstream steps.
- 2026-05-30: Demo branches pushed for team progress walkthrough: `demo/1-poc-fixtures` (61127c7), `demo/2-real-sample` (04da98d), `demo/3-phase1-design` (40079e3).
- 2026-05-30: MD format pinned from sample `docs/components/C000011_Common_Table_Cell.md` (Japanese, table-based): `componentId` from table col `コンポーネントID`; MD→component link via `## ソースパス` source path (location-independent → docs folder configurable); images from `## 画面レイアウト` `![](path)`. Parser = targeted Markdown extraction (NOT YAML → js-yaml question moot). Added SAC-11 (images in node) + SAC-12 (minimal self-contained HTML preview, base64 images — the image-display ask). Full interactive renderer stays Phase 3.
- 2026-05-30: STEP 4 Research done (`.planning/phase1-RESEARCH.md`). Key decisions: AST-only ts-morph (own export index, no type-checker, `forgetNodesCreatedInBlock`); pinned `@angular/compiler@19.2.x` + read `preserveWhitespaces`/`interpolation` from decorator; edge visitor matches `TmplAstElement` only + dedup → fixes `*ngIf/*ngFor` double-count; parse error = loud (not empty deps); route parser drops over-broad fallback + handles outlets/pathMatch/redirect/empty-segment + lazy `forChild` stitching; incremental rebuilds full selector+membership registry before resolve; query traversals use visited-set + cycle flag + resolved-only-with-uncertain; artifacts to `.cmap/`; CLI via `node:util parseArgs` (Node ≥20); MD via `js-yaml` + fence split (owner sign-off pending).

- 2026-05-30: STEP 6 plans — wave map approved (10 plans / 7 waves, ~19 tasks, model per task). Cadence = **wave-by-wave** (write plan → execute → next). Plan 1 (Wave 1) written + approved. Execution mode = **Subagent-Driven**; `commit_atomic: true` (commit per task).

- 2026-05-31: STEP 8 UAT PASS + goal-backward verification PASS (13/13 REQ). STEP 9 QA = **APPROVE WITH CONDITIONS** (code-reviewer): 0 Critical; 3 Important fixed — (#3) image path-traversal blocked in HTML preview, (#2) duplicate componentId not assigned, (#1) SAC-09 suffix-match link reconciled in spec. (#4) standalone default `>=19` reconciled in spec. Suggestions to Phase 2 backlog: multi-match edge collection (visitor keeps last match only); uiAccessPaths one-chain-per-route limitation; route lazy-symbol recovery brittleness. 78 tests, coverage 97.6%.

- 2026-05-31: **M3 kicked off.** STEP 1 Fast Lane = NOT eligible (milestone-scale). STEP 2 Brainstorm + STEP 3 Mode Gate done. Decisions: M3 = Phase 2a (MD overrides) + Phase 2.5 (PR bot) bundled in one cycle.
- 2026-05-31: Project MD is **read-only** project doc (tool must not edit). Dynamic-dep gaps patched via a **separate tool-owned `.cmap.yaml`** (per component, key=componentId, in `docs/component-map/`). **Tool scaffolds the skeleton** (`cmap gaps --write`, pre-filled detected constructs + empty `target`), user fills only `target`; merge-safe. Static-complete components need no override.
- 2026-05-31: Merge override `target`s → `resolved` edges `via:'override'`; `cmap gaps` lists components needing supplement. PR bot = GitHub Action that rebuilds graph in CI + posts sticky comment via `cmap pr`. js-yaml allowed (tool-owned data). Data model: `Edge.via`+`'override'`, `ComponentNode.description`, bump schemaVersion.
- 2026-05-31: M3 REQ-IDs = OVR-01..05 + BOT-01/02 (REQUIREMENTS.md). Mode A approved for M3 (1/5 Mode B signals — light CI).

## Approved Mode

Mode A — approved 2026-05-31 (M3); prior M2/M1 also Mode A

## Config

See `.planning/config.json` for granularity, parallelization, git tracking settings.

## Notes

- Design spec: `docs/specs/2026-05-29-phase0-poc-validation-design.md`
- Requirements: POC-01..05 in `.planning/REQUIREMENTS.md`
- Research: `.planning/phase0-RESEARCH.md`
- Plans: `.planning/phase0-1-PLAN.md` (Wave 1-2: scaffold+loader+smoke, harness), `phase0-2-PLAN.md` (Wave 3: component+routing spikes), `phase0-3-PLAN.md` (Wave 3: template spike; Wave 4: feasibility report)
- Full project plan reference: `specs/component-map-plan-v2.md`
- 2026-05-29 00:00: Project initialized via /init-project (Mode: greenfield, Stack: angular)
- 2026-05-29: STEP 1 Fast Lane = NOT eligible (`.planning/fast-lane-project-kickoff.json`); STEP 2 Brainstorm + STEP 3 Mode Gate complete
