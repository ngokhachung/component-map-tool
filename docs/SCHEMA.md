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
