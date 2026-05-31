# M3 — Phase 2a + 2.5 (MD Overrides + PR Bot): Summary

**Milestone:** M3 — MD Overrides + PR Bot
**Date:** 2026-05-31
**Branch:** feature/phase2-md-overrides-pr-bot-2026-05-31 → merged to master
**Outcome:** ✅ **Shipped** — dynamic-dep gaps are documentable via a tool-owned overrides layer, and a PR bot surfaces impact on PRs. (Manual UAT deferred; automated verification + QA passed.)

## What shipped

Built on the Phase 1 `tool/` package:

- **Overrides layer** (`tool/src/overrides/`): a tool-owned `.cmap.yaml` per component (keyed by `componentId`) declaring `dynamicDeps[].target`. `readOverrides` (js-yaml, tolerant — per-file try/catch, skip unknown schemaVersion, dup-id warn) + `applyOverrides` (resolve target via the locator → `via:'override'` resolved edge; skip `stale`/empty; dedup; **cycle-warn**; unresolvable/duplicate warn).
- **Gap-driven workflow**: `findGaps` lists components with **pinnable** undocumented dynamic constructs (`ngComponentOutlet`/`@ViewChild`/`createComponent`); `scaffoldGaps` (`cmap gaps --write`) writes **merge-safe** skeletons (one entry per construct, `target:""`, preserve filled targets, mark vanished `stale`, idempotent LF). Structural `ng-content`/`ngTemplateOutlet` are not flagged (QA S1).
- **MD enrichment**: read the read-only project MD `機能概要` → `node.description` (OVR-05). Project MD never edited.
- **PR bot**: `renderPrComment` (pure — hidden marker, per-component impact/access-paths/gaps/description, ancestor cap, 65 KB truncation) + `cmap pr --changed`; a GitHub Action (`.github/workflows/component-map-pr.yml`) that diffs changed `*.component.ts`, builds the graph, and posts a sticky PR comment.
- **Data model**: `Edge.via` += `'override'`, `ComponentNode.description`, `SCHEMA_VERSION` → 2.

## Requirements (M3)

| REQ-ID | Status |
|---|---|
| OVR-01 schema + tolerant parser · OVR-02 merge (`via:'override'`, skip stale, cycle-warn) | ✅ |
| OVR-03 gaps report · OVR-04 merge-safe scaffold | ✅ |
| OVR-05 MD description | ✅ |
| BOT-01 PR comment renderer + `cmap pr` · BOT-02 GitHub Action | ✅ |

## Verification

- **110 tests / 28 files**, `tsc --noEmit` clean, **coverage 98.2% lines / 89% branch / 99% func**.
- **End-to-end on real Angular 15**: documenting `ReportDashboardPage`'s `ngComponentOutlet` (temp MD componentId + `.cmap.yaml` target) adds the `via:'override'` edge to `PaymentSummaryComponent` and removes it from `findGaps`.
- **QA Gate**: APPROVE WITH CONDITIONS → fixed: **I1** (Action command-injection — GitHub-context values routed via `env`, not interpolated into `run:`), **S1** (gaps flag only pinnable `unresolved-static` constructs).
- **Goal-backward verification**: PASS (7/7 REQ). **Manual UAT: deferred** — checklist in `.planning/phase2-UAT.md`.

## Key design decisions

- Project MD is **read-only**; dynamic-dep documentation lives in a **separate tool-owned `.cmap.yaml`** the tool **scaffolds** (user fills only `target`) — gap-driven, low-friction.
- Gap "construct identity" = the edge's fixed `reason` label (stable), so scaffold re-runs never orphan filled targets.
- PR bot uses `on: pull_request` (writable token for same-repo PRs), **never `pull_request_target`**.

## Carry to Phase 2b (M4) / backlog

- **Mandatory CI linter + MD migration** for all components → Phase 2b (M4).
- QA suggestions: S2 randomized heredoc delimiter in the Action; S3 warn on duplicate hand-authored `reason`.
- **500-component perf benchmark** still deferred; the Action adds `actions/cache` for `.cmap` to amortize CI rebuilds.
- Interactive renderer / Mermaid → Phase 3.

## Decision

M3 (MD Overrides + PR Bot) is **complete and shipped**. Next: **M4 — Phase 2b (MD Migration + Enforcement)** when ready. Manual UAT to be run against a real repo before enabling the PR-bot Action in production.
