# M6 — Plan 2: `cmap audit` CLI + integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Expose `cmap audit` — build the graph, gather git mtimes for component/doc/override files, run `auditReport`, and print the markdown (or write `<prefix>.md` + `.json` with `--report`).

**Architecture:** One task: a `audit` branch in `cli/index.ts` that resolves real paths for git mtimes (keyed the same way `auditReport` looks them up), plus an integration test on `poc/real-sample`.

**Tech Stack:** TS/Node ESM, vitest, `git`.

---

```yaml
must_haves:
  observable_truths:
    - "`cmap audit --root <r>` exits 0 and prints a markdown audit (Stale/Coverage/Orphans/Open gaps); `--report <p>` writes `<p>.md` + `<p>.json` and prints a summary line."
    - "the mtimes the CLI builds are keyed by posix.join(root, filePath) / docPath / override-file-path so auditReport's lookups hit."
    - "on poc/real-sample (no MD, no overrides): runs without error, coverage.withMd = 0, gaps non-empty, stale empty."
    - "full suite + tsc clean."
  required_artifacts:
    - "tool/src/cli/index.ts (audit command + --report flag + USAGE)"
    - "tool/src/cli/audit-integration.test.ts"
  required_wiring:
    - "Azure audit pipeline (Plan 3) runs `cmap audit --report audit`."
  key_links:
    - "CLI builds real git paths but keys mtimes by the node's own path strings → matches auditReport (MNT-01)"
```

---

## File Structure

- `tool/src/cli/index.ts` — add the `audit` branch + `--report` flag (surgical).
- `tool/src/cli/audit-integration.test.ts` — end-to-end on `poc/real-sample`.

---

## Wave 2: CLI + integration

### Task 3: `cmap audit` command

<model>sonnet</model>

<read_first>
- `tool/src/cli/index.ts` (whole file — `runCli`, `buildEnriched` → `{graph, overrides, warnings, ...}`, parseArgs options, `USAGE`, `writeFileSync` import, `overridesDir`)
- `tool/src/audit/report.ts` (`auditReport`, `renderAuditMd`), `tool/src/audit/mtime.ts` (`gitMtimes`)
- MNT-01
</read_first>

**Files:**
- Modify: `tool/src/cli/index.ts`
- Test: `tool/src/cli/audit-integration.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/audit-integration.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

const ROOT = '../poc/real-sample/src';
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-audit-')); }

describe('cmap audit (CLI)', () => {
  it('prints a markdown audit and exits 0', () => {
    const d = tmp();
    try {
      const r = runCli(['audit', '--root', ROOT, '--out', join(d, '.cmap')]);
      expect(r.code).toBe(0);
      const md = r.lines.join('\n');
      expect(md).toContain('# Component Map — Audit');
      expect(md).toContain('## Coverage');
      expect(md).toContain('## Open gaps');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('--report writes <p>.md + <p>.json', () => {
    const d = tmp();
    try {
      const report = join(d, 'audit');
      const r = runCli(['audit', '--root', ROOT, '--out', join(d, '.cmap'), '--report', report]);
      expect(r.code).toBe(0);
      expect(existsSync(`${report}.md`)).toBe(true);
      expect(existsSync(`${report}.json`)).toBe(true);
      const json = JSON.parse(readFileSync(`${report}.json`, 'utf8'));
      expect(json.coverage.withMd).toBe(0);              // real-sample has no project MD
      expect(Array.isArray(json.gaps)).toBe(true);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/audit-integration.test.ts`

- [ ] **Step 3: Edit `tool/src/cli/index.ts`:**

(a) Add imports alongside the other `./`/`../` imports:
```ts
import { posix } from 'node:path';
import { auditReport, renderAuditMd } from '../audit/report.js';
import { gitMtimes } from '../audit/mtime.js';
```
(If `posix` collides with an existing `node:path` import, merge: e.g. `import { posix, ... } from 'node:path';` — keep the existing named imports.)

(b) Add the `report` flag to the `parseArgs` `options` object (after `coverage`):
```ts
      report: { type: 'string' },
```

(c) Update `USAGE` to include `audit`:
```ts
const USAGE = 'usage: cmap <index|query|gaps|pr|migrate|lint|render|audit> [--root dir] [--docs dir] [--overrides dir] [--out dir] [--html file] [--write] [--changed csv] [--baseline file] [--accept] [--coverage file] [--report prefix]';
```

(d) Add the `audit` branch immediately before the final `return { code: 1, lines: [USAGE] };`:
```ts
  if (cmd === 'audit') {
    const { graph, overrides, warnings } = buildEnriched(root, out, docs, overridesDir);
    const overrideFiles = new Map<string, string>();
    for (const id of overrides.keys()) overrideFiles.set(id, posix.join(overridesDir, `${id}.cmap.yaml`));
    const realPaths = new Set<string>();
    for (const c of graph.components) {
      realPaths.add(posix.join(root, c.filePath));
      if (c.docPath) realPaths.add(c.docPath);
    }
    for (const p of overrideFiles.values()) realPaths.add(p);
    const mtimes = gitMtimes([...realPaths]);
    const report = auditReport(graph, overrides, { mtimes, root, overrideFiles, warnings });
    if (values.report) {
      const prefix = values.report as string;
      writeFileSync(`${prefix}.md`, renderAuditMd(report));
      writeFileSync(`${prefix}.json`, `${JSON.stringify(report, null, 2)}\n`);
      return { code: 0, lines: [`wrote ${prefix}.md + ${prefix}.json (${report.stale.length} stale, ${report.overrideOrphans.length} orphan override(s), ${report.gaps.length} gap component(s))`] };
    }
    return { code: 0, lines: [renderAuditMd(report)] };
  }
```

> Note: `overrideFiles` keys must match how `auditReport` looks them up — both use `posix.join(overridesDir, \`${id}.cmap.yaml\`)` as the path AND that same string is added to `realPaths` (so `gitMtimes` keys it identically). Component keys use `posix.join(root, c.filePath)` on both sides.

- [ ] **Step 4: Run, verify PASS** (2 tests): `cd tool && npx vitest run src/cli/audit-integration.test.ts`

- [ ] **Step 5: Run all + typecheck:** `cd tool && npm test && npx tsc --noEmit` (existing CLI tests must still pass).

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/cli/index.ts src/cli/audit-integration.test.ts
git commit -m "feat(tool): cmap audit — git-stale + coverage + orphans + gaps report (MNT-01)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `cmap audit` prints the report (exit 0); `--report` writes md+json; on real-sample coverage.withMd=0, gaps present, no git errors.
</verify>

<done>
`cmap audit` runs end-to-end on real source. Plan 3's scheduled Azure pipeline invokes `cmap audit --report audit`.
</done>

---

## Self-Review (Plan 2)

- **Spec coverage:** MNT-01 CLI — `cmap audit` prints/writes the report; path-key consistency with `auditReport`. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** imports match Plan 1 (`auditReport`/`renderAuditMd`/`gitMtimes`); `buildEnriched` returns `{graph, overrides, warnings}` (existing); `overrideFiles`/`realPaths` keyed by `posix.join(...)` consistent with `auditReport`'s lookups; `--report` flag typed; `CliResult {code, lines}` returned. NodeNext `.js`. ✓
- **Verify bounds:** single task <60s (real-sample build cached). ✓
