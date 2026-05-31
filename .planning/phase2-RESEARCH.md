# M3 (Phase 2a + 2.5) — Research

**Date:** 2026-05-31 · **Mode A** (Stack + Pitfall) · **Input to:** writing-plans
**Design:** `docs/specs/2026-05-31-phase2-md-overrides-pr-bot-design.md`
Tags: `[VERIFIED]` / `[CITED url]` / `[ASSUMED]`.

## 1. Sticky PR comment (BOT-02)
- **`actions/github-script@v7` + hidden HTML marker** (`<!-- cmap-pr-bot -->`): `issues.listComments` → find by marker → `issues.updateComment` else `createComment`. PR comments use the **issues** API. First-party, no marketplace dep. `[CITED github.com/actions/github-script]`
- `permissions: { contents: read, pull-requests: write }`. `[VERIFIED]`
- **Pass the comment body via an `env:` var, not JS string-interpolation** (MD contains backticks/quotes). `[ASSUMED — github-script hygiene]`
- **Comment size cap = 65,536 chars** `[CITED docs.github.com/rest/issues/comments]` → `renderPrComment` must truncate (cap sections, "+N more (truncated)" footer) **inside the pure renderer** so it's unit-testable.
- **`concurrency: { group: cmap-pr-${{ pr.number }}, cancel-in-progress: true }`** to avoid double-comment races. `[CITED docs.github.com/actions/using-concurrency]`

## 2. Changed files in CI (BOT-02)
- `actions/checkout@v4` defaults to **shallow `fetch-depth: 1`** + a detached merge ref → `git diff base...HEAD` errors/under-reports. Use **`fetch-depth: 0`**. `[CITED actions/checkout#v4]`
- Diff via the event refs: `git diff --name-only --diff-filter=ACMR origin/${{ github.base_ref }}...HEAD -- '*.component.ts'` (or `pull_request.base.sha` / `.head.sha`). `--diff-filter=ACMR` keeps the **post-rename** path; **don't** use `HEAD~1` (wrong on squash). `[VERIFIED]`
- Alt `pulls.listFiles` (no full clone, paginates 30/req) only if avoiding `fetch-depth: 0`. `[CITED docs.github.com/rest/pulls]`

## 3. Trigger + fork token (BOT-02)
- **`on: pull_request` with `paths: ['**/*.component.ts']`** for this internal (non-fork) repo: same-repo PRs get a **writable** `GITHUB_TOKEN`. `[VERIFIED]`
- Fork PRs get a **read-only** token → comment 403 (irrelevant here). **Do NOT use `pull_request_target`** + checkout PR head — runs untrusted code with a write token (footgun). Document this ban in the workflow. `[CITED securitylab.github.com/.../pwn-requests]`

## 4. CI run of the tsx CLI (BOT-02)
- `setup-node@v4` (node 20, `cache: npm`, `cache-dependency-path: tool/package-lock.json`) → `npm --prefix tool ci` → `npm --prefix tool run cmap -- pr --root . --changed "<csv>" > body.md`. Lockfile already committed. `[VERIFIED npm ci needs lockfile]`
- Invoke via the **npm script** (`cmap` → `tsx src/cli/run.ts`) so tsx resolves locally; no global bin. `[ASSUMED]`
- **Add `actions/cache`** for the `.cmap/` dir keyed on source hash to warm incremental builds; cold full rebuild ties to the **deferred 500-comp perf** — fine at current scale, gate large-repo rollout on that benchmark. `[ASSUMED]`

## 5. js-yaml (OVR-01)
- **js-yaml 4.x `load()` is safe by default** (DEFAULT_SCHEMA; no function/regexp/undefined construction; `safeLoad` merged into `load`). No code exec from untrusted YAML. `[CITED github.com/nodeca/js-yaml]`
- **Hand-validate** the 4-field `CmapOverride` (no JSON-schema lib): `schemaVersion:number`, `componentId:string`, `dynamicDeps:array of {target:string}`. `load()` **throws `YAMLException` → try/catch PER FILE → warn + skip** (OVR-01), never fail the whole run. Unknown `schemaVersion` → skip+warn (don't mis-parse a future schema).
- Add deps `js-yaml` + `@types/js-yaml`.

## 6. Overrides-merge soundness (OVR-02) — HIGH
- **Skip `stale: true` entries** when adding edges (a removed construct must not keep a phantom edge). `[VERIFIED design must]`
- **Cycle risk:** an override edge A→B where B already reaches A makes the resolved graph cyclic. `impact()` (reverse-BFS) and `findChain()` (per-call visited) are **already cycle-safe** `[VERIFIED query/index.ts]`, but add a **cycle check at merge time** that warns (so a documented dynamic dep that creates a cycle is surfaced, not silent). `[ASSUMED — no consumer needs a DAG today, but warn]`
- Unresolvable `target` → warning naming the `.cmap.yaml` + componentId. Duplicate `componentId` across two `.cmap.yaml` files → warn (avoid silent last-wins).

## 7. `gaps --write` scaffold safety (OVR-04) — HIGH
- **Key entries by a STABLE construct identity (kind + source location), NOT free-text `reason`.** Keying by `reason` wording is fragile — a tool-version wording change would re-add as "new" and orphan the human-filled `target` (silent data loss). `[VERIFIED — design §7 said `reason`; CHANGE to a stable signature]`
- Never clobber a filled `target`; **idempotent** (stable key order, no timestamps → byte-identical re-write).
- Write **UTF-8, LF, no BOM** (Windows `autocrlf` churn). `[VERIFIED win32]`
- Check the docs dir is writable; clear error + echo the configured path. Note if the dir is gitignored (scaffolds would vanish from PRs).

## 8. changed-file → component mapping + noise (BOT-01) — MED
- Renamed (`R`) → take post-rename path; Deleted (`D`) → no node, skip gracefully (no crash); non-component `.ts` → no node (correct drop); template/style-only changes are **missed** (filter is `*.component.ts`) — document.
- **Shared-component fan-out:** a deep leaf used everywhere → dozens of ancestors → huge comment. **Cap ancestors shown per component + summarize count + surface `uncertain` prominently** in the pure renderer (main low-noise lever for the ≥90%/low-noise goal). `[VERIFIED impact() has no fan-out cap]`

## Decisions carried into the plan
1. **Overrides:** `js-yaml` `load()` + per-file try/catch + hand-validate; skip stale + unknown-schemaVersion; warn on unresolvable/duplicate; cycle-check-with-warning at merge; `via:'override'` edges.
2. **gaps --write:** key by stable construct identity (kind+location), preserve filled targets, idempotent, LF/UTF-8.
3. **renderPrComment (pure):** marker + ancestor cap + 65 KB truncation footer; surface uncertain/gaps.
4. **Workflow:** `on: pull_request` (paths filter) · `permissions: contents:read + pull-requests:write` · `concurrency` group · `checkout fetch-depth:0` · diff `--diff-filter=ACMR origin/$BASE...HEAD` · `setup-node@20` + npm cache + `npm --prefix tool ci` · `actions/github-script@v7` (env body, marker find-update) · `actions/cache` for `.cmap/` · NO `pull_request_target` (documented).
5. **CLI entry:** reuse the existing `cmap` npm script (`src/cli/run.ts`); add `pr` + `gaps` subcommands.
