# M3 — Plan 6: GitHub Action + Integration/Verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the PR-bot GitHub Action (sticky comment) and prove the override flow end-to-end on the real Angular 15 sample, keeping coverage ≥80%.

**Architecture:** Two tasks. T9 = `.github/workflows/component-map-pr.yml` (pull_request, permissions, concurrency, fetch-depth:0 diff, setup-node + npm ci, `cmap pr`, `actions/github-script` sticky comment, `actions/cache`) + a text-validation test. T10 = an integration test that documents a real-sample `ngComponentOutlet` via a temp MD + `.cmap.yaml` and asserts the `via:'override'` edge + gap closure, then confirms coverage.

**Tech Stack:** GitHub Actions YAML, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "The workflow uses on: pull_request, permissions pull-requests: write, a concurrency group, checkout fetch-depth: 0, a git diff for changed component files, runs `cmap pr`, posts a sticky comment via actions/github-script, and documents the pull_request_target ban."
    - "Integration: documenting ReportDashboardPage's ngComponentOutlet (temp MD componentId + .cmap.yaml target) adds a via:'override' edge and removes it from findGaps."
    - "`npm run test:cov` passes the ≥80% thresholds."
  required_artifacts:
    - ".github/workflows/component-map-pr.yml"
    - "tool/src/cli/workflow.test.ts (text-validation)"
    - "tool/src/overrides/integration.test.ts (real-sample override flow)"
  required_wiring:
    - "Workflow calls `npm --prefix tool run cmap -- pr ...` (Plan 5) and posts the marked comment."
  key_links:
    - "pull_request + permissions:write + concurrency + fetch-depth:0 + github-script sticky (RESEARCH §1-4); NO pull_request_target"
    - "override flow validated on real v15 (RESEARCH §6, OVR-02/03)"
```

---

## Wave: Action + Verify

### Task 9: PR-bot GitHub Action

<model>sonnet</model>

<read_first>
- `.planning/phase2-RESEARCH.md` §1-4 (sticky comment, diff, trigger, CI run)
- `tool/package.json` (the `cmap` script)
</read_first>

**Files:**
- Create: `.github/workflows/component-map-pr.yml`
- Test: `tool/src/cli/workflow.test.ts`

<action>

- [ ] **Step 1: Create `.github/workflows/component-map-pr.yml`**

```yaml
# Component Map PR bot — comments the impact (affected parents/routes) of changed
# Angular components on a PR. Adapt CMAP_ROOT/CMAP_DOCS/CMAP_OVERRIDES to your repo.
#
# SECURITY: this uses `on: pull_request`, which gives a WRITABLE token only for same-repo
# (non-fork) PRs. Do NOT switch to `pull_request_target` and check out the PR head — that
# runs untrusted PR code with a write-scoped token (a known security footgun).
name: Component Map PR

on:
  pull_request:
    paths:
      - '**/*.component.ts'

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: cmap-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  comment:
    runs-on: ubuntu-latest
    env:
      CMAP_ROOT: src
      CMAP_DOCS: docs/components
      CMAP_OVERRIDES: docs/component-map
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: tool/package-lock.json
      - run: npm --prefix tool ci
      - uses: actions/cache@v4
        with:
          path: .cmap
          key: cmap-${{ runner.os }}-${{ hashFiles(format('{0}/**/*.ts', env.CMAP_ROOT)) }}
      - id: changed
        run: |
          CHANGED=$(git diff --name-only --diff-filter=ACMR "origin/${{ github.base_ref }}...HEAD" -- '*.component.ts' | paste -sd, -)
          echo "files=$CHANGED" >> "$GITHUB_OUTPUT"
      - id: cmap
        run: |
          BODY=$(npm --prefix tool run --silent cmap -- pr --root "$CMAP_ROOT" --docs "$CMAP_DOCS" --overrides "$CMAP_OVERRIDES" --changed "${{ steps.changed.outputs.files }}")
          {
            echo "body<<CMAP_EOF"
            echo "$BODY"
            echo "CMAP_EOF"
          } >> "$GITHUB_OUTPUT"
      - uses: actions/github-script@v7
        env:
          CMAP_BODY: ${{ steps.cmap.outputs.body }}
        with:
          script: |
            const marker = '<!-- cmap-pr-bot -->';
            const body = process.env.CMAP_BODY;
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.issue.number, per_page: 100,
            });
            const existing = comments.find((c) => c.body && c.body.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({ owner: context.repo.owner, repo: context.repo.repo, comment_id: existing.id, body });
            } else {
              await github.rest.issues.createComment({ owner: context.repo.owner, repo: context.repo.repo, issue_number: context.issue.number, body });
            }
```

- [ ] **Step 2: Write the validation test** — `tool/src/cli/workflow.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WF = readFileSync(fileURLToPath(new URL('../../../.github/workflows/component-map-pr.yml', import.meta.url)), 'utf8');

describe('PR-bot workflow', () => {
  it('triggers on PRs to component files with the right permissions + concurrency', () => {
    expect(WF).toContain('on:');
    expect(WF).toContain('pull_request:');
    expect(WF).toContain('**/*.component.ts');
    expect(WF).toContain('pull-requests: write');
    expect(WF).toMatch(/concurrency:/);
    expect(WF).toContain('cancel-in-progress: true');
  });
  it('checks out full history, runs cmap pr, and posts a sticky comment', () => {
    expect(WF).toContain('fetch-depth: 0');
    expect(WF).toMatch(/git diff --name-only.*--diff-filter=ACMR/);
    expect(WF).toContain('cmap -- pr');
    expect(WF).toContain('actions/github-script@v7');
    expect(WF).toContain('<!-- cmap-pr-bot -->');
  });
  it('does NOT use pull_request_target (security)', () => {
    expect(WF).not.toContain('pull_request_target');
  });
});
```

- [ ] **Step 3: Run, verify PASS** — `cd tool && npx vitest run src/cli/workflow.test.ts` (3 tests).

- [ ] **Step 4: Commit**

```bash
cd D:/project/component-maping && git add .github/workflows/component-map-pr.yml tool/src/cli/workflow.test.ts
git commit -m "feat(ci): PR-bot GitHub Action (sticky comment via cmap pr) (BOT-02)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/workflow.test.ts && npx tsc --noEmit`
Expected: 3 tests PASS; tsc clean. Workflow has the trigger/permissions/concurrency, full-history diff, `cmap pr` call, github-script sticky comment, and no `pull_request_target`.
</verify>

<done>
The PR-bot Action is shipped + guarded by a structure test. A team adapts `CMAP_ROOT/CMAP_DOCS/CMAP_OVERRIDES` to their repo.
</done>

---

### Task 10: Real-sample override integration + coverage

<model>sonnet</model>

<read_first>
- `tool/src/graph/index.ts` (buildGraphFromRoot), `tool/src/md/index.ts` (enrichGraph), `tool/src/overrides/parse.ts` (readOverrides), `merge.ts` (applyOverrides), `gaps.ts` (findGaps)
- `poc/real-sample/src/app/features/finance/pages/report-dashboard/report-dashboard.page.ts` (has `*ngComponentOutlet`)
</read_first>

**Files:**
- Create: `tool/src/overrides/integration.test.ts`

<action>

- [ ] **Step 1: Write the integration test** — `tool/src/overrides/integration.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraphFromRoot } from '../graph/index.js';
import { enrichGraph } from '../md/index.js';
import { readOverrides } from './parse.js';
import { applyOverrides } from './merge.js';
import { findGaps } from './gaps.js';

const ROOT = fileURLToPath(new URL('../../../poc/real-sample/src', import.meta.url));

describe('overrides end-to-end on the real Angular 15 sample', () => {
  it('documenting ReportDashboardPage ngComponentOutlet adds a via:override edge + closes the gap', () => {
    const { graph } = buildGraphFromRoot(ROOT);

    // Sanity: ReportDashboardPage starts with an uncovered ngComponentOutlet gap.
    expect(graph.edges.some((e) => e.from === 'ReportDashboardPage' && e.kind === 'unresolved-static' && e.reason === 'ngComponentOutlet')).toBe(true);
    expect(findGaps(graph, new Map()).some((g) => g.id === 'ReportDashboardPage')).toBe(true);

    // A project MD gives ReportDashboardPage a componentId (read-only doc, temp).
    const docs = mkdtempSync(join(tmpdir(), 'cmap-docs-'));
    const ovDir = mkdtempSync(join(tmpdir(), 'cmap-ov-'));
    try {
      writeFileSync(join(docs, 'RPT.md'), `# [RPT-DASH] Report Dashboard

|x|コンポーネントID|y|
|:--|:--|:--|
|a|RPT-DASH|b|

## ソースパス
\`features/finance/pages/report-dashboard/report-dashboard.page.ts\`
`);
      enrichGraph(graph, docs);
      expect(graph.components.find((c) => c.className === 'ReportDashboardPage')?.componentId).toBe('RPT-DASH');

      // A tool-owned override documents the dynamic target.
      writeFileSync(join(ovDir, 'RPT-DASH.cmap.yaml'), `schemaVersion: 1
componentId: RPT-DASH
dynamicDeps:
  - target: PaymentSummaryComponent
    reason: ngComponentOutlet
`);
      const { overrides } = readOverrides(ovDir);
      const { warnings } = applyOverrides(graph, overrides);
      expect(warnings).toEqual([]);

      expect(graph.edges).toContainEqual({ from: 'ReportDashboardPage', to: 'PaymentSummaryComponent', kind: 'resolved', via: 'override', reason: 'ngComponentOutlet' });
      expect(findGaps(graph, overrides).some((g) => g.id === 'ReportDashboardPage')).toBe(false);
    } finally {
      rmSync(docs, { recursive: true, force: true });
      rmSync(ovDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run, verify PASS** — `cd tool && npx vitest run src/overrides/integration.test.ts`

If the first sanity assertion fails (no `ngComponentOutlet` edge on ReportDashboardPage), read the sample's `report-dashboard.page.ts` to confirm the construct + adjust the expected component/target to a real one in the sample — do not weaken the override-edge assertion. Report any adjustment.

- [ ] **Step 3: Coverage gate**

Run: `cd tool && npm run test:cov`
Expected: all tests pass AND coverage ≥80% (lines/functions/statements), branches ≥70%. If an overrides/cli file is below, add focused tests until it passes; report which.

- [ ] **Step 4: Commit**

```bash
cd tool && git add src/overrides/integration.test.ts
git commit -m "test(tool): real-sample override flow (ngComponentOutlet -> via:override, gap closed) + coverage"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm run test:cov`
Expected: green + coverage ≥80%. On the real v15 sample, documenting ReportDashboardPage's `ngComponentOutlet` adds the `via:'override'` edge to PaymentSummaryComponent and removes ReportDashboardPage from `findGaps`.
</verify>

<done>
The override → resolved-edge → gap-closure loop is proven on real Angular 15 code, and coverage stays ≥80%. M3 execution is complete → STEP 8 UAT.
</done>

---

## Self-Review (Plan 6)

- **Spec coverage:** BOT-02 (workflow: trigger/permissions/concurrency/fetch-depth/diff/cmap pr/github-script sticky/no pull_request_target), OVR-02/03 integration on real v15, coverage gate. ✓
- **Placeholder scan:** complete YAML/tests/commands; `CMAP_ROOT` etc. are documented adapt-points, not TBD. ✓
- **Type consistency:** integration reuses `buildGraphFromRoot`/`enrichGraph`/`readOverrides`/`applyOverrides`/`findGaps` with their exact signatures; the asserted edge matches `Edge` (via:'override'); MD/override fixtures match the parsers (table col `コンポーネントID`, `## ソースパス`, `.cmap.yaml` schema). Path via import.meta.url (cli/src/test → repo root for .github; overrides test → poc/real-sample). ✓
- **Verify bounds:** both <60s. ✓
