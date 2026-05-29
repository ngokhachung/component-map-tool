# Phase 0 — Goal-Backward Verification

**Date:** 2026-05-29
**Phase:** M1 — Phase 0 POC Validation
**Mode:** A
**Branch:** feature/phase0-poc-2026-05-29

Cross-references each plan's `must_haves` (observable truths / required artifacts / key links) against delivered implementation artifacts and observed command output.

## Observable Truths

| Truth (from plans) | Evidence | Status |
|---|---|---|
| Smoke parses a trivial Angular 19 template standalone, 0 parse errors | `npm run smoke` → `parseErrorCount:0`, tags `[app-foo,div,app-bar]`, selectorMatched `FooComponent`, tsMorphClass `A`, exit 0 (T1) | ✅ |
| `npx vitest run` green | `npm test` → 19/19 across diff/report/report-all (re-run after fixes) | ✅ |
| Harness fails on mismatch and on parseErrors>0 | `report.test.ts` asserts both; green | ✅ |
| Component spike: correct for ≥5 NgModule AND ≥5 standalone | `spike:component` → 11/11, `meta.standalonePassed:6`, `meta.ngModulePassed:5` | ✅ |
| Routing spike: recovers lazy path+symbol, flags unresolvable | `spike:routing` → 5/5; `dynamic.routes` → `unresolvedLazy:true`; `app.routes` recovers AdminModule/ProfileComponent + authGuard | ✅ |
| Template spike: resolves static/structural/control-flow/@defer; flags indirect + unresolved-static; parseErrors 0 | `spike:template` → 5/5; canary `control-flow` resolves under @if/@for/@switch (counts exact); `dynamic` → ng-content/ngTemplateOutlet indirect, ngComponentOutlet unresolved-static; `defer-messy` → @defer child + attribute/multi selectors | ✅ |
| FEASIBILITY-REPORT.md with per-task counts + computed verdict | `npm run report` → `poc/FEASIBILITY-REPORT.md`, **Overall verdict: GO** | ✅ |

## Required Artifacts

| Artifact | Present? |
|---|---|
| ESM workspace (package.json type:module, tsconfig NodeNext, vitest.config) | ✅ |
| `poc/types.ts` shared contracts (+ `TaskReport.meta?`) | ✅ |
| `poc/spikes/lib/load-fixtures.ts` | ✅ |
| `poc/spikes/smoke.ts` | ✅ |
| `poc/harness/diff.ts` + `report.ts` (+ tests) | ✅ |
| `poc/spikes/spike-component.ts` + 11 component fixtures (6 standalone / 5 NgModule) | ✅ |
| `poc/spikes/spike-routing.ts` + 5 routing fixtures (incl. unresolvable lazy) | ✅ |
| `poc/spikes/lib/template-visitor.ts` + `spike-template.ts` + selectors.json + 5 template fixtures (incl. @defer + messy) | ✅ |
| `poc/spikes/report-all.ts` (+ test) + `poc/FEASIBILITY-REPORT.md` | ✅ |

## Key Links (wired, not just created)

| Link | Verified |
|---|---|
| ESM-only @angular/compiler → package.json type:module + tsx | ✅ smoke runs ESM |
| parseTemplate errors → harness FAIL | ✅ `scoreCase(parseErrors>0)` → pass:false (tested) |
| Spikes import shared types + harness + loader | ✅ all three import `../types.js`, `../harness/report.js`; component/routing use `loadFixtures` |
| report-all imports run{Component,Routing,Template}Spike | ✅ aggregates 3 spikes, applies gate |
| Component gate on ≥5-each-type (not rate band) | ✅ `verdictForComponent` uses `meta` (tested incl. meta-missing→NO-GO) |
| Visitor recurses block children | ✅ canary control-flow resolves under @if/@for/@switch/@defer |
| SelectorMatcher (not hand-rolled) | ✅ attribute `button[appConfirm]` + multi `app-a,app-b` matched |

## Requirement Coverage

| REQ-ID | Covered by | Status |
|---|---|---|
| POC-01 | spike-component 11/11 (6 standalone + 5 NgModule), signal+decorator+alias+model+NgModule membership | ✅ |
| POC-02 | spike-routing 5/5, lazy literal path+symbol, children, guards, unresolvable-lazy flag | ✅ |
| POC-03 | spike-template resolved: static/*ngIf/*ngFor/@if/@for/@switch/@defer | ✅ |
| POC-04 | spike-template indirect (ng-content, ngTemplateOutlet) + unresolved-static (ngComponentOutlet, @ViewChild, ViewContainerRef) | ✅ |
| POC-05 | report-all → FEASIBILITY-REPORT.md with per-task counts + GO/NO-GO verdict | ✅ |

## Gaps / Deviations

- **Idempotency bug found & fixed during execution:** `spike-template` originally iterated all files in the fixtures dir, tripping over generated `*.actual.json` on re-run. Fixed to iterate only `.html`/`.ts` sources; verified stable across consecutive `npm run report` runs. (commit c9bf12c)
- **Smoke assertion correction (T1):** filters to hyphenated tags because the visitor descends `Template` children — confirms research P-DC1; no scope impact.
- **Ground-truth bias (research P-M1):** all `expected.json` were hand-authored to the documented shapes; spikes passed first-run. Fixtures are deliberately simple synthetic cases. Risk acknowledged in spec; raw counts surfaced in the report. Phase 1 should validate against a real repo.

## Verdict

**Phase 0 goal MET.** All three parsing assumptions validated against Angular 19; `FEASIBILITY-REPORT.md` = **GO**. No open gaps blocking the milestone. Phase-1 risk notes captured (multi-version compiler strategy, shared ts-morph Project, multi-match dedup, real-repo validation).
