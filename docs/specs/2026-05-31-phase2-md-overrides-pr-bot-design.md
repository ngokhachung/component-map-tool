# M3 — Phase 2a (MD Overrides) + Phase 2.5 (PR Bot): Design Spec

**Milestone:** M3 — Phase 2a + 2.5 · **Date:** 2026-05-31 · **Status:** Draft for review
**Builds on:** M2 Phase 1 (`tool/` graph + query + MdIndex + CLI). Full plan: `specs/component-map-plan-v2.md` (Phase 2a §234, Phase 2.5 §285).

## 1. Context & constraint

Phase 1 flags dynamic dependencies it can't resolve statically as `unresolved-static` edges (`to: null`): `*ngComponentOutlet`, `ViewContainerRef.createComponent`, `@ViewChild`, modal/dialog services. These are real "missed impact" risks.

**Hard constraint:** the per-component project Markdown (e.g. `docs/components/C000011_Common_Table_Cell.md`) is **read-only project documentation** — the tool must not edit it and must not require devs to add sections to it.

**Resolution:** introduce a **separate, tool-owned override document** per component (`.cmap.yaml`) that *patches* the dynamic-dep gaps. The tool **scaffolds** these files (pre-filled with the detected dynamic constructs) and lists what needs supplementing; the user fills only the unknown `target`. Components with no dynamic deps need no override (already "full"). Bundles the early-value **PR bot** (Phase 2.5), which uses the resulting graph.

## 2. Goals / Non-goals

**Goals**
- A tool-owned `.cmap.yaml` override format (per component, keyed by `componentId`) declaring dynamic-dep targets.
- `cmap gaps` (report) + `cmap gaps --write` (scaffold skeletons, merge-safe).
- Merge overrides into the graph → resolve flagged dynamic edges (`via: 'override'`).
- Read-only project MD enrichment surfaced in output (description `機能概要`).
- PR bot (GitHub Action) commenting affected parents/routes on changed components.

**Non-goals (deferred)**
- Editing the project MD; requiring devs to author project-MD sections.
- Mandatory CI linter / MD migration for all components → **Phase 2b (M4)**.
- Renderer / interactive graph → Phase 3. 500-component perf benchmark → still deferred.
- Resolving dynamic deps automatically (type-flow analysis) — out of scope; humans supply targets.

## 3. Requirements (M3)

| REQ-ID | Requirement |
|---|---|
| OVR-01 | Parse a tool-owned `docs/component-map/<componentId>.cmap.yaml` (configurable dir) with a versioned schema: `{ schemaVersion, componentId, dynamicDeps: [{ target, reason? }], notes? }`. Tolerant: missing → none; malformed → warning + skip (never fatal). |
| OVR-02 | Merge overrides into the graph: each `dynamicDeps.target` resolved via the locator → a `resolved` edge `from→to` with `via: 'override'`; the corresponding `unresolved-static` flag is considered closed. Unresolvable target → warning. |
| OVR-03 | `cmap gaps` reports components that still have `unresolved-static` / `indirect` edges not covered by an override — with the detected construct kinds — so the user knows what to document. A component with no such edges (or all covered) is "complete". |
| OVR-04 | `cmap gaps --write` scaffolds/updates `.cmap.yaml` for gap components: one `dynamicDeps` entry per detected construct, `reason` auto-filled, `target: ""` placeholder. **Merge-safe**: preserves filled `target`s, adds newly-detected gaps, marks entries whose construct disappeared as `stale: true`. Never overwrites user input. |
| OVR-05 | Surface read-only project-MD enrichment (`機能概要` description) on the node / in query + PR output (no MD edit). |
| BOT-01 | `cmap pr` produces a Markdown comment for a set of changed component files: per changed component, impact (affected ancestors + routes), UI access paths, and uncertainty/gap warnings + description. Pure/testable. |
| BOT-02 | A GitHub Action (`.github/workflows/component-map-pr.yml`) that, on PR, diffs changed `*.component.ts`, builds the graph in CI, runs `cmap pr`, and posts/updates a single PR comment. |

## 4. Architecture

```
tool/src/overrides/
  schema.ts    # CmapOverride type + validate(parsed) -> {ok, errors}
  parse.ts     # read docs/component-map/**.cmap.yaml -> Map<componentId, CmapOverride>
  merge.ts     # apply overrides to a Graph (add via:'override' edges; resolve targets via locator)
  gaps.ts      # detect gap components; scaffold/update .cmap.yaml (merge-safe)
tool/src/cli/
  index.ts     # + subcommands: gaps [--write], pr
  pr.ts        # renderPrComment(changedComponents, graph) -> markdown (pure)
.github/workflows/component-map-pr.yml   # thin glue: diff -> cmap pr -> gh comment
```

**Data flow (`cmap index` with overrides):** buildIncremental → enrichGraph (project MD: componentId, description, images) → **applyOverrides** (overrides dir → resolve targets → add `via:'override'` edges) → write graph.json. `cmap query` then sees the patched graph.

YAML parsing uses **`js-yaml`** — now in-policy because `.cmap.yaml` is a tool-owned data file, not an Angular analysis tool (owner sign-off recorded). Project MD stays targeted-Markdown (Phase 1).

## 5. Data model changes

- `Edge.via`: add `'override'` (documented dynamic dep) to the existing `'template' | 'route'`.
- `ComponentNode`: add `description: string | null` (from project MD `機能概要`, read-only).
- Bump graph `SCHEMA_VERSION` (additive; old cache rebuilds per the existing guard).

```ts
interface CmapOverride {
  schemaVersion: number;
  componentId: string;
  dynamicDeps: { target: string; reason?: string; stale?: boolean }[];
  notes?: string[];
}
```

## 6. Override merge (OVR-02) detail

For a node whose `componentId` matches an override: for each `dynamicDeps` entry with a non-empty `target` and **not `stale: true`** (stale entries are skipped — a removed construct must not keep a phantom edge), resolve `target` through the SAC-08 locator against the graph. On a unique match, add `Edge{ from: node.id, to: matched.id, kind: 'resolved', via: 'override', reason: entry.reason ?? 'documented dynamic dependency' }` (deduped). Ambiguous/!found target → warning (naming the file + componentId), no edge. Duplicate `componentId` across two `.cmap.yaml` files → warning. Empty `target` (un-filled skeleton) → ignored (still a gap). Override edges feed impact + ui-access-path like any resolved edge; both traversals are already cycle-safe (RESEARCH §6), but merge runs a **cycle check and warns** if an override edge closes a cycle.

## 7. Gaps + scaffold (OVR-03/04)

A "gap construct" = a **PINNABLE** `unresolved-static` edge on a component (ngComponentOutlet / @ViewChild / createComponent) — one where the user can name a target component. Structural `indirect` edges (`ng-content`, `ngTemplateOutlet`) are NOT gaps (no component target to document; flagging them would be adoption-killing noise — QA S1). `cmap gaps`:
- lists each gap component (id/className/file) + its detected constructs + whether an override file exists and how many `target`s are still empty.

`cmap gaps --write` per gap component:
- load existing `.cmap.yaml` (if any); build the desired entry set from current detected constructs, **keyed by a STABLE construct identity (kind + source location)** — NOT the free-text `reason` (re-wording `reason` between tool versions would orphan a human-filled `target` = silent data loss, per RESEARCH §7); **keep** entries whose `target` is filled; **add** entries for newly-detected constructs (`target: ""`); mark entries whose construct no longer exists `stale: true`; write back **UTF-8 / LF / no BOM**, stable key order (idempotent, byte-identical re-write).

## 8. PR bot (BOT-01/02)

`cmap pr --root <dir> --changed <fileA,fileB> [--docs --overrides]`:
- map each changed file → component node (by filePath); **renamed → post-rename path; deleted / non-component file → skip gracefully** (no node, no crash); for each mapped component, compute impact + uiAccessPaths.
- `renderPrComment` (pure) emits the comment markdown with a **hidden marker** (`<!-- cmap-pr-bot -->`, for sticky update), per-component sections (affected ancestors with `uncertain` flag, UI routes, open gaps, `機能概要` description), an **ancestor cap per component + "+N more" summary** (low-noise lever for shared components), and an overall **truncation footer** so the body stays under GitHub's 65,536-char limit (RESEARCH §1/§8).

GitHub Action: on `pull_request`, `git diff --name-only` for `*.component.ts`, `npm --prefix tool ci`, run `cmap pr`, then create/update a sticky PR comment via `actions/github-script` (or `gh`). Reads nothing pre-built — rebuilds the graph from the PR checkout for correctness.

## 9. Verification

- Unit: overrides schema/parse/merge/gaps, `renderPrComment` (pure), all with vitest; coverage ≥80%.
- Integration on `poc/real-sample/`: add a sample `docs/component-map/<id>.cmap.yaml` resolving e.g. `report-dashboard`'s `ngComponentOutlet` → assert the edge becomes `resolved via:'override'` and the component drops out of `cmap gaps`; `gaps --write` scaffolds expected skeletons.
- PR-bot Action: validated by `cmap pr` output test + a manual workflow dry-run (full CI gating is light; champion beta is a process step, not code).

## 10. Risks / deferred

- **Adoption** (plan v2's death point): mitigated by tool-scaffolded skeletons (user fills only `target`) + the PR bot's early value. Mandatory CI linter + full migration → **Phase 2b (M4)**.
- Override `target` resolution inherits locator ambiguity (reported, not guessed).
- PR-bot rebuild cost in CI scales with repo size (acceptable now; ties into the deferred perf work).
- `js-yaml` dependency added (tool-owned data only) — owner-approved.

## 11. Out of scope (M3)

Editing project MD; mandatory linter/enforcement (Phase 2b); renderer/Mermaid/HTML interactive (Phase 3); auto dynamic-dep resolution; 500-comp perf benchmark.
