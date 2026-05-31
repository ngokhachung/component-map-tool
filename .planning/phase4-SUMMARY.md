# M6 — Phase 4 (Long-term Maintenance): Summary

**Milestone:** M6 — Long-term Maintenance (FINAL planned milestone)
**Date:** 2026-06-01
**Branch:** feature/phase4-maintenance-2026-05-31 → merged to master
**Outcome:** ✅ **Shipped** — `cmap audit` (git-based maintenance report), Azure DevOps Pipelines replacing the GitHub Actions CI, and the maintenance docs. **This completes the planned project roadmap (M1–M6).**

## What shipped

- **`cmap audit`** (`tool/src/audit/`): a maintenance report — **git-based stale docs** (a component committed more recently than its linked MD or `.cmap.yaml` — the time signal M4's lint gate couldn't use) + coverage + override **orphans** + open **gaps**, rendered to markdown/json (`--report <prefix>`). Pure `auditReport` over injected mtimes; the CLI populates them via `git log -1 --format=%ct`.
- **Azure DevOps Pipelines (replace the GitHub Actions workflow):**
  - `azure-pipelines-pr.yml` — on PRs touching `*.component.ts`: sticky PR-thread comment (port of M3) via Azure REST + a fail-able `cmap lint` gate (port of M4). Token via `$(System.AccessToken)` mapped through `env`; body via `jq --rawfile`; branch ref stripped — **injection-safe** (the M3 bug was not reintroduced).
  - `azure-pipelines-audit.yml` — quarterly cron (`0 9 1 1,4,7,10 *`) → `cmap audit` → build summary (`##vso[task.uploadsummary]`) + published artifact.
  - Deleted `.github/workflows/component-map-pr.yml` + its two text-validation tests.
- **Docs:** `docs/COMPATIBILITY.md` (Angular matrix + upgrade-verify checklist), `docs/SCHEMA.md` (the three schema versions + semver + breaking→migration rule), `CHANGELOG.md` (M1–M6), `docs/accuracy-sampling-checklist.md` (manual quarterly process), README "CI & maintenance" section.

## Requirements (M6)

| REQ-ID | Status |
|---|---|
| MNT-01 `cmap audit` | ✅ |
| AZ-01 Azure PR pipeline (+ remove GitHub workflow) · AZ-02 scheduled audit pipeline | ✅ |
| DOC-01 compatibility matrix · DOC-02 schema policy + CHANGELOG · DOC-03 accuracy checklist | ✅ |

## Verification

- **161 tests / 45 files**, `tsc --noEmit` clean, coverage **98.17% lines / 88.67% branch / 98.6% func / 98.17% stmt** (gate ≥80%).
- **Goal-backward verification:** PASS (6/6 REQ — `phase4-VERIFICATION.md`).
- **Final holistic review (opus):** found **1 Critical** — md-staleness silently never fired (docs-relative `docPath` keyed/queried raw, asymmetric with component/override keys). **Fixed** (commit 444a54d): symmetric `posix.join(docs, docPath)` on both CLI + report sides, `docs` threaded through `AuditOpts`, + guard and 2 unit tests. **Re-review: RESOLVED.**
- **Manual UAT: deferred** — `phase4-UAT.md`.

## Key design decisions

- **Azure DevOps pivot:** team CI is Azure DevOps; the `cmap` CLI stays platform-agnostic, and Azure Pipelines **replace** the GitHub Actions workflow (Azure-only, user choice). Removing the GitHub workflow leaves no CI on github.com until the repo moves to Azure Repos (accepted).
- **Git-based staleness** lives only in the audit (CI has full history); M4's lint gate stays timestamp-free.
- Azure PR comment authed via the built-in `$(System.AccessToken)` (no PAT to manage); prerequisites documented in the README.

## Carry-forward / backlog

- **UAT debt (all milestones):** run `phase2-UAT.md` (M3), `phase2b-UAT.md` (M4), `phase3-UAT.md` (M5), `phase4-UAT.md` (M6) against a real Angular repo.
- **Live Azure verification:** the PR-comment REST flow + the cron audit are text-validated only — verify on a first real PR + scheduled run in the Azure DevOps project. Configure the OAuth-token prereqs + Build Validation branch policy, and commit a `.cmap-baseline.json` (generated with `cmap migrate`, same `--root` as CI).
- **QA suggestions:** batch `gitMtimes` into one `git log` pass for very large repos; document the repo-root CWD coupling in `mtime.ts`; minor lambda rename in `report.ts`.
- **Deferred features (never scoped):** VSCode extension (Phase 3 out-of-scope); multi-version Angular parser (compatibility matrix documents the pinned version + verify-on-upgrade instead).

## Decision

M6 (Long-term Maintenance) is **complete and shipped**. **The planned project roadmap M1–M6 is complete.** Remaining work is operational: run the deferred UATs and verify the Azure pipelines live before production rollout.
