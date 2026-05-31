# M6 — Phase 4: Goal-Backward Verification

**Milestone:** M6 — Long-term Maintenance (FINAL planned milestone) · **Date:** 2026-05-31
**Branch:** feature/phase4-maintenance-2026-05-31
**Method:** cross-reference each plan's `must_haves` + each REQ-ID against the shipped implementation + tests.

---

## REQ coverage (6/6)

| REQ-ID | Requirement | Implementation | Test evidence | ✔ |
|---|---|---|---|---|
| MNT-01 | `cmap audit` — git-based stale + coverage + orphans + gaps (md/json) | `audit/report.ts` (`auditReport`/`renderAuditMd`) + `audit/mtime.ts` (`gitMtimes`) + `cli/index.ts` `audit` branch | `audit/report.test.ts` (4), `audit/mtime.test.ts` (3), `cli/audit-integration.test.ts` (2) | ✅ |
| AZ-01 | `azure-pipelines-pr.yml` — sticky comment (port M3) + fail-able lint gate (port M4), token via env, injection-safe; GitHub workflow removed | `azure-pipelines-pr.yml`; deleted `.github/workflows/component-map-pr.yml` + 2 tests | `cli/azure-pr.test.ts` (5, incl. token-via-env + workflow-removed) | ✅ |
| AZ-02 | `azure-pipelines-audit.yml` — quarterly cron → `cmap audit` → summary + artifact | `azure-pipelines-audit.yml` | `cli/azure-audit.test.ts` (2) | ✅ |
| DOC-01 | Compatibility matrix + upgrade checklist | `docs/COMPATIBILITY.md` | `cli/docs.test.ts` | ✅ |
| DOC-02 | Schema-evolution policy + CHANGELOG | `docs/SCHEMA.md` + `CHANGELOG.md` | `cli/docs.test.ts` | ✅ |
| DOC-03 | Accuracy-sampling checklist | `docs/accuracy-sampling-checklist.md` | `cli/docs.test.ts` | ✅ |

## must_haves — per plan

- **Plan 1 (audit core):** md + override git-staleness (injected mtimes), override orphans, coverage/gaps passthrough, markdown render ✅; gitMtime epoch/null ✅.
- **Plan 2 (CLI):** `cmap audit` prints md / `--report` writes md+json; key-consistency CLI↔report ✅.
- **Plan 3 (Azure):** PR pipeline (comment+lint, env-token, sticky marker) + audit pipeline (quarterly cron, summary+artifact); GitHub workflow + 2 tests removed ✅.
- **Plan 4 (docs):** compatibility matrix, schema policy + CHANGELOG (M1–M6), accuracy checklist, README CI section ✅.

## Final holistic review (opus) + fix

- Initial verdict: **CHANGES NEEDED — Critical:** md-staleness silently never fired — `docPath` is docs-relative but the CLI keyed/queried it raw (asymmetric with component/override keys), so git couldn't resolve it under `CMAP_DOCS != repo root`.
- **Fixed** (commit 444a54d): both CLI and `auditReport` now key the doc mtime by `posix.join(docs, docPath)` (symmetric with `posix.join(root, filePath)`); `docs` threaded through `AuditOpts`; guard skips when `docs` undefined. +unit test proving md-stale fires with `docs`, +guard test for `docs:undefined`.
- **Re-review: RESOLVED.** Other findings were Suggestions (batch `git log` calls; document the repo-root CWD coupling) → backlog.
- Security: Azure PR pipeline injection-safe — body via `jq --rawfile`, token via `env`, branch stripped, `set -euo pipefail` (the M3 injection bug was NOT reintroduced).
- No regression: index/query/gaps/pr/migrate/lint/render unchanged; audit branch additive; SCHEMA_VERSION untouched; docs match code constants.

## Metrics

- **161 tests / 45 files** green. `tsc --noEmit` clean.
- Coverage **98.17% lines / 88.67% branch / 98.6% func / 98.17% stmt** (gate ≥80%).

## Open items (QA backlog / out-of-scope, non-blocking)

- Suggestions: batch `gitMtimes` into one `git log` pass for large repos; document the "run from repo root" CWD coupling in `mtime.ts`; rename `.map((g)=>)` lambda in report.ts.
- Azure REST sticky-comment behavior is **text-validated only** (no live Azure in CI) — live verification is in the M6 UAT.
- Removing the GitHub workflow leaves no CI on github.com until the repo moves to Azure Repos (accepted).

## Verdict

**PASS — 6/6 REQ implemented + verified; final review Critical fixed and re-review RESOLVED.**
