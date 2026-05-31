# component-maping

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
