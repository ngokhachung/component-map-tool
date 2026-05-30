# Project State

## Current Position

**Phase:** Step 4 — Research (complete)
**Status:** in_progress
**Last updated:** 2026-05-30

## Current Milestone

**Milestone:** M2 — Phase 1: Static Analysis Core (in progress)
**Started:** 2026-05-30
**Completed:** —
**Next milestone:** M3 — Phase 2a + 2.5 (MD Schema + PR Bot)
**Prior:** M1 — Phase 0 POC (COMPLETE, GO, 2026-05-29)

## Next Action

Run writing-plans (STEP 6) to draft Phase 1 implementation plans, consuming `.planning/phase1-RESEARCH.md`. Open item: owner sign-off on `js-yaml` dependency (fallback: single-scalar hand-parser).

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
- 2026-05-30: STEP 4 Research done (`.planning/phase1-RESEARCH.md`). Key decisions: AST-only ts-morph (own export index, no type-checker, `forgetNodesCreatedInBlock`); pinned `@angular/compiler@19.2.x` + read `preserveWhitespaces`/`interpolation` from decorator; edge visitor matches `TmplAstElement` only + dedup → fixes `*ngIf/*ngFor` double-count; parse error = loud (not empty deps); route parser drops over-broad fallback + handles outlets/pathMatch/redirect/empty-segment + lazy `forChild` stitching; incremental rebuilds full selector+membership registry before resolve; query traversals use visited-set + cycle flag + resolved-only-with-uncertain; artifacts to `.cmap/`; CLI via `node:util parseArgs` (Node ≥20); MD via `js-yaml` + fence split (owner sign-off pending).

## Approved Mode

Mode A — approved 2026-05-30 (M2/Phase 1); prior M1 also Mode A (2026-05-29)

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
