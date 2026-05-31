# M6 — Plan 4: Maintenance docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Document the long-term maintenance contract: an Angular compatibility matrix + upgrade-verify checklist, a schema-evolution policy + CHANGELOG, and a manual accuracy-sampling checklist; plus a README "CI / maintenance" pointer.

**Architecture:** One task — create four docs + a README section, guarded by a small existence/content test (the doc text is the deliverable; no runtime code).

**Tech Stack:** Markdown, vitest (existence/content checks).

---

```yaml
must_haves:
  observable_truths:
    - "docs/COMPATIBILITY.md lists the verified Angular version (15.x) + pinned parser (@angular/compiler 19.2.14) + an upgrade-verify checklist."
    - "docs/SCHEMA.md documents the three schema versions (graph=2, override=1, baseline=1) + semver + breaking→migration rule; CHANGELOG.md has an M1–M6 history."
    - "docs/accuracy-sampling-checklist.md describes the manual quarterly sampling process."
    - "README points to the Azure pipelines + maintenance docs + the OAuth-token prerequisite."
    - "the docs test passes; full suite + tsc clean."
  required_artifacts:
    - "docs/COMPATIBILITY.md, docs/SCHEMA.md, CHANGELOG.md, docs/accuracy-sampling-checklist.md"
    - "README.md maintenance section"
    - "tool/src/cli/docs.test.ts"
  required_wiring:
    - "Closes M6: maintenance policy + compatibility + accuracy process are written down."
  key_links:
    - "compatibility matrix + upgrade checklist → Angular-upgrade buffer (DOC-01)"
    - "schema semver + migration rule → schema evolution (DOC-02)"
    - "manual sampling checklist → accuracy process (DOC-03)"
```

---

## File Structure

- `docs/COMPATIBILITY.md` — Angular/parser matrix + upgrade-verify checklist.
- `docs/SCHEMA.md` — schema versions + evolution policy.
- `CHANGELOG.md` — milestone history.
- `docs/accuracy-sampling-checklist.md` — manual quarterly accuracy process.
- `README.md` — append a "CI & maintenance" section.
- `tool/src/cli/docs.test.ts` — existence + key-content checks.

---

## Wave 4: Docs

### Task 6: Maintenance docs + README section

<model>sonnet</model>

<read_first>
- `README.md` (if present — append, don't clobber), `tool/src/types.ts` (SCHEMA_VERSION=2), `tool/src/overrides/schema.ts` (OVERRIDE_SCHEMA_VERSION=1), `tool/src/cli/baseline.ts` (BASELINE_SCHEMA_VERSION=1), `tool/package.json` (`@angular/compiler` 19.2.14)
- `docs/specs/2026-05-31-phase4-maintenance-design.md` §1 + DOC-01/02/03
</read_first>

**Files:**
- Create: `docs/COMPATIBILITY.md`, `docs/SCHEMA.md`, `CHANGELOG.md`, `docs/accuracy-sampling-checklist.md`
- Modify (or Create if absent): `README.md`
- Test: `tool/src/cli/docs.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/cli/docs.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p: string) => readFileSync(`../${p}`, 'utf8');

describe('maintenance docs', () => {
  it('compatibility matrix exists with the verified version + checklist', () => {
    const d = read('docs/COMPATIBILITY.md');
    expect(d).toContain('Angular');
    expect(d).toContain('15');
    expect(d).toContain('@angular/compiler');
    expect(d.toLowerCase()).toContain('upgrade');
  });
  it('schema doc lists the three versions + migration rule', () => {
    const d = read('docs/SCHEMA.md');
    expect(d).toContain('SCHEMA_VERSION');
    expect(d).toContain('OVERRIDE_SCHEMA_VERSION');
    expect(d).toContain('BASELINE_SCHEMA_VERSION');
    expect(d.toLowerCase()).toContain('migration');
  });
  it('changelog covers M1–M6', () => {
    const d = read('CHANGELOG.md');
    for (const m of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']) expect(d).toContain(m);
  });
  it('accuracy sampling checklist exists', () => {
    expect(read('docs/accuracy-sampling-checklist.md').toLowerCase()).toContain('sampl');
  });
  it('README points to CI + maintenance', () => {
    expect(existsSync('../README.md')).toBe(true);
    expect(read('README.md')).toContain('azure-pipelines');
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cli/docs.test.ts`

- [ ] **Step 3: Create `docs/COMPATIBILITY.md`**

```markdown
# Compatibility Matrix

The Component Map Tool parses Angular source with a **pinned** `@angular/compiler` (newer-parses-older is
safe: the bundled compiler reads templates from older Angular versions). Parsing is AST-only via `ts-morph`.

| Target Angular | Status | Notes |
| --- | --- | --- |
| 15.2.9 | ✅ Verified | Validated on `poc/real-sample` (18 components, NgModule-based); 19/19 edge accuracy. |
| 16 – 18 | ⚠️ Untested | Expected to work (older than the bundled compiler). Run the upgrade checklist before relying on it. |
| 19+ | ⚠️ Untested | Standalone-default flips to `true` in v19 — `STND-01` already resolves version-aware defaults, but re-verify. |

**Pinned tool dependencies:** `@angular/compiler@19.2.14`, `ts-morph@24.0.0`, Node ≥ 20.

## Angular-upgrade verify checklist

When the analyzed project upgrades its Angular major version, spend ~2–3 hours verifying the tool:

- [ ] Run `cd tool && npm test` — the full suite is green.
- [ ] Run `cmap index --root <src>` on the upgraded app — no parse-error spike vs the prior run.
- [ ] Spot-check 3 components with `cmap query <c>` — impact + UI access paths still resolve.
- [ ] Confirm `standalone` classification on a few components (explicit flag / NgModule membership / version default).
- [ ] If parsing breaks, bump `@angular/compiler` to the project's major (or the next that parses it) and re-run.
- [ ] Update the row above and `CHANGELOG.md`.
```

- [ ] **Step 4: Create `docs/SCHEMA.md`**

```markdown
# Schema Evolution Policy

The tool owns three independently-versioned, on-disk schemas. Each is an integer version; treat a
**breaking** change (a reader of the old version would misread the new shape) as a major bump that
**requires** a migration step.

| Schema | Constant | Current | File |
| --- | --- | --- | --- |
| Graph artifact | `SCHEMA_VERSION` (`tool/src/types.ts`) | 2 | `.cmap/graph.json` |
| Override file | `OVERRIDE_SCHEMA_VERSION` (`tool/src/overrides/schema.ts`) | 1 | `docs/component-map/<id>.cmap.yaml` |
| Lint baseline | `BASELINE_SCHEMA_VERSION` (`tool/src/cli/baseline.ts`) | 1 | `.cmap-baseline.json` |

## Rules

- **Additive, optional field** → no version bump (e.g. `DynamicDep.waived?` was added without bumping the override schema).
- **Breaking change** → bump the version constant **and** ship a migration:
  - Graph: bumping `SCHEMA_VERSION` makes `loadGraph` reject the old file and forces a full rebuild — no data migration needed (the graph is derived).
  - Override / baseline (human/CI-authored data): provide a one-shot migration note in `CHANGELOG.md` and, if non-trivial, a `cmap` migration step. The override reader already tolerates and skips unknown versions with a warning.
- Record every version change in `CHANGELOG.md`.
```

- [ ] **Step 5: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to the Component Map Tool. Schema versions: graph=2, override=1, baseline=1.

## M6 — Phase 4: Long-term Maintenance (2026-05-31)
- `cmap audit` — git-based stale docs + coverage + override orphans + open gaps (markdown/json).
- Azure DevOps Pipelines **replace** the GitHub Actions workflow: PR pipeline (sticky comment + lint gate) + quarterly scheduled audit pipeline.
- Docs: compatibility matrix + upgrade checklist, schema-evolution policy, accuracy-sampling checklist.

## M5 — Phase 3: Renderer & UX (2026-05-31)
- `cmap query --html` embeds an offline interactive Mermaid neighborhood diagram; `cmap render --html` whole-graph SVG (search/pan-zoom/click).

## M4 — Phase 2b: MD Migration + Enforcement (2026-05-31)
- `cmap migrate` (repo-scale scaffold + `.cmap-baseline.json` + coverage); `cmap lint` mandatory gate (baseline-grandfather; `waived` + `--accept`). **baseline schema v1.**

## M3 — Phase 2a + 2.5: MD Overrides + PR Bot (2026-05-31)
- Tool-owned `.cmap.yaml` overrides → `via:'override'` edges; `cmap gaps`/`pr`; PR bot. **override schema v1; graph schema → 2** (`Edge.via`+'override', `ComponentNode.description`).

## M2 — Phase 1: Static Analysis Core (2026-05-31)
- `tool/` package: indexer (STND-01) + routes + edges + graph + cache + query + MdIndex + `cmap` CLI/HTML. **graph schema v1.**

## M1 — Phase 0: POC Validation (2026-05-29)
- ts-morph + `@angular/compiler@19` feasibility validated (GO).
```

- [ ] **Step 6: Create `docs/accuracy-sampling-checklist.md`**

```markdown
# Accuracy Sampling Checklist (manual, quarterly)

Automated tests cover correctness on fixtures; this manual sample measures real-world accuracy and is
run alongside the quarterly audit pipeline. ~30–60 minutes.

1. From the quarterly audit report, pick **10 random components** (mix of leaf / mid / shared).
2. For each, run `cmap query <component>` and read the impact (ancestors) + UI access paths.
3. A reviewer who knows the area verifies each by hand (IDE search / runtime knowledge):
   - [ ] Are all listed ancestors real parents?
   - [ ] Any **missing** parent the tool didn't find? (Likely an undocumented dynamic dep → add a `.cmap.yaml` `target` or `waived`.)
   - [ ] Are the UI access-path routes correct?
4. Log: `accuracy = correct reports / 10`. Record the date + % in a running table (team wiki or this repo).
5. If accuracy < 90%, triage the misses: dynamic-dep gaps (fixable via overrides) vs parser bugs (file an issue).

> Uncertainty is already surfaced: impact/access-paths through `indirect`/`unresolved-static` edges are flagged
> "uncertain", and `cmap gaps` / `cmap audit` list undocumented dynamic constructs.
```

- [ ] **Step 7: Append a "CI & maintenance" section to `README.md`** (read it first; if it doesn't exist, create it with a short tool intro + this section):

```markdown
## CI & maintenance

CI runs on **Azure DevOps Pipelines**:

- `azure-pipelines-pr.yml` — on PRs touching `*.component.ts`: posts a sticky impact comment and runs a
  fail-able `cmap lint` gate. **Prerequisites:** enable *"Allow scripts to access the OAuth token"* and grant
  the build service *"Contribute to pull requests"*; add the pipeline as a **Build Validation** branch policy.
- `azure-pipelines-audit.yml` — quarterly: runs `cmap audit` and publishes the report to the build summary + an artifact.

Adapt `CMAP_ROOT` / `CMAP_DOCS` / `CMAP_OVERRIDES` (pipeline `variables`) to your repo, and commit a
`.cmap-baseline.json` (generate with `cmap migrate`, using the **same `--root`** as CI).

Maintenance references: [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) ·
[`docs/SCHEMA.md`](docs/SCHEMA.md) · [`docs/accuracy-sampling-checklist.md`](docs/accuracy-sampling-checklist.md) ·
[`CHANGELOG.md`](CHANGELOG.md).
```

- [ ] **Step 8: Run, verify PASS** (5 tests): `cd tool && npx vitest run src/cli/docs.test.ts`

- [ ] **Step 9: Run all + typecheck + coverage gate:** `cd tool && npm run test:cov && npx tsc --noEmit`
Expected: all green, coverage ≥80%, tsc clean. (Docs add no executable lines; coverage should be unaffected.)

- [ ] **Step 10: Commit**

```bash
cd D:/project/component-maping && git add docs/COMPATIBILITY.md docs/SCHEMA.md CHANGELOG.md docs/accuracy-sampling-checklist.md README.md tool/src/cli/docs.test.ts
git commit -m "docs(M6): compatibility matrix + schema policy + CHANGELOG + accuracy checklist + README (DOC-01/02/03)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/cli/docs.test.ts && npx tsc --noEmit`
Expected: 5 PASS; tsc clean. All four docs + the README section exist with the expected content.
</verify>

<done>
The maintenance contract is documented. M6 is feature + docs complete → STEP 8 (UAT/verification) → STEP 9 (QA) → ship.
</done>

---

## Self-Review (Plan 4)

- **Spec coverage:** DOC-01 (COMPATIBILITY matrix + upgrade checklist), DOC-02 (SCHEMA policy + CHANGELOG), DOC-03 (accuracy-sampling checklist), + README pointer. ✓
- **Placeholder scan:** full doc content provided; no TBD. ✓
- **Type consistency:** schema versions in `docs/SCHEMA.md` match the code constants (graph `SCHEMA_VERSION=2`, `OVERRIDE_SCHEMA_VERSION=1`, `BASELINE_SCHEMA_VERSION=1`); pinned versions match `package.json`; README references the actual pipeline filenames from Plan 3. ✓
- **Verify bounds:** single task <60s. ✓
