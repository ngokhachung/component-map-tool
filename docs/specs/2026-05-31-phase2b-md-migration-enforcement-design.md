# M4 — Phase 2b: MD Migration + Enforcement — Design Spec

**Milestone:** M4 — Phase 2b
**Date:** 2026-05-31
**Brainstorm:** 2026-05-31 (this session)
**Builds on:** M3 — MD Overrides + PR Bot (`docs/specs/2026-05-31-phase2-md-overrides-pr-bot-design.md`)
**Status:** Approved (design) — pending spec review + mode gate → writing-plans

---

## 0. Reconciliation with the read-only-MD constraint (foundation)

The original v2 plan (`specs/component-map-plan-v2.md`, Phase 2b) predates M3. It said *"auto-generate skeleton **MD**"* and *"block PR if component changed but **MD** not updated."* M3 established that **project MD is read-only** — the tool must never write or require edits to it; dynamic-dep documentation lives in a separate **tool-owned** `.cmap.yaml` overrides layer.

M4 is therefore re-grounded:

- **"Migration"** does **not** mean *generate MD*. It means: scaffold the tool-owned `.cmap.yaml` layer at repo scale, snapshot existing debt, and report coverage. The tool only **reads** MD presence (componentId); it **reports** components missing MD so the team can create those docs manually.
- **"Enforcement"** does **not** mean *force MD edits*. The mandatory CI gate checks only what the tool **owns** (`.cmap.yaml` gaps, override integrity) and what it can **read** (MD/componentId presence).

## 1. Architecture — two new capabilities, maximal reuse of M3

```
cmap migrate   → prepare the repo for enforcement (run once / periodically)
cmap lint      → the gate (runs local + CI; exit ≠ 0 on NEW debt)
```

Both build the graph via the existing `buildEnriched` (`tool/src/cli/index.ts`); neither touches the core indexer / route parser / query layer.

## 2. `cmap migrate` — generates four artifacts

1. **Bulk scaffold** — scan the whole repo, run `scaffoldGaps` (M3) for **every** component that has a gap **and** a componentId (extends `gaps --write` from per-call to repo-wide). Dev only fills `target`.
2. **Baseline** `.cmap-baseline.json` — snapshot of all current debt (open gaps + components missing MD), keyed by **repo-relative filePath** (stable, matches git-diff paths). Committed to the repo.
3. **Coverage report** `cmap-coverage.md` (+ `.json`) — total components, % with MD, % of gaps filled. Tracks the acceptance targets ("100% skeleton / ≥30% filled").
4. **Missing-MD list** — components with `componentId == null` (cannot be scaffolded) → the team must create MD docs for them. Tool never creates MD (read-only).

## 3. `cmap lint` — the gate algorithm

For each component **changed by the PR** (matched with `pathSuffixMatch`, same as `cmap pr`):

| Condition | Behavior |
|---|---|
| ① **open gap** — an `unresolved-static` construct not filled **and not waived** | **BLOCK** if not already recorded in baseline |
| ② **missing MD** — `componentId == null` | **BLOCK** if not already recorded in baseline |
| ③ **broken/orphan override** — malformed schema/version, unresolvable `target`, orphan id | **BLOCK** if not already recorded in baseline |
| ④ **stale** — construct vanished (`stale: true`) | **WARN** (never blocks) |
| **regression** — component was **clean** in baseline → now **dirty** | **BLOCK** (always, even if baseline exists) |

- Exit `1` if any BLOCK; exit `0` otherwise (warnings still print).
- Each BLOCK message names the component, the issue, and the fix path: *fill `target`* / *add `waived: true`* / *create MD* / *run `cmap lint --accept`*.
- **Rollout = baseline grandfather**: pre-existing debt recorded in baseline is warned, not blocked. Only **new** debt or a clean→dirty **regression** blocks. This avoids turning every PR red on day one.

> **Dropped from v2 plan:** time-based staleness ("MD ≥ 3 months"). Overrides/MD carry no reliable timestamp ⇒ YAGNI. "Stale" means only "the construct disappeared from code."

## 4. Escape hatches (both)

Two distinct, complementary ways to pass the gate legitimately and transparently:

- **Waiver** — add `waived?: boolean` (+ optional `reason`) to `DynamicDep` in the override schema; bump `OVERRIDE_SCHEMA_VERSION 1 → 2` (still tolerant of v1 files). A `waived: true` entry counts as **covered** (no longer a gap), produces **no edge**, and emits **no unresolvable warning**. Semantics: *"intentionally dynamic — there is no static target."* Permanent; the gap disappears from `cmap gaps` and coverage.
- **Accept-baseline** — `cmap lint --accept` writes the currently-failing violations into `.cmap-baseline.json` → commit → green. Semantics: *"acknowledged debt, deferred."* The gap **remains** in the coverage report; it is grandfathered, not resolved.

## 5. CI wiring — single workflow (Option A)

Modify the existing `.github/workflows/component-map-pr.yml`: after the comment step (always green), add a step running `cmap lint --changed <files> --baseline .cmap-baseline.json`. Build the graph once; comment + gate travel together. Preserve all M3 hardening (GitHub-context via `env`, `on: pull_request` not `pull_request_target`, `permissions`, `concurrency`, `fetch-depth: 0`).

## 6. Data model / files touched

- `tool/src/overrides/schema.ts` — `DynamicDep.waived?`, bump `OVERRIDE_SCHEMA_VERSION` to 2, `validate()` accepts the field.
- `tool/src/overrides/gaps.ts` — `coveredReasons` treats `waived` entries as covered.
- `tool/src/overrides/merge.ts` — skip `waived` entries silently (no edge, no warning).
- **New** `tool/src/cli/baseline.ts` — read / write / diff `.cmap-baseline.json`.
- **New** `tool/src/cli/lint.ts` — gate algorithm (§3) + result rendering.
- **New** `tool/src/cli/migrate.ts` — the four outputs (§2) + coverage rendering.
- `tool/src/cli/index.ts` — register `migrate` / `lint` commands; add `--baseline`, `--accept` flags.
- `.github/workflows/component-map-pr.yml` — add the lint step.

### Baseline file shape (illustrative)

```json
{
  "schemaVersion": 1,
  "generated": "2026-05-31",
  "entries": {
    "app/finance/report-dashboard/report-dashboard.page.ts": ["gap:ngComponentOutlet"],
    "app/shared/widgets/legacy-widget.component.ts": ["missing-md"]
  }
}
```

Issue codes: `missing-md`, `gap:<reason>`, `override-broken:<detail>`. A changed component is a BLOCK if any of its current issue codes is absent from its baseline entry (or it has no baseline entry and is dirty).

## 7. Requirements (M4)

| REQ-ID | Requirement |
|---|---|
| MIG-01 | `cmap migrate` bulk-scaffolds `.cmap.yaml` for every gap-component that has a componentId (repo-wide) |
| MIG-02 | `cmap migrate` generates `.cmap-baseline.json` snapshotting current debt, keyed by repo-relative filePath |
| MIG-03 | `cmap migrate` generates a coverage report (md + json) and a missing-MD list |
| ENF-01 | `cmap lint --changed --baseline` blocks ①②③ + regression, warns ④, exits ≠ 0 on block, prints fix-path messages |
| ENF-02 | Waiver: `waived` field in override schema (v2, tolerant of v1); gaps + merge treat waived as covered |
| ENF-03 | `cmap lint --accept` records current violations into the baseline |
| ENF-04 | Wire `cmap lint` into the M3 PR workflow as a fail-able step, preserving M3 hardening |

## 8. Testing

Pure Vitest (M3 style):
- **Unit** — baseline read/write/diff; each lint condition (①②③④ + regression); waiver → covered; migrate's four outputs; coverage math.
- **Integration** — end-to-end on `poc/real-sample`: a component missing MD → BLOCK; add a waiver → green; `cmap lint --accept` → green but still listed in coverage.
- **Workflow** — text-validation of the updated YAML (lint step present, hardening intact).

## 9. Out of scope

- VSCode snippet / dev-helper UX (v2 plan) → Phase 3.
- Time-based staleness.
- Auto-generating MD — permanently out (project MD is read-only).

## 10. Acceptance (milestone)

- `cmap migrate` produces all four artifacts on `poc/real-sample` without error.
- `cmap lint` blocks new debt, passes grandfathered debt, and both escape hatches work — proven by integration tests.
- The PR workflow has a fail-able lint step with M3 hardening intact.
- Full test suite green, `tsc --noEmit` clean.
