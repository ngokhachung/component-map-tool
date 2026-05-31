# M4 — Phase 2b (MD Migration + Enforcement): Summary

**Milestone:** M4 — MD Migration + Enforcement
**Date:** 2026-05-31
**Branch:** feature/phase2b-md-migration-enforcement-2026-05-31 → merged to master
**Outcome:** ✅ **Shipped** — repo-scale migration prep + a mandatory, baseline-grandfathered CI gate that blocks NEW documentation debt. (Manual UAT deferred; goal-backward verification + final review passed.)

## What shipped

Built on M3's tool-owned `.cmap.yaml` overrides layer:

- **`cmap migrate`** (`cli/migrate.ts`): one command to prepare a repo for enforcement — bulk-scaffolds `.cmap.yaml` for every gap-component with a componentId (reuses M3 `scaffoldGaps`), snapshots all current debt into **`.cmap-baseline.json`** (keyed by repo-relative filePath), and writes a **coverage report** (`cmap-coverage.md` + `.json`) with MD coverage, dynamic-dep fill rate, and the missing-MD list.
- **`cmap lint --changed <files> --baseline <p>`** (`cli/lint.ts`): the gate. `computeIssues` derives per-component issue codes — `missing-md`, `gap:<reason>` (undocumented dynamic dep), `override-broken:<target>`; `lintChanged` restricts to changed components and **blocks only NEW debt** (codes not in baseline) + clean→dirty **regressions**; stale entries → warnings. Exit ≠ 0 on block, with fix-path messages.
- **Baseline grandfather rollout** (`cli/baseline.ts`): pre-existing debt is warned, not blocked — so turning the gate on doesn't red every PR on day one.
- **Two escape hatches:** `waived: true` in `.cmap.yaml` (intentionally dynamic ⇒ no gap, no edge — `DynamicDep.waived?`, honored in `gaps`/`merge`/`lint`); and **`cmap lint --accept`** (record current violations into the baseline — deferred debt, still shown in coverage).
- **CI gate** (`.github/workflows/component-map-pr.yml`): a fail-able `cmap lint` step added **after** the M3 comment step (comment always posts; gate then blocks), env-routed `$CHANGED_FILES`, no `pull_request_target` — M3 hardening intact.

## Requirements (M4)

| REQ-ID | Status |
|---|---|
| MIG-01 bulk scaffold · MIG-02 baseline snapshot · MIG-03 coverage + missing-MD | ✅ |
| ENF-01 lint gate (block ①②③ + regression, warn ④) · ENF-02 waiver · ENF-03 accept-baseline · ENF-04 CI wiring | ✅ |

## Verification

- **132 tests / 35 files**, `tsc --noEmit` clean, **coverage 98.28% lines / 89.13% branch / 100% func / 98.28% stmt** (gate ≥80%).
- **End-to-end on real Angular 15** (`lint-integration.test.ts`): `missing-md` blocks without a baseline → grandfathered after `--accept`; a real `ngComponentOutlet` gap on ReportDashboardPage is closed by a `waived` override.
- **Goal-backward verification:** PASS (7/7 REQ — `phase2b-VERIFICATION.md`).
- **Final holistic review (opus):** APPROVED — 0 Critical; 1 Important (baseline `--root` invariant) **mitigated** (doc note in workflow + migrate output; fail-safe = over-blocks); suggestions → backlog.
- **Manual UAT: deferred** — checklist in `.planning/phase2b-UAT.md`.

## Key design decisions

- Re-grounded vs **read-only MD**: "migration" scaffolds the tool-owned layer + reports missing MD (never writes MD); "enforcement" gates only on tool-owned/readable signals.
- **No `OVERRIDE_SCHEMA_VERSION` bump** — `waived?` is an optional additive field (vs spec §4's v2 bump); avoids churning existing v1 files. (User-approved deviation.)
- **③ broken-override blocking scope** = unresolvable/orphan *target* (attributable to a changed component); malformed override *files* → non-blocking warnings (can't attribute under the filePath-keyed grandfather model).
- `migrate` and `lint` share a single `computeIssues` ⇒ baseline codes are byte-identical to lint-diff codes (grandfathering can't silently drift).

## Carry to M5 (Phase 3) / backlog

- **Operational:** `migrate` (local) and CI `cmap lint` must use the same `--root` (documented; fail-safe). Commit a `.cmap-baseline.json` before enabling the gate.
- **QA suggestions:** share the construct-filter between `migrate.ts` and `gaps.ts`; `=== null` guard consistency in `computeIssues`; guard the `.md`→`.json` no-op; baseline schemaVersion migration when v2 lands; add a combined `missing-md + gap` unit test.
- **UAT debt:** run `phase2b-UAT.md` (and the still-pending `phase2-UAT.md` from M3) against a real Angular repo before production rollout.
- **M5 — Phase 3:** Mermaid + standalone HTML interactive renderer + CLI UX.

## Decision

M4 (MD Migration + Enforcement) is **complete and shipped**. Next: **M5 — Phase 3 (Renderer & UX)** when ready. Run the deferred UAT checklists against a real repo before enabling the CI gate in production.
