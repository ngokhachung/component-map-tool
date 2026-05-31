# M6 — Phase 4: Long-term Maintenance — Design Spec

**Milestone:** M6 — Phase 4 (final planned milestone)
**Date:** 2026-05-31
**Brainstorm:** 2026-05-31 (this session)
**Builds on:** M3 (PR-bot, overrides), M4 (`migrate`/`lint`, baseline, coverage), M5 (renderer)
**Status:** Approved (design) — pending spec review + mode gate → writing-plans

---

## 0. Context & key pivot

The v2 plan's Phase 4 has three threads: 4.1 quarterly audit job, 4.2 Angular-upgrade buffer, 4.3 schema-evolution policy — much of it process/docs rather than feature code.

**Pivot (brainstorm):** the team's CI is **Azure DevOps**, not GitHub. The `cmap` CLI is platform-agnostic; only the CI wrapper is platform-specific. M3's PR-bot and M4's lint gate are currently a single **GitHub Actions** workflow. Decision: **replace** it with **Azure Pipelines** equivalents (Azure-only).

> ⚠️ The repo currently lives on github.com/ngokhachung; removing the GitHub workflow means no CI on github.com until the repo moves to Azure Repos. This is a deliberate, user-approved choice.

## 1. Scope

- **`cmap audit`** — platform-agnostic CLI: git-based **stale docs** + **coverage** + **orphans** + **open gaps** → markdown + json.
- **Azure Pipelines (replaces the GitHub workflow):**
  - **PR pipeline** — sticky PR-thread comment (port of M3) + fail-able `cmap lint` gate (port of M4), authed via `$(System.AccessToken)`.
  - **Scheduled audit pipeline** — quarterly cron → `cmap audit` → build summary + artifact.
- **Docs:** compatibility matrix + upgrade checklist; schema-evolution policy + CHANGELOG; accuracy-sampling checklist.

## 2. `cmap audit` (MNT-01)

Pure core `auditReport(graph, overrides, opts: { mtimes: Map<string, number> }): AuditReport` where:
```
AuditReport = {
  stale: { component: string; filePath: string; docPath: string; componentMtime: number; docMtime: number }[];
  coverage: Coverage;                       // reuse migrate.computeCoverage
  orphans: { overrides: string[]; mdDocs: string[] };
  gaps: { component: string; filePath: string; uncovered: string[] }[];   // reuse findGaps
}
```
- **Staleness:** for each component with a linked MD (`docPath`) or an override file, compare the component file's git last-commit-time to the doc's; if the component is newer → stale ("doc may be outdated"). This is the time signal M4's lint gate could not use (no timestamp in the data); it is available here because the audit runs with full git history.
- `mtimes` is **injected** (path → epoch seconds) so `auditReport` is pure/testable. The CLI populates it via `git log -1 --format=%ct -- <file>` per relevant file.
- **Orphans:** override `componentId`s matching no node's `componentId`; MD docs that linked to no component (reuse `enrichGraph` orphan warnings / recompute from `MdIndex`).
- Rendered to markdown (sections: Stale, Coverage, Orphans, Open gaps) + json. CLI `audit` branch: `buildEnriched` → populate mtimes → `auditReport` → write `--out`/print.

## 3. Azure Pipelines

### `azure-pipelines-pr.yml` (AZ-01) — port of M3 + M4
- `pr:` trigger, `paths: include: ['**/*.component.ts']`; `pool: vmImage: ubuntu-latest`.
- Steps: `checkout` with `fetchDepth: 0` → `NodeTool@0` (node 20) → `npm --prefix tool ci`.
- Changed files: `git diff --name-only --diff-filter=ACMR "origin/$(System.PullRequest.TargetBranch)...HEAD" -- '*.component.ts'`.
- Comment: `npm --prefix tool run --silent cmap -- pr ... > body.md`; sticky PR-thread comment via Azure REST:
  - `GET https://dev.azure.com/.../pullRequests/$(System.PullRequest.PullRequestId)/threads` → find a thread whose first comment contains the marker `<!-- cmap-pr-bot -->`.
  - update (`PATCH .../threads/{id}/comments/{cid}`) or create (`POST .../threads`).
  - Auth: `Authorization: Bearer $SYSTEM_ACCESSTOKEN` (token mapped via `env:`, never interpolated). Body passed to `jq --rawfile` (no shell interpolation of report content). Changed filenames only feed `cmap pr` (controlled markdown out) — injection-safe.
- Gate: a final `cmap lint --changed "$CHANGED_FILES" --baseline .cmap-baseline.json` step; non-zero exit fails the build → blocks the PR via an Azure branch-policy build validation.
- **Removes** `.github/workflows/component-map-pr.yml`.

### `azure-pipelines-audit.yml` (AZ-02)
- `schedules: - cron: '0 9 1 1,4,7,10 *'` (09:00 on day 1 of Jan/Apr/Jul/Oct = quarterly), `always: true`, `branches: include: [main, master]`; manual run allowed by default.
- Steps: `checkout fetchDepth: 0` → node → `npm --prefix tool ci` → `cmap audit --root ... --out audit` (writes `audit.md` + `audit.json`) → `echo "##vso[task.uploadsummary]$(System.DefaultWorkingDirectory)/audit.md"` → `PublishPipelineArtifact@1` (the report).

### Prerequisite (documented in README)
Enable "Allow scripts to access the OAuth token" on the pipeline + grant the build service identity "Contribute to pull requests" on the repo.

## 4. Files

**New:**
- `tool/src/audit/report.ts` — `AuditReport`, `auditReport`, `renderAuditMd`.
- `tool/src/audit/mtime.ts` — `gitMtimes(paths): Map<string, number>` (shells `git log -1 --format=%ct`); isolated so `report.ts` stays pure.
- `tool/src/cli/index.ts` — `audit` command branch (+ `--out` reuse).
- `azure-pipelines-pr.yml`, `azure-pipelines-audit.yml` (+ `tool/src/cli/azure-pipelines.test.ts` text-validation).
- `docs/COMPATIBILITY.md`, `CHANGELOG.md`, `docs/SCHEMA.md`, `docs/accuracy-sampling-checklist.md`; a README "CI / maintenance" section.

**Removed:** `.github/workflows/component-map-pr.yml` (+ its `tool/src/cli/workflow.test.ts` / `workflow-lint.test.ts` retargeted to the Azure YAMLs).

## 5. Requirements (M6)

| REQ-ID | Requirement |
|---|---|
| MNT-01 | `cmap audit` — git-based stale docs + coverage + orphans + open gaps → markdown/json (pure `auditReport` + injected mtimes + CLI) |
| AZ-01 | `azure-pipelines-pr.yml` — sticky PR-thread comment (port M3) + fail-able `cmap lint` gate (port M4), `$(System.AccessToken)`, injection-safe; remove the GitHub workflow |
| AZ-02 | `azure-pipelines-audit.yml` — quarterly scheduled `cmap audit` → build summary + published artifact |
| DOC-01 | README compatibility matrix (Angular 15.x verified) + Angular-upgrade verify checklist |
| DOC-02 | `docs/SCHEMA.md` (schemaVersions graph=2/override=1/baseline=1, semver, breaking→migration rule) + `CHANGELOG.md` |
| DOC-03 | `docs/accuracy-sampling-checklist.md` — manual quarterly accuracy verification process |

## 6. Testing

- **Unit (pure):** `auditReport` — staleness with injected mtimes (component newer → stale; doc newer → not), orphans, gaps passthrough, coverage passthrough; `renderAuditMd` markers.
- **Integration:** `cmap audit` on `poc/real-sample` (no MD → all components surface as missing-MD/uncovered; runs without git errors using real `gitMtimes`).
- **Azure YAML text-validation** (mirror M3/M4 workflow tests): both YAMLs parse-check via assertions — `System.AccessToken` only via `env:` (no `$(System.AccessToken)` inside a `script:` body that builds a URL/string with it), no PAT literal, `fetchDepth: 0`, `cron` present in audit, `cmap -- lint` + `--baseline` present in PR, marker-based sticky logic present.
- Coverage gate ≥80% held. Docs not tested.

## 7. Out of scope

- Retaining GitHub Actions (replaced by Azure).
- Slack / Azure Boards / Wiki delivery (build-summary + artifact only).
- Automating accuracy sampling (manual by nature — checklist only).
- Multi-version Angular parser support (the compatibility matrix documents the single pinned version + the verify-on-upgrade process).

## 8. Acceptance

- `cmap audit` produces a stale/coverage/orphans/gaps report (md+json) on real-sample without error.
- Both Azure Pipelines YAMLs pass the text-validation tests (auth via env, no PAT, cron, fetch-depth, lint gate, sticky marker); the GitHub workflow is removed.
- Compatibility matrix, schema-evolution doc + CHANGELOG, and accuracy-sampling checklist exist.
- Full suite + `tsc --noEmit` clean; coverage ≥80%.
