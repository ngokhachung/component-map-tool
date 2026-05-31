# M4 — Plan 4: CLI wiring + CI gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Expose `cmap migrate` and `cmap lint` (with `--baseline`, `--accept`, `--coverage`) on the CLI, and add a fail-able `cmap lint` step to the existing M3 PR workflow so new documentation debt blocks merge.

**Architecture:** Two tasks. T5 registers the two commands in `cli/index.ts` (reusing `buildEnriched` + `pathSuffixMatch`) + a self-contained CLI test against `poc/real-sample`. T6 adds the lint step to `.github/workflows/component-map-pr.yml` after the comment step (comment always posts; lint then gates), preserving M3 hardening (env-routed context, no `pull_request_target`), + a YAML text-validation test.

**Tech Stack:** TS/Node ESM, vitest, GitHub Actions YAML.

---

```yaml
must_haves:
  observable_truths:
    - "`cmap lint --changed <f> --baseline <p>` on real-sample (no MD, no baseline) exits 1; `--accept` then exits 0; a second lint with that baseline exits 0."
    - "`cmap migrate --root ... --baseline <p> --coverage <c>` exits 0 and writes the baseline + coverage files."
    - "The workflow has a step running `cmap -- lint ... --baseline .cmap-baseline.json` whose CHANGED_FILES comes via env (no `${{ }}` interpolation into the lint run shell); the comment step (github-script) is still present; no `pull_request_target`."
    - "Full suite + `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/cli/index.ts (migrate + lint commands, --baseline/--accept/--coverage flags, USAGE)"
    - "tool/src/cli/migrate-lint-cli.test.ts"
    - ".github/workflows/component-map-pr.yml (lint step)"
    - "tool/src/cli/workflow-lint.test.ts"
  required_wiring:
    - "CI runs `cmap lint`; devs run the same command locally — single source of truth."
  key_links:
    - "lint step after comment step → comment always posts, gate fails on new debt (spec §5, ENF-04)"
    - "GitHub-context via env only → command-injection-safe (M3 I1 carried forward)"
    - "`--accept` writes baseline = escape hatch #2 (spec §4, ENF-03)"
```

---

## File Structure

- `tool/src/cli/index.ts` — add `migrate` + `lint` command branches + three flags. (Existing file; surgical additions.)
- `tool/src/cli/migrate-lint-cli.test.ts` — end-to-end CLI behavior on real-sample.
- `.github/workflows/component-map-pr.yml` — add the lint step.
- `tool/src/cli/workflow-lint.test.ts` — YAML assertions for the lint step.

---

## Wave 4: CLI + CI

### Task 5: Register `cmap migrate` + `cmap lint`

<model>sonnet</model>

<read_first>
- `tool/src/cli/index.ts` (whole file — `runCli`, `buildEnriched`, `pathSuffixMatch`, parseArgs options, USAGE)
- `tool/src/cli/baseline.ts`, `tool/src/cli/lint.ts`, `tool/src/cli/migrate.ts` (Plans 2-3)
- ENF-01/03, MIG-01..03
</read_first>

**Files:**
- Modify: `tool/src/cli/index.ts`
- Create: `tool/src/cli/migrate-lint-cli.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/migrate-lint-cli.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

const ROOT = '../poc/real-sample/src';
const CHANGED = 'data-table.component.ts';
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-cli-')); }

describe('cmap lint (CLI)', () => {
  it('exits 1 on new debt, 0 after --accept, 0 again with the baseline', () => {
    const d = tmp();
    try {
      const out = join(d, '.cmap');
      const baseline = join(d, '.cmap-baseline.json');
      const args = ['--root', ROOT, '--out', out, '--baseline', baseline, '--changed', CHANGED];

      const first = runCli(['lint', ...args]);
      expect(first.code).toBe(1);                       // no MD → missing-md is new debt

      const accept = runCli(['lint', ...args, '--accept']);
      expect(accept.code).toBe(0);
      expect(existsSync(baseline)).toBe(true);

      const second = runCli(['lint', ...args]);
      expect(second.code).toBe(0);                      // grandfathered
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('cmap migrate (CLI)', () => {
  it('writes baseline + coverage and exits 0', () => {
    const d = tmp();
    try {
      const baseline = join(d, '.cmap-baseline.json');
      const coverage = join(d, 'cmap-coverage.md');
      const r = runCli(['migrate', '--root', ROOT, '--out', join(d, '.cmap'),
        '--overrides', join(d, 'component-map'), '--baseline', baseline, '--coverage', coverage]);
      expect(r.code).toBe(0);
      expect(existsSync(baseline)).toBe(true);
      expect(existsSync(coverage)).toBe(true);
      expect(existsSync(coverage.replace(/\.md$/, '.json'))).toBe(true);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/migrate-lint-cli.test.ts`
Expected: FAIL — `lint`/`migrate` fall through to USAGE (code 1 for migrate, wrong shape for lint).

- [ ] **Step 3: Edit `tool/src/cli/index.ts` — add imports** (after the existing import block, near the `renderPrComment` import):

```ts
import { readBaseline, writeBaseline, acceptInto } from './baseline.js';
import { computeIssues, lintChanged, renderLint } from './lint.js';
import { migrate } from './migrate.js';
```

- [ ] **Step 4: Edit the `parseArgs` `options` object** — add three flags:

```ts
      write: { type: 'boolean', default: false },
      changed: { type: 'string' },
      baseline: { type: 'string' },
      accept: { type: 'boolean', default: false },
      coverage: { type: 'string' },
```

- [ ] **Step 5: Update the `USAGE` constant**:

```ts
const USAGE = 'usage: cmap <index|query|gaps|migrate|lint> [--root dir] [--docs dir] [--overrides dir] [--out dir] [--html file] [--write] [--changed csv] [--baseline file] [--accept] [--coverage file]';
```

- [ ] **Step 6: Add the two command branches** — insert immediately before the final `return { code: 1, lines: [USAGE] };`:

```ts
  if (cmd === 'migrate') {
    const { graph, overrides } = buildEnriched(root, out, docs, overridesDir);
    const baselinePath = (values.baseline as string | undefined) ?? '.cmap-baseline.json';
    const coveragePath = (values.coverage as string | undefined) ?? 'cmap-coverage.md';
    const r = migrate(graph, overrides, { overridesDir, baselinePath, coveragePath });
    return { code: 0, lines: [
      'migrate complete:',
      `  scaffolded ${r.scaffolded.length} override file(s) in ${overridesDir}`,
      `  baseline → ${r.baselinePath}`,
      `  coverage → ${r.coveragePath} (+ .json): ${r.coverage.withMd}/${r.coverage.totalComponents} have MD; ${r.coverage.documented}/${r.coverage.needingDoc} dynamic-dep components documented`,
      ...r.scaffoldWarnings,
    ] };
  }

  if (cmd === 'lint') {
    const files = ((values.changed as string | undefined) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const { graph, overrides, warnings } = buildEnriched(root, out, docs, overridesDir);
    const baselinePath = (values.baseline as string | undefined) ?? '.cmap-baseline.json';
    const baseline = readBaseline(baselinePath);
    if (values.accept) {
      const all = computeIssues(graph, overrides);
      const current = new Map([...all].filter(([fp]) => files.length === 0 || files.some((f) => pathSuffixMatch(fp, f))));
      writeBaseline(baselinePath, acceptInto(baseline, current));
      return { code: 0, lines: [`accepted ${current.size} component(s) into ${baselinePath}`] };
    }
    const result = lintChanged(graph, overrides, files, baseline, warnings);
    return { code: result.ok ? 0 : 1, lines: renderLint(result) };
  }
```

- [ ] **Step 7: Run, verify PASS** (2 tests). `cd tool && npx vitest run src/cli/migrate-lint-cli.test.ts`

- [ ] **Step 8: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 9: Commit**

```bash
cd tool && git add src/cli/index.ts src/cli/migrate-lint-cli.test.ts
git commit -m "feat(tool): cmap migrate + cmap lint (--baseline/--accept/--coverage) (ENF-01/03, MIG-01..03)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/migrate-lint-cli.test.ts && npx tsc --noEmit`
Expected: green + clean. `cmap lint` exits 1 on new debt → 0 after `--accept` → 0 with baseline; `cmap migrate` writes baseline + coverage.
</verify>

<done>
The gate + migration are runnable as CLI commands (local + CI). T6 wires lint into the PR workflow.
</done>

---

### Task 6: Add the lint gate to the PR workflow

<model>sonnet</model>

<read_first>
- `.github/workflows/component-map-pr.yml` (whole file — note the `changed`/`cmap`/`github-script` steps + env-routing)
- ENF-04, spec §5
</read_first>

**Files:**
- Modify: `.github/workflows/component-map-pr.yml`
- Create: `tool/src/cli/workflow-lint.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/workflow-lint.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync('../.github/workflows/component-map-pr.yml', 'utf8');

describe('PR workflow — lint gate', () => {
  it('runs cmap lint with a baseline', () => {
    expect(yml).toContain('cmap -- lint');
    expect(yml).toContain('--baseline .cmap-baseline.json');
  });
  it('passes changed files to lint via env, not shell interpolation', () => {
    const lintLine = yml.split('\n').find((l) => l.includes('cmap -- lint'));
    expect(lintLine).toBeDefined();
    expect(lintLine!).toContain('"$CHANGED_FILES"');
    expect(lintLine!).not.toContain('${{');
  });
  it('keeps the comment step and avoids pull_request_target', () => {
    expect(yml).toContain('actions/github-script');
    expect(yml).not.toContain('pull_request_target');
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/workflow-lint.test.ts`

- [ ] **Step 3: Edit `.github/workflows/component-map-pr.yml`** — add a lint step at the END of the `comment` job's `steps:` list (after the `actions/github-script@v7` step), so the comment posts first and the gate fails after:

```yaml
      - name: Enforce component-map docs (lint gate)
        env:
          CHANGED_FILES: ${{ steps.changed.outputs.files }}
        # A non-zero exit BLOCKS the PR. The comment above is posted first. The baseline
        # grandfathers pre-existing debt — only NEW debt / regressions fail here.
        # SECURITY: CHANGED_FILES via env (never interpolated into the shell) — same as M3.
        run: |
          npm --prefix tool run --silent cmap -- lint --root "$CMAP_ROOT" --docs "$CMAP_DOCS" --overrides "$CMAP_OVERRIDES" --changed "$CHANGED_FILES" --baseline .cmap-baseline.json
```

- [ ] **Step 4: Run, verify PASS** (3 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add ../.github/workflows/component-map-pr.yml src/cli/workflow-lint.test.ts
git commit -m "ci: add fail-able cmap lint gate to PR workflow, env-routed (ENF-04)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/workflow-lint.test.ts && npx tsc --noEmit`
Expected: green + clean. Workflow runs `cmap -- lint ... --baseline .cmap-baseline.json` with `--changed "$CHANGED_FILES"` (env, no `${{ }}`), comment step intact, no `pull_request_target`.
</verify>

<done>
The PR workflow now comments AND gates. New documentation debt blocks merge; existing debt is grandfathered by `.cmap-baseline.json`.
</done>

---

## Self-Review (Plan 4)

- **Spec coverage:** ENF-01 (`cmap lint`), ENF-03 (`--accept`), MIG-01..03 (`cmap migrate`), ENF-04 (workflow lint step, env-routed, comment intact, no `pull_request_target`). ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** new imports match Plan 2/3 exports (`readBaseline`/`writeBaseline`/`acceptInto`, `computeIssues`/`lintChanged`/`renderLint`, `migrate`); `migrate` opts `{overridesDir, baselinePath, coveragePath}` match Plan 3; `CliResult {code, lines}` returned; `pathSuffixMatch` reused from index.ts; flags `baseline`/`accept`/`coverage` typed in parseArgs. Workflow test relative path `../.github/...` matches existing `workflow.test.ts` convention. ✓
- **Verify bounds:** both tasks <60s (real-sample build cached per run). ✓
