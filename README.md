# component-maping

Angular component dependency-graph + UI access-path tool (`cmap`). It statically indexes an Angular
codebase into a component graph, then answers "what does this component use / what uses it / how does a
user reach it in the UI", renders HTML/Mermaid views, and enforces documentation coverage in CI.

## Repository layout

| Path | What it is |
|---|---|
| `tool/` | The production CLI (`cmap`) — TypeScript, run via `tsx`, tested with Vitest |
| `poc/` | Throwaway Phase 0 spikes that validated Angular parsing feasibility (not production code) |
| `poc/real-sample/` | Real Angular sample app used as a test fixture and demo target |
| `docs/` | Schema, compatibility, and maintenance docs |
| `specs/`, `.planning/` | Design specs and workflow state files |

## Prerequisites

- **Node.js ≥ 20** (verified on Node 24)
- npm (comes with Node)

## Getting started

```bash
cd tool
npm install
```

### Verify the build

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (161 tests)
npm run test:cov    # with coverage
```

### Run the CLI

All commands run through the `cmap` npm script (note the `--` before cmap's own arguments):

```bash
npm run cmap -- <command> [options]
```

Quick smoke test against the bundled sample app:

```bash
npm run cmap -- index --root ../poc/real-sample/src
# → prints counts: components, edges, routes, parse errors, warnings
```

#### Commands

| Command | Purpose |
|---|---|
| `index` | Build/refresh the component graph (incremental, cached in `--out`) |
| `query <locator>` | Impact + UI access paths for one component (selector, class name, or file path); `--html out.html` writes a focused Mermaid view |
| `render --html out.html` | Whole-graph interactive HTML |
| `gaps` | List components missing documentation; `--write` scaffolds override files |
| `migrate` | Generate `.cmap-baseline.json` + a coverage report for adopting on an existing repo |
| `lint` | Fail on new documentation debt vs the baseline (`--changed a.ts,b.ts` to scope, `--accept` to update the baseline) |
| `pr --changed <csv>` | Render the PR impact comment used by the Azure pipeline |
| `audit` | Staleness/coverage audit; `--report prefix` writes `prefix.md` + `prefix.json` |

#### Common options

| Option | Default | Meaning |
|---|---|---|
| `--root <dir>` | `.` | Angular source root to analyze |
| `--out <dir>` | `.cmap` | Graph cache / output directory |
| `--docs <dir>` | — | Markdown docs dir used to enrich the graph (descriptions, images) |
| `--overrides <dir>` | `docs/component-map` | Per-component `*.cmap.yaml` override files |
| `--baseline <file>` | `.cmap-baseline.json` | Debt baseline for `lint` / `migrate` |

Examples:

```bash
npm run cmap -- query app-report-dashboard-page --root ../poc/real-sample/src --html report.html
npm run cmap -- render --root ../poc/real-sample/src --html graph.html
npm run cmap -- gaps --root ../poc/real-sample/src
```

### POC (optional)

The Phase 0 spikes can still be run for reference:

```bash
cd poc
npm install
npm run smoke   # parsing feasibility smoke test
npm test
```

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
