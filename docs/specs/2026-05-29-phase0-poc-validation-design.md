# Phase 0 — POC Validation: Design Spec

**Date:** 2026-05-29
**Project:** Component Mapping (Component Map Tool)
**Milestone:** M1 — Phase 0: POC Validation
**Source:** Brainstorm 2026-05-29; project plan `specs/component-map-plan-v2.md`
**Status:** Approved (design), pending spec review + mode gate

---

## 1. Goal & Scope

**Goal:** Produce evidence to make a confident **GO / NO-GO** decision on building the Component Map Tool, by proving the three hardest parsing assumptions hold against **Angular 19**.

**Phase 0 proves we can:**
- Extract component metadata via `ts-morph` (NgModule-based **and** standalone).
- Parse Angular Router config including lazy routes via `ts-morph`.
- Resolve template child-component dependencies via `@angular/compiler`, across the full hard construct set.

**Explicitly NOT in Phase 0** (deferred to Phase 1):
- Combining the three parsers into one dependency graph.
- The `component-id → parents + UI access path` query.
- Caching / incremental build, performance optimization.
- Running against a real Angular repository (synthetic fixtures only).

**Code is throwaway.** The deliverable is the feasibility report, not reusable modules. Phase 1 rewrites cleanly from a proven foundation.

## 2. Decisions (locked during brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| POC rigor | Throwaway spikes + report | Matches go/no-go intent; fastest path; clean "stop here" if a gate fails |
| Angular version | Angular 19 (latest) | Pulls built-in control flow `@if`/`@for`/`@switch` into scope alongside classic `*ngIf`/`*ngFor` |
| Template coverage | Full hard set | Most honest go/no-go read (static + structural + control flow + ng-content + dynamic + ngTemplateOutlet + @ViewChild) |
| Target codebase | Synthetic fixtures | No real repo available yet; fixtures author-controlled with hand-written ground truth |
| Structure | Approach A — independent spikes + shared assertion harness | Isolated, disposable spikes; measured pass-rates as evidence |
| Tooling | Node + TypeScript, `tsx` runner, `vitest` assertions | Lightweight, standard, fast to stand up |

Quality priority (ATAM): **Correctness > Maintainability > Adoptability > Performance** — hence measured, reproducible validation rather than eyeballed exploration.

## 3. Architecture (Approach A)

```
poc/
  package.json            # ts-morph, @angular/compiler@^19, tsx, vitest (Angular 19 pinned)
  fixtures/
    component/  <name>.component.ts + expected.json     (>=5 NgModule + >=5 standalone)
    routing/    <name>.routes.ts / *-routing.module.ts + expected.json  (>=5, incl. lazy)
    template/   <name>.html (+ selector registry) + expected.json       (full hard set)
  spikes/
    spike-component.ts     # emits actual.json per fixture
    spike-routing.ts
    spike-template.ts
  harness/
    assert.ts              # order-insensitive deep-diff actual vs expected -> pass/fail
    report.ts              # aggregates results -> FEASIBILITY-REPORT.md
  FEASIBILITY-REPORT.md    # THE deliverable
```

Each spike is a standalone script reading its fixtures, emitting `actual.json` per fixture. The harness compares against `expected.json` and aggregates pass-rates. No shared parser abstraction — spikes are independent on purpose.

## 4. The Three Spikes

### Spike 0.1 — Component metadata (`ts-morph`)
Extracts per component:
- `selector`, `className`, `filePath`
- `inputs[]` — both `@Input()` decorator and signal `input()` forms
- `outputs[]` — both `@Output()` decorator and signal `output()` forms
- `standalone` flag
- template reference — inline `template` vs `templateUrl`
- membership — NgModule `declarations` (for NgModule-based) vs standalone `imports`

Fixtures: ≥5 NgModule-based + ≥5 standalone Angular 19 components.

### Spike 0.2 — Routing (`ts-morph`)
Parses `RouterModule.forRoot(...)` / `RouterModule.forChild(...)` and `provideRouter(...)` route arrays:
- `path`, `component`
- `loadChildren` (lazy NgModule), `loadComponent` (lazy standalone)
- `children` (nested routes), redirects (`redirectTo`)
- detected guard names (`canActivate`, etc.) — names only, no resolution

Fixtures: ≥5 route configs including ≥1 lazy module and ≥1 lazy standalone.

### Spike 0.3 — Template dependencies (`@angular/compiler` `parseTemplate`)
Walks the parsed template AST; matches element tags against a known-selector registry to derive child-component dependencies.

| Construct | Expected outcome |
|---|---|
| Static `<app-child>` | **Resolved** child |
| Under `*ngIf` / `*ngFor` | **Resolved** child |
| Under `@if` / `@for` / `@switch` (built-in control flow) | **Resolved** child |
| `<ng-content>` projection | **Indirect** (flagged, not silently missed) |
| `ngTemplateOutlet` | **Indirect** (flagged) |
| `*ngComponentOutlet` | **Unresolved-static** (flagged) |
| `ViewContainerRef.createComponent(...)` | **Unresolved-static** (flagged) |
| `@ViewChild(...)` programmatic access | **Unresolved-static** (flagged) |

## 5. Validation & Go/No-Go

Each fixture ships with a hand-authored `expected.json` (ground truth). Each spike emits `actual.json`. The harness deep-diffs (array order ignored) → per-case pass/fail → pass-rate per task.

**"Correct" definitions:**
- Component / routing: extracted facts exactly match expected.
- Template resolved cases: correct child selectors found.
- Template indirect / unresolved cases: **pass = correctly detected and flagged** (success is clean detection, not static resolution of an inherently dynamic case).

**Gate thresholds:**
- **NO-GO** if routing **or** template pass-rate ≤ 50% → stop the plan, re-design.
- **GO-with-caveats** if 50% < pass-rate < 80% → proceed, document risks.
- **Confident GO** if pass-rate ≥ 80% per task **and** component spike produces correct JSON for ≥5 of each type.

## 6. Feasibility Report (the deliverable)

`FEASIBILITY-REPORT.md` contains:
- Pass-rate table per task (component / routing / template).
- Per-case results (fixture → pass/fail + notes).
- List of constructs that could **not** be parsed.
- `@angular/compiler` API quirks / exact import paths / version notes encountered.
- The **GO / NO-GO / GO-with-caveats** verdict against the gate thresholds.
- Risks to carry into Phase 1.

## 7. Risks

- `@angular/compiler` template-AST API is semi-internal and version-sensitive → POC pins v19 and records the exact import paths used, so Phase 1 inherits a known-good entry point.
- Dynamic / programmatic cases (`*ngComponentOutlet`, `ViewContainerRef`, `@ViewChild`) are *expected* to be statically unresolvable — success means **clean detection + flagging**, which validates the Phase 2 Markdown-metadata layer rationale.

## 8. Requirements (REQ-IDs)

| REQ-ID | Requirement |
|---|---|
| POC-01 | Tool author can run a component spike that extracts metadata (selector, inputs, outputs, standalone, membership) correctly for ≥5 NgModule-based and ≥5 standalone Angular 19 components |
| POC-02 | Tool author can run a routing spike that extracts the route tree (path, component, lazy `loadChildren`/`loadComponent`, children, guards) correctly for ≥5 route configs including lazy routes |
| POC-03 | Tool author can run a template spike that resolves child-component dependencies for static, `*ngIf`/`*ngFor`, and `@if`/`@for`/`@switch` cases |
| POC-04 | Tool author sees `ng-content`, `ngTemplateOutlet`, `*ngComponentOutlet`, `ViewContainerRef`, and `@ViewChild` cases correctly detected and flagged (indirect / unresolved-static) rather than silently missed |
| POC-05 | Tool author gets a `FEASIBILITY-REPORT.md` with per-task pass-rates and a GO/NO-GO verdict computed against the gate thresholds |

## 9. Out of Scope

| Item | Reason |
|---|---|
| Combined dependency graph / `component-id` query | Phase 1 |
| Caching, incremental build, performance tuning | Phase 1 (perf is lower ATAM priority) |
| Real-repository runs | No repo available; synthetic fixtures suffice for feasibility |
| PR bot, renderer, MD schema | Phases 2.x / 3 |
| Multi-version parser strategy (15/17/19 switching) | Phase 1; POC targets Angular 19 only |
| Reusable/production-grade module design | POC is throwaway by decision |

## 10. Assumptions

- A synthetic Angular 19 fixture set can faithfully represent the parsing edge cases that matter for the go/no-go decision.
- `ts-morph` and `@angular/compiler@19` can be installed and run in a standalone Node/TS package without a full Angular app build.
- The tool author (not an end Angular dev) is the user of the POC; output is JSON + a Markdown report, not a UI.
