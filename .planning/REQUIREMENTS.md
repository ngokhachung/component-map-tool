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

> **Scope note:** This file covers **M1 — Phase 0**, **M2 — Phase 1**, **M3 — Phase 2a + 2.5 (MD Overrides + PR Bot)**, and **M4 — Phase 2b (MD Migration + Enforcement)**. Later milestones (Phase 3 Renderer, Phase 4 Maintenance) get their own REQ-IDs when brainstormed. See `specs/component-map-plan-v2.md` for the full project plan.

## v1 Requirements (Ship in initial release)

| REQ-ID | Requirement | Phase |
|---|---|---|
| POC-01 | Tool author can run a component spike that extracts metadata (selector, inputs, outputs, standalone, membership) correctly for ≥5 NgModule-based and ≥5 standalone Angular 19 components | Phase 0 |
| POC-02 | Tool author can run a routing spike that extracts the route tree (path, component, lazy `loadChildren`/`loadComponent`, children, guards) correctly for ≥5 route configs including lazy routes | Phase 0 |
| POC-03 | Tool author can run a template spike that resolves child-component dependencies for static, `*ngIf`/`*ngFor`, and `@if`/`@for`/`@switch` cases | Phase 0 |
| POC-04 | Tool author sees `ng-content`, `ngTemplateOutlet`, `*ngComponentOutlet`, `ViewContainerRef`, and `@ViewChild` cases correctly detected and flagged (indirect / unresolved-static) rather than silently missed | Phase 0 |
| POC-05 | Tool author gets a `FEASIBILITY-REPORT.md` with per-task pass-rates and a GO/NO-GO verdict computed against the gate thresholds | Phase 0 |

## M2 — Phase 1 Requirements (Static Analysis Core)

**Design spec:** `docs/specs/2026-05-30-phase1-static-analysis-core-design.md` — brainstorm output 2026-05-30. All map to phase **Phase 1** in ROADMAP.

| REQ-ID | Requirement | Phase |
|---|---|---|
| SAC-01 | Indexer extracts, for every component (NgModule + standalone), a record: `className`, `selector`, `filePath`, `inputs`/`outputs`, NgModule membership | Phase 1 |
| STND-01 | Version-aware `standalone` resolution: explicit flag → NgModule-`declarations` membership (⇒ non-standalone) → detected Angular-version default (from `package.json`) | Phase 1 |
| SAC-02 | Edge builder resolves template child-component deps (static, `*ngIf`/`*ngFor`/`*ngSwitch`) and flags indirect (`ng-content`, `ngTemplateOutlet`) / unresolved-static (`ngComponentOutlet`, `@ViewChild`, `ViewContainerRef.createComponent`) — never silently dropped | Phase 1 |
| SAC-03 | Route parser builds an order-preserving route tree with resolved full paths, lazy `loadChildren`/`loadComponent` recovery, and guard names | Phase 1 |
| SAC-04 | Graph store assembles nodes + edges into a `graph.json` carrying `schemaVersion`; can serialize and load it | Phase 1 |
| SAC-05 | Caching + incremental build via a content-hash manifest (re-parse only changed files); targets full < 60s / incremental < 5s (measured on real repo when available) | Phase 1 |
| SAC-06 | Impact query: locator → ancestors, marking paths through `indirect`/`unresolved-static` edges as uncertain | Phase 1 |
| SAC-07 | UI-access-path query: locator → list of `{ routeUrl, componentChain }`, flagging lazy / indirect / unresolved segments | Phase 1 |
| SAC-08 | Component locator resolves by `componentId` (MD alias) → `className` → file (path or basename) → `selector`; matching > 1 node → error listing candidates | Phase 1 |
| SAC-09 | `MdIndex`: from a configurable docs folder (recursive), parse each `.md` for `componentId` (table col `コンポーネントID`) and link to a node via `## ソースパス` source path (normalized, resolved vs src root); tolerant (no MD ⇒ `componentId: null`), duplicate id → error, orphan → warning; targeted Markdown extraction | Phase 1 |
| SAC-10 | Deliverable: TS library API + CLI (`cmap index`, `cmap query <locator>`), JSON output | Phase 1 |
| SAC-11 | Extract representative component images from MD (`## 画面レイアウト` `![](path)`) into `node.images[]`, resolved relative to the `.md` | Phase 1 |
| SAC-12 | `cmap query <locator> --html <out>`: single self-contained HTML preview (images base64-embedded, offline) + impact + UI-access-path; full interactive renderer stays Phase 3 | Phase 1 |

## M3 — Phase 2a + 2.5 Requirements (MD Overrides + PR Bot)

**Design spec:** `docs/specs/2026-05-31-phase2-md-overrides-pr-bot-design.md` — brainstorm output 2026-05-31. All map to phase **Phase 2a/2.5** (M3) in ROADMAP.

| REQ-ID | Requirement | Phase |
|---|---|---|
| OVR-01 | Parse a tool-owned `docs/component-map/<componentId>.cmap.yaml` (configurable dir) — versioned schema `{ schemaVersion, componentId, dynamicDeps:[{target,reason?}], notes? }`; tolerant (missing → none, malformed → warning+skip) | Phase 2a |
| OVR-02 | Merge overrides into the graph: each `dynamicDeps.target` resolved via the locator → `resolved` edge `via:'override'`; closes the matching `unresolved-static` flag; unresolvable target → warning | Phase 2a |
| OVR-03 | `cmap gaps` reports components with `unresolved-static`/`indirect` edges not covered by an override (+ construct kinds); a component with none (or all covered) is "complete" | Phase 2a |
| OVR-04 | `cmap gaps --write` scaffolds/updates `.cmap.yaml` for gap components (one entry per detected construct, `reason` auto, `target:""`); **merge-safe** — preserves filled targets, adds new gaps, marks vanished constructs `stale:true`; never overwrites user input | Phase 2a |
| OVR-05 | Surface read-only project-MD description (`機能概要`) on the node / in query + PR output (no MD edit) | Phase 2a |
| BOT-01 | `cmap pr --changed <files>` renders a Markdown comment: per changed component, impact (ancestors + routes), UI access paths, uncertainty/gap warnings + description (pure/testable) | Phase 2.5 |
| BOT-02 | GitHub Action `.github/workflows/component-map-pr.yml`: on PR, diff changed `*.component.ts`, build graph in CI, run `cmap pr`, post/update a sticky PR comment | Phase 2.5 |

## M4 — Phase 2b Requirements (MD Migration + Enforcement)

**Design spec:** `docs/specs/2026-05-31-phase2b-md-migration-enforcement-design.md` — brainstorm output 2026-05-31. All map to phase **Phase 2b** (M4) in ROADMAP. Re-grounded against M3's read-only-MD constraint: the tool never writes/requires MD; it scaffolds the tool-owned `.cmap.yaml` layer and gates on what it owns/reads.

| REQ-ID | Requirement | Phase |
|---|---|---|
| MIG-01 | `cmap migrate` bulk-scaffolds `.cmap.yaml` for every gap-component that has a componentId (repo-wide extension of `gaps --write`) | Phase 2b |
| MIG-02 | `cmap migrate` generates `.cmap-baseline.json` snapshotting current debt (open gaps + missing-MD), keyed by repo-relative filePath | Phase 2b |
| MIG-03 | `cmap migrate` generates a coverage report (md + json) + a missing-MD list (components with `componentId == null`) | Phase 2b |
| ENF-01 | `cmap lint --changed --baseline` blocks ① open gap, ② missing MD, ③ broken/orphan override, + clean→dirty regression; warns ④ stale; exits ≠ 0 on block with fix-path messages | Phase 2b |
| ENF-02 | Waiver: `waived` field in override schema (bump to v2, tolerant of v1); `gaps` + `merge` treat waived entries as covered (no edge, no warning) | Phase 2b |
| ENF-03 | `cmap lint --accept` records current violations into the baseline (deferred debt; still shown in coverage) | Phase 2b |
| ENF-04 | Wire `cmap lint` into the M3 PR workflow as a fail-able step, preserving M3 hardening (env-routed context, no `pull_request_target`) | Phase 2b |

## v2 Requirements (Deferred — later milestones)

| REQ-ID | Requirement | Reason deferred |
|---|---|---|
| (TBD) | Mermaid / standalone HTML interactive renderer | Phase 3 |
| (TBD) | VSCode snippet / dev-helper UX | Phase 3 |

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

2026-05-31
