# M3 (Phase 2a + 2.5) — Goal-Backward Verification

**Milestone:** M3 — MD Overrides + PR Bot · **Date:** 2026-05-31
**Branch:** feature/phase2-md-overrides-pr-bot-2026-05-31 (21 commits on top of master)
**Evidence:** `cd tool && npm run test:cov` → 109 tests / 28 files, coverage **98.2% lines / 89.0% branch / 99.0% func** + `npx tsc --noEmit` clean.

## REQ coverage

| REQ-ID | Artifact | Verified by | Status |
|---|---|---|---|
| OVR-01 schema + tolerant parser | `overrides/schema.ts`, `parse.ts` | `schema.test.ts`, `parse.test.ts` (malformed/unknown-version/dup → warn+skip) | ✅ |
| OVR-02 merge (`via:'override'`, skip stale, cycle-warn) | `overrides/merge.ts` | `merge.test.ts` + `integration.test.ts` (real-sample edge) | ✅ |
| OVR-03 gaps report | `overrides/gaps.ts` `findGaps` + `cmap gaps` | `gaps.test.ts`, `cli/index.test.ts` | ✅ |
| OVR-04 merge-safe scaffold | `overrides/gaps.ts` `scaffoldGaps` + `cmap gaps --write` | `gaps.test.ts` (preserve filled, stale-mark, idempotent) | ✅ |
| OVR-05 MD description | `md/parse.ts`, `index.ts` (`機能概要`→`node.description`) | `md/parse.test.ts`, `md/index.test.ts` | ✅ |
| BOT-01 PR comment renderer + `cmap pr` | `cli/pr.ts`, `cli/index.ts` | `cli/pr.test.ts`, `cli/index.test.ts` | ✅ |
| BOT-02 GitHub Action | `.github/workflows/component-map-pr.yml` | `cli/workflow.test.ts` (trigger/permissions/concurrency/diff/sticky/no pull_request_target) | ✅ |

## Observable truths (from plan must_haves) — confirmed

- Project MD stays **read-only**; the override layer is a **separate tool-owned `.cmap.yaml`** the tool **scaffolds** (`gaps --write`) and the user fills (`target`). ✅
- Override merge adds `via:'override'` resolved edges, **skips stale**, dedups, **warns on cycle / unresolvable / duplicate id**; js-yaml `load()` per-file try/catch (tolerant). ✅
- `findGaps` lists undocumented dynamic constructs (keyed by stable edge `reason`); scaffold **preserves filled targets**, marks vanished constructs `stale`, idempotent LF. ✅
- PR comment: hidden marker, ancestor cap, byte-cap truncation; `cmap pr --changed` maps files→nodes (suffix), skips unmapped. ✅
- Workflow: `pull_request` + `pull-requests: write` + concurrency + `fetch-depth:0` diff + `cmap pr` + `actions/github-script` sticky + **no `pull_request_target`**. ✅
- **End-to-end on real Angular 15:** documenting `ReportDashboardPage`'s `ngComponentOutlet` (MD componentId + `.cmap.yaml` target) adds the `via:'override'` edge to PaymentSummaryComponent and **removes it from `findGaps`**. ✅

## Gaps / deferred (recorded, not blocking M3)

- Mandatory CI linter + MD migration for all components → **Phase 2b (M4)**.
- Interactive renderer / Mermaid → Phase 3. 500-component perf benchmark → still deferred; the Action adds `actions/cache` for `.cmap` to amortize CI rebuilds.
- Workflow `CMAP_ROOT/CMAP_DOCS/CMAP_OVERRIDES` are per-repo adapt-points (template).

## Verdict

All 7 M3 REQ-IDs (OVR-01..05 + BOT-01/02) implemented and verified by automated tests + the real-sample override integration. **Goal-backward verification: PASS** (pending user UAT in `phase2-UAT.md`).
