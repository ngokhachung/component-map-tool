# Phase 0 — Feasibility Report

**Generated:** see git commit date  
**@angular/compiler pinned:** 19.2.14  
**Overall verdict: GO**

> Gate (spec §5): NO-GO if routing or template <=50%; GO-with-caveats 50-80%; confident GO >=80% per task AND component correct for >=5 of each type.

## Per-task results

### component — GO
Pass rate: **11/11** (100%)
Type split: standalone 6 correct, NgModule 5 correct (gate: >=5 each)

| Fixture | Result | Borderline | Notes |
|---|---|---|---|
| accordion | PASS |  | ok |
| breadcrumb | PASS |  | ok |
| chart | PASS |  | ok |
| data-table | PASS |  | ok |
| icon-button | PASS |  | ok |
| legacy-widget | PASS |  | ok |
| nav-bar | PASS |  | ok |
| search-box | PASS |  | ok |
| tab-panel | PASS |  | ok |
| tooltip | PASS |  | ok |
| user-card | PASS |  | ok |

### routing — GO
Pass rate: **5/5** (100%)


| Fixture | Result | Borderline | Notes |
|---|---|---|---|
| app.routes | PASS |  | ok |
| dynamic.routes | PASS |  | ok |
| feature.routes | PASS |  | ok |
| module-routing.module | PASS |  | ok |
| nested.routes | PASS |  | ok |

### template — GO
Pass rate: **5/5** (100%)


| Fixture | Result | Borderline | Notes |
|---|---|---|---|
| control-flow | PASS |  | ok |
| defer-messy | PASS |  | ok |
| dynamic | PASS |  | ok |
| vcr | PASS |  | ok |
| viewchild | PASS |  | ok |

## Notes & risks carried to Phase 1

- @angular/compiler template API is experimental/private and version-sensitive — GO is scoped to Angular 19 only; Phase 1 should evaluate the bundled-compiler vendoring pattern for multi-version (research P-AC2).
- Import paths used: `parseTemplate`, `TmplAst*`, `CssSelector`, `SelectorMatcher` from `@angular/compiler`; `Project` from `ts-morph`.
- Component coverage: 11 components; standalone passed 6, NgModule passed 5 (requirement: >=5 each).
- Borderline cases (if any) are flagged in the tables above — review before trusting the percentage.
