# Phase 0 — POC Validation: Summary

**Milestone:** M1 — Phase 0 (POC Validation)
**Date:** 2026-05-29
**Branch:** feature/phase0-poc-2026-05-29 → merged to master
**Outcome:** ✅ **GO** — all three parsing assumptions validated against Angular 19.

## What shipped

A throwaway TypeScript/Node **ESM** POC under `poc/` proving the Component Map Tool's core parsing is feasible:
- **Smoke gate:** `@angular/compiler@19.2.14` + `ts-morph` run standalone in plain Node ESM (no zone.js / compiler-cli) — the spec's #1 risk, retired first.
- **Shared harness:** count-aware multiset diff + report scorer; fails any case with `parseTemplate` errors.
- **3 spikes + 21 synthetic Angular 19 fixtures:**
  - Component (ts-morph): **11/11** — selector, inputs/outputs (decorator + signal `input()/output()/model()`), aliasing, `standalone` default, NgModule membership. (6 standalone / 5 NgModule)
  - Routing (ts-morph): **5/5** — path, component, lazy `loadChildren`/`loadComponent` (literal path + symbol), children, guards, deliberately-unresolvable lazy flagged.
  - Template (@angular/compiler): **5/5**, `parseErrors:0` — resolves under static / `*ngIf` / `*ngFor` / `@if` / `@for` / `@switch` / `@defer`; flags `ng-content` + `ngTemplateOutlet` (indirect) and `ngComponentOutlet` + `@ViewChild` + `ViewContainerRef.createComponent` (unresolved-static); matching via Angular's `SelectorMatcher` (attribute + multi selectors).
- **`FEASIBILITY-REPORT.md`** with per-task counts + gate-computed verdict: **GO**.
- 20 unit tests green.

## Requirements

| REQ-ID | Status |
|---|---|
| POC-01 component metadata | ✅ |
| POC-02 routing tree | ✅ |
| POC-03 template resolved cases | ✅ |
| POC-04 indirect/unresolved flagging | ✅ |
| POC-05 feasibility report + verdict | ✅ |

## Workflow trace

STEP 0 init → 1 Fast Lane (NO) → 2 Brainstorm → 3 Mode A → 4 Research (verified ts-morph + @angular/compiler@19) → 5 Spec → 6 Plan (3 plans/6 tasks, Plan Checker fixed 1 blocker) → 7 Execute (subagent-driven, 6/6) → 8 Verify + UAT (GO) → 9 QA (APPROVE, I1 fixed) → 10/11 merge.

## Findings during execution

- **Gate-zero confirmed** the riskiest dependency works standalone; all `@angular/compiler` export names verified against v19.2.14.
- **Idempotency bug** in the template spike (stale `*.actual.json` mistaken for fixtures on re-run) caught and fixed; re-runs stable.
- **QA I1** fixed: component verdict now enforces the spec's `rate ≥ 80%` clause.

## Carry to Phase 1 (Static Analysis Core)

Risks/notes surfaced by research + QA, to address in M2:
- **Multi-version compiler strategy:** `@angular/compiler` template API is experimental/private and breaks across majors. POC is pinned to 19.2.14. Evaluate the `@angular-eslint/bundled-angular-compiler` vendoring pattern (research P-AC2).
- **Route order matters** but the POC diff is order-insensitive (QA I2) — Phase 1 diff must enforce order for route arrays / guard arrays.
- **`filePath`** field (spec §4) omitted from POC `ComponentRecord` — add in Phase 1 (QA S1).
- **`findRoutesArray` fallback** is over-broad; **`createComponent` detection** isn't `ViewContainerRef`-scoped — narrow with type-aware detection (QA S4/S5).
- **Shared ts-morph `Project`** across files (currently per-file in template TS pass) for performance.
- **Multi-match dedup:** an element matching multiple registered selectors emits one dep per match — decide intended behavior.
- **Ground-truth bias:** expected.json hand-authored against synthetic fixtures; **validate against a real Angular repo** in Phase 1.
- POC code is throwaway — Phase 1 rewrites cleanly from these proven entry points and recipes.

## Decision

Phase 1 (Static Analysis Core, M2) is **cleared to start**.
