# Requirements

**Source:** Brainstorm output 2026-05-29 (Phase 0 — POC Validation)
**Phase traceability:** Step 2 (Brainstorm) → Step 5 (Spec)
**Design spec:** `docs/specs/2026-05-29-phase0-poc-validation-design.md`

## REQ-ID Format

`[CATEGORY]-[NUMBER]` — e.g., `AUTH-01`, `CONT-02`, `UI-01`

Each requirement must be:
- **Specific & testable**: "User can reset password via email link" (not "add auth")
- **User-centric**: "User can X" (not "system does X")
- **Atomic**: One capability per requirement
- **Independent**: Minimal cross-dependencies

Every v1 requirement must map to exactly one phase in ROADMAP.md — 100% coverage required.

> **Scope note:** This file currently covers **Milestone M1 — Phase 0 (POC Validation)** only. Later milestones (Phase 1 Static Analysis Core, Phase 2.x MD + PR bot, Phase 3 Renderer, Phase 4 Maintenance) get their own REQ-IDs when brainstormed. See `specs/component-map-plan-v2.md` for the full project plan.

## v1 Requirements (Ship in initial release)

| REQ-ID | Requirement | Phase |
|---|---|---|
| POC-01 | Tool author can run a component spike that extracts metadata (selector, inputs, outputs, standalone, membership) correctly for ≥5 NgModule-based and ≥5 standalone Angular 19 components | Phase 0 |
| POC-02 | Tool author can run a routing spike that extracts the route tree (path, component, lazy `loadChildren`/`loadComponent`, children, guards) correctly for ≥5 route configs including lazy routes | Phase 0 |
| POC-03 | Tool author can run a template spike that resolves child-component dependencies for static, `*ngIf`/`*ngFor`, and `@if`/`@for`/`@switch` cases | Phase 0 |
| POC-04 | Tool author sees `ng-content`, `ngTemplateOutlet`, `*ngComponentOutlet`, `ViewContainerRef`, and `@ViewChild` cases correctly detected and flagged (indirect / unresolved-static) rather than silently missed | Phase 0 |
| POC-05 | Tool author gets a `FEASIBILITY-REPORT.md` with per-task pass-rates and a GO/NO-GO verdict computed against the gate thresholds | Phase 0 |

## v2 Requirements (Deferred — later milestones)

| REQ-ID | Requirement | Reason deferred |
|---|---|---|
| (TBD) | Combined dependency graph + `component-id → parents + UI access path` query | Phase 1 — Static Analysis Core |
| (TBD) | PR bot comments parents/routes affected on component-file changes | Phase 2.5 — early value |
| (TBD) | Markdown UI Access Path schema + tolerant parser + merge | Phase 2a |
| (TBD) | Mermaid / standalone HTML renderer | Phase 3 |

## Out of Scope (Explicit exclusions — Phase 0)

| Item | Reason |
|---|---|
| Combined dependency graph / `component-id` query | Phase 1 |
| Caching, incremental build, performance tuning | Phase 1 (perf is lower ATAM priority) |
| Real-repository runs | No repo available; synthetic fixtures suffice for feasibility |
| PR bot, renderer, MD schema | Phases 2.x / 3 |
| Multi-version parser strategy (15/17/19 switching) | Phase 1; POC targets Angular 19 only |
| Reusable/production-grade module design | POC is throwaway by decision |

## Assumptions

- A synthetic Angular 19 fixture set can faithfully represent the parsing edge cases that matter for the go/no-go decision.
- `ts-morph` and `@angular/compiler@19` can be installed and run in a standalone Node/TS package without a full Angular app build.
- The tool author (not an end Angular dev) is the user of the POC; output is JSON + a Markdown report, not a UI.

## Last updated

2026-05-29
