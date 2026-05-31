# M6 — Plan 3: Azure Pipelines (PR port + scheduled audit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the GitHub Actions workflow with two Azure DevOps pipelines: a PR pipeline (sticky PR-thread comment + fail-able `cmap lint` gate) and a quarterly scheduled audit pipeline.

**Architecture:** Two tasks. T4 = `azure-pipelines-pr.yml` (ports M3 comment + M4 lint gate; sticky via Azure REST + `$(System.AccessToken)` mapped through `env`; injection-safe) + **delete** `.github/workflows/component-map-pr.yml` and its two orphaned tests + a YAML text-validation test. T5 = `azure-pipelines-audit.yml` (quarterly cron → `cmap audit` → build summary + artifact) + a YAML test.

**Tech Stack:** Azure Pipelines YAML, bash + `curl`/`jq`, vitest (text validation — mirrors the M3/M4 workflow tests; live behavior verified in UAT).

---

```yaml
must_haves:
  observable_truths:
    - "azure-pipelines-pr.yml has a `pr:` trigger on `**/*.component.ts`, `fetchDepth: 0`, runs `cmap -- pr` + a fail-able `cmap -- lint ... --baseline .cmap-baseline.json`, posts a sticky comment (marker `<!-- cmap-pr-bot -->`) via Azure REST with the token mapped through `env` (no `$(System.AccessToken)` inside the Authorization line)."
    - "azure-pipelines-audit.yml has a quarterly `cron`, `fetchDepth: 0`, runs `cmap -- audit --report`, publishes the summary (`##vso[task.uploadsummary]`) + an artifact."
    - "`.github/workflows/component-map-pr.yml` no longer exists; the orphaned workflow tests are removed; the suite stays green."
    - "tsc --noEmit clean."
  required_artifacts:
    - "azure-pipelines-pr.yml"
    - "azure-pipelines-audit.yml"
    - "tool/src/cli/azure-pr.test.ts, tool/src/cli/azure-audit.test.ts"
  required_wiring:
    - "PR pipeline runs the existing `cmap pr`/`cmap lint`; audit pipeline runs `cmap audit` (Plan 2)."
  key_links:
    - "token via env + body via jq --rawfile + filenames only feed cmap → injection-safe (carries M3 I1 fix to Azure) (AZ-01)"
    - "quarterly cron 0 9 1 1,4,7,10 * → Jan/Apr/Jul/Oct (AZ-02)"
```

---

## File Structure

- `azure-pipelines-pr.yml` (repo root) — PR comment + lint gate.
- `azure-pipelines-audit.yml` (repo root) — scheduled audit.
- `tool/src/cli/azure-pr.test.ts`, `tool/src/cli/azure-audit.test.ts` — YAML text validation.
- **Removed:** `.github/workflows/component-map-pr.yml`, `tool/src/cli/workflow.test.ts`, `tool/src/cli/workflow-lint.test.ts`.

---

## Wave 3: Azure Pipelines

### Task 4: PR pipeline (port M3 comment + M4 lint) + remove GitHub workflow

<model>sonnet</model>

<read_first>
- `.github/workflows/component-map-pr.yml` (the workflow being replaced — note the env-routing + sticky logic), `tool/src/cli/workflow.test.ts` + `tool/src/cli/workflow-lint.test.ts` (to be deleted)
- `docs/specs/2026-05-31-phase4-maintenance-design.md` §3 (PR pipeline) + AZ-01
</read_first>

**Files:**
- Create: `azure-pipelines-pr.yml`
- Delete: `.github/workflows/component-map-pr.yml`, `tool/src/cli/workflow.test.ts`, `tool/src/cli/workflow-lint.test.ts`
- Test: `tool/src/cli/azure-pr.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/azure-pr.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const yml = readFileSync('../azure-pipelines-pr.yml', 'utf8');

describe('Azure PR pipeline', () => {
  it('triggers on PR for component files with full history', () => {
    expect(yml).toContain('pr:');
    expect(yml).toContain('**/*.component.ts');
    expect(yml).toContain('fetchDepth: 0');
  });
  it('runs the comment renderer and a fail-able lint gate', () => {
    expect(yml).toContain('cmap -- pr');
    expect(yml).toContain('cmap -- lint');
    expect(yml).toContain('--baseline .cmap-baseline.json');
  });
  it('uses the OAuth token via env, never interpolated into the Authorization line', () => {
    expect(yml).toContain('SYSTEM_ACCESSTOKEN: $(System.AccessToken)');
    const authLines = yml.split('\n').filter((l) => l.includes('Authorization: Bearer'));
    expect(authLines.length).toBeGreaterThan(0);
    for (const l of authLines) {
      expect(l).toContain('$SYSTEM_ACCESSTOKEN');
      expect(l).not.toContain('$(System.AccessToken)');
    }
  });
  it('posts a sticky comment via marker', () => {
    expect(yml).toContain('<!-- cmap-pr-bot -->');
  });
  it('the GitHub workflow has been removed', () => {
    expect(existsSync('../.github/workflows/component-map-pr.yml')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/azure-pr.test.ts`

- [ ] **Step 3: Create `azure-pipelines-pr.yml`** (repo root):

```yaml
# Component Map — PR pipeline (Azure DevOps). Ports the GitHub PR-bot comment + lint gate.
#
# PREREQUISITES (one-time, in Azure DevOps):
#   1. Pipeline setting: enable "Allow scripts to access the OAuth token".
#   2. Grant the build service identity ("<Project> Build Service") "Contribute to pull requests" on the repo.
#   3. Add this pipeline as a Build Validation branch policy on the target branch to BLOCK PRs on lint failure.
# SECURITY: the OAuth token is mapped via `env` (never interpolated into a script); the comment body is
# passed to `jq --rawfile` (no shell interpolation); changed filenames only feed `cmap` (controlled output).
pr:
  branches:
    include: ['*']
  paths:
    include: ['**/*.component.ts']
trigger: none

pool:
  vmImage: ubuntu-latest

variables:
  CMAP_ROOT: src
  CMAP_DOCS: docs/components
  CMAP_OVERRIDES: docs/component-map

steps:
  - checkout: self
    fetchDepth: 0

  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: Use Node 20

  - script: npm --prefix tool ci
    displayName: Install tool deps

  - script: |
      set -euo pipefail
      TARGET="${TARGET#refs/heads/}"
      CHANGED=$(git diff --name-only --diff-filter=ACMR "origin/${TARGET}...HEAD" -- '*.component.ts' | paste -sd, -)
      echo "##vso[task.setvariable variable=CHANGED_FILES]$CHANGED"
    env:
      TARGET: $(System.PullRequest.TargetBranch)
    displayName: Compute changed component files

  - script: |
      set -euo pipefail
      npm --prefix tool run --silent cmap -- pr --root "$CMAP_ROOT" --docs "$CMAP_DOCS" --overrides "$CMAP_OVERRIDES" --changed "$CHANGED_FILES" > body.md
    env:
      CHANGED_FILES: $(CHANGED_FILES)
    displayName: Render PR comment

  - script: |
      set -euo pipefail
      API="$(System.CollectionUri)$(System.TeamProject)/_apis/git/repositories/$(Build.Repository.ID)/pullRequests/$(System.PullRequest.PullRequestId)"
      MARKER="<!-- cmap-pr-bot -->"
      THREADS=$(curl -sf -H "Authorization: Bearer $SYSTEM_ACCESSTOKEN" "$API/threads?api-version=7.1")
      TID=$(echo "$THREADS" | jq -r --arg m "$MARKER" '[.value[]? | select((.comments[0].content // "") | contains($m))][0].id // empty')
      if [ -n "$TID" ]; then
        CID=$(echo "$THREADS" | jq -r --arg m "$MARKER" '[.value[]? | select((.comments[0].content // "") | contains($m))][0].comments[0].id // empty')
        jq -n --rawfile c body.md '{content:$c}' \
          | curl -sf -X PATCH -H "Authorization: Bearer $SYSTEM_ACCESSTOKEN" -H "Content-Type: application/json" -d @- \
            "$API/threads/$TID/comments/$CID?api-version=7.1" > /dev/null
      else
        jq -n --rawfile c body.md '{comments:[{parentCommentId:0,content:$c,commentType:1}],status:1}' \
          | curl -sf -X POST -H "Authorization: Bearer $SYSTEM_ACCESSTOKEN" -H "Content-Type: application/json" -d @- \
            "$API/threads?api-version=7.1" > /dev/null
      fi
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
    displayName: Post/update sticky PR comment

  - script: |
      set -euo pipefail
      npm --prefix tool run --silent cmap -- lint --root "$CMAP_ROOT" --docs "$CMAP_DOCS" --overrides "$CMAP_OVERRIDES" --changed "$CHANGED_FILES" --baseline .cmap-baseline.json
    env:
      CHANGED_FILES: $(CHANGED_FILES)
    displayName: Lint gate (blocks PR on new doc debt)
```

- [ ] **Step 4: Delete the GitHub workflow + its orphaned tests:**

```bash
cd D:/project/component-maping
git rm .github/workflows/component-map-pr.yml tool/src/cli/workflow.test.ts tool/src/cli/workflow-lint.test.ts
```

- [ ] **Step 5: Run, verify PASS** (5 tests): `cd tool && npx vitest run src/cli/azure-pr.test.ts`

- [ ] **Step 6: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit`
The removed workflow tests must be gone (no failures referencing the deleted yml); everything else green.

- [ ] **Step 7: Commit**

```bash
cd D:/project/component-maping && git add azure-pipelines-pr.yml tool/src/cli/azure-pr.test.ts
git commit -m "ci(azure): PR pipeline — sticky comment + lint gate; remove GitHub workflow (AZ-01)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(the `git rm` from Step 4 is already staged and included in this commit)

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/azure-pr.test.ts && npm test && npx tsc --noEmit`
Expected: green + clean. PR pipeline triggers on component files, lint gate present + fail-able, token via env only, sticky marker; GitHub workflow + its tests gone.
</verify>

<done>
The PR bot + lint gate run on Azure DevOps. T5 adds the scheduled audit pipeline.
</done>

---

### Task 5: Scheduled audit pipeline

<model>sonnet</model>

<read_first>
- `azure-pipelines-pr.yml` (T4 — for the checkout/node/install step style)
- `docs/specs/2026-05-31-phase4-maintenance-design.md` §3 (audit pipeline) + AZ-02
</read_first>

**Files:**
- Create: `azure-pipelines-audit.yml`
- Test: `tool/src/cli/azure-audit.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/azure-audit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync('../azure-pipelines-audit.yml', 'utf8');

describe('Azure audit pipeline', () => {
  it('runs quarterly on a cron with full history', () => {
    expect(yml).toContain('schedules:');
    expect(yml).toContain("cron: '0 9 1 1,4,7,10 *'");
    expect(yml).toContain('fetchDepth: 0');
  });
  it('runs cmap audit and publishes summary + artifact', () => {
    expect(yml).toContain('cmap -- audit');
    expect(yml).toContain('--report');
    expect(yml).toContain('##vso[task.uploadsummary]');
    expect(yml).toContain('PublishPipelineArtifact');
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/azure-audit.test.ts`

- [ ] **Step 3: Create `azure-pipelines-audit.yml`** (repo root):

```yaml
# Component Map — quarterly maintenance audit (Azure DevOps).
# Runs `cmap audit`, renders the report into the build summary, and publishes it as an artifact.
# Runs on a schedule (and can be run manually from the Pipelines UI).
schedules:
  - cron: '0 9 1 1,4,7,10 *'   # 09:00 UTC on day 1 of Jan/Apr/Jul/Oct (quarterly)
    displayName: Quarterly component-map audit
    branches:
      include: [main, master]
    always: true
trigger: none
pr: none

pool:
  vmImage: ubuntu-latest

variables:
  CMAP_ROOT: src
  CMAP_DOCS: docs/components
  CMAP_OVERRIDES: docs/component-map

steps:
  - checkout: self
    fetchDepth: 0

  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: Use Node 20

  - script: npm --prefix tool ci
    displayName: Install tool deps

  - script: |
      set -euo pipefail
      npm --prefix tool run --silent cmap -- audit --root "$CMAP_ROOT" --docs "$CMAP_DOCS" --overrides "$CMAP_OVERRIDES" --report "$(System.DefaultWorkingDirectory)/audit"
    displayName: Run component-map audit

  - script: echo "##vso[task.uploadsummary]$(System.DefaultWorkingDirectory)/audit.md"
    displayName: Attach audit to build summary

  - publish: $(System.DefaultWorkingDirectory)/audit.json
    artifact: component-map-audit
    displayName: Publish audit artifact
```

> `publish:` is the shorthand for `PublishPipelineArtifact@1`; the test asserts `PublishPipelineArtifact` so include the task explicitly OR add a comment line — to satisfy the assertion deterministically, use the explicit task form below instead of the `publish:` shorthand:
```yaml
  - task: PublishPipelineArtifact@1
    inputs:
      targetPath: $(System.DefaultWorkingDirectory)/audit.json
      artifact: component-map-audit
    displayName: Publish audit artifact
```
(Use the explicit `PublishPipelineArtifact@1` task form — drop the `publish:` shorthand — so the YAML literally contains `PublishPipelineArtifact`.)

- [ ] **Step 4: Run, verify PASS** (2 tests): `cd tool && npx vitest run src/cli/azure-audit.test.ts`

- [ ] **Step 5: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (expect green + clean).

- [ ] **Step 6: Commit**

```bash
cd D:/project/component-maping && git add azure-pipelines-audit.yml tool/src/cli/azure-audit.test.ts
git commit -m "ci(azure): quarterly scheduled cmap audit pipeline (AZ-02)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/azure-audit.test.ts && npm test && npx tsc --noEmit`
Expected: green + clean. Audit pipeline has the quarterly cron, runs `cmap audit --report`, uploads the summary + artifact.
</verify>

<done>
Both Azure pipelines exist and are validated. Plan 4 documents the compatibility matrix, schema-evolution policy, and accuracy-sampling checklist.
</done>

---

## Self-Review (Plan 3)

- **Spec coverage:** AZ-01 (PR pipeline = comment + lint gate, env-routed token, sticky marker, GitHub workflow removed), AZ-02 (quarterly audit pipeline → summary + artifact). ✓
- **Placeholder scan:** complete YAML/tests/commands; no TBD. The audit-artifact step explicitly uses `PublishPipelineArtifact@1`. ✓
- **Type consistency:** pipelines call existing `cmap pr`/`cmap lint`/`cmap audit` with the same flags those commands accept (`--root/--docs/--overrides/--changed/--baseline/--report`); token env var name `SYSTEM_ACCESSTOKEN` consistent between the Authorization header and the `env:` mapping; tests assert the exact strings the YAML emits. ✓
- **Verify bounds:** both tasks <60s. ✓
- **Note:** Azure REST sticky-comment behavior is text-validated only (no live Azure in CI) — live verification is in the M6 UAT checklist, same as the M3 GitHub bot was.
