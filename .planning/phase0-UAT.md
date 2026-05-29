# Phase 0 — UAT (User Acceptance Test)

**Date:** 2026-05-29
**Phase:** M1 — Phase 0 POC Validation
**Branch:** feature/phase0-poc-2026-05-29

This is a CLI/parsing POC, so acceptance is largely automated. Please run the commands below and confirm the observed behavior matches **Expected**, or describe any difference.

## How to run

```powershell
cd D:\project\component-maping\poc
npm install        # if not already installed
npm run smoke      # gate-zero: compiler + ts-morph standalone
npm test           # 19 unit tests (harness + verdict functions)
npm run report     # runs all 3 spikes, writes FEASIBILITY-REPORT.md
```

## Acceptance criteria

| # | Criterion | Expected | How to confirm |
|---|---|---|---|
| AC-1 | Gate-zero | `npm run smoke` prints `parseErrorCount:0`, exit 0 | terminal output |
| AC-2 | Unit tests | `npm test` → 19 passed | terminal output |
| AC-3 | Component (POC-01) | 11/11, standalone 6 / NgModule 5 | report "component — GO" |
| AC-4 | Routing (POC-02) | 5/5, incl. `dynamic.routes` flagged unresolvable | report "routing — GO" |
| AC-5 | Template (POC-03/04) | 5/5, parseErrors 0; indirect + unresolved-static flagged | report "template — GO" |
| AC-6 | Verdict (POC-05) | `FEASIBILITY-REPORT.md` → **Overall verdict: GO** | top of report file |

## Expected result

All ACs pass; **Overall verdict: GO** — meaning the three hardest parsing assumptions (component metadata, routing, template dependencies) are validated against Angular 19, and Phase 1 (Static Analysis Core) is cleared to start.

## Your confirmation

- [ ] Ran the commands; all acceptance criteria match Expected → **confirm GO**
- [ ] Something differed (describe below)

Notes / differences observed:

_(your input)_
