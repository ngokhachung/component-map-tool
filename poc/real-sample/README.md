# real-sample — verify the POC against REAL Angular code

Drop a few representative **real** Angular source files here, then run:

```bash
npm run verify:real
```

This runs the three POC parsers (component / routing / template) over everything
under this folder and prints JSON to stdout (also written to
`verify-real.actual.json`, which is gitignored). **No `expected.json` needed** —
this is smoke / eyeball verification, not scored like the synthetic `fixtures/` suite.

## What to put here

- **Components** — `*.component.ts` (NgModule-based or standalone). Inline
  `template` is parsed directly; `templateUrl` is resolved relative to the `.ts`
  file, so drop the sibling `.html` too.
- **Routes** — any file with `provideRouter`, `RouterModule.forRoot/forChild`, or a
  `: Routes` typed array (e.g. `app.routes.ts`, `*-routing.module.ts`).
- **Templates** — covered via the components above; standalone `.html` files are
  only parsed when referenced by a component's `templateUrl`.

Subfolders are fine — `*.ts` is globbed recursively.

## What it reports

- `components[]` — extracted metadata (selector, inputs/outputs, standalone, module).
- `selectorRegistry[]` — selector→class map auto-built from the components found
  here, then used to resolve template child-component deps.
- `routes[]` — parsed route trees per route file.
- `templates[]` — resolved / indirect / unresolved-static child deps per component.
- `summary.standaloneMisclassified` — count of components whose raw `standalone`
  (v19-default heuristic) disagrees with `standaloneResolved` (NgModule-membership
  cross-check). On a pure Angular-15 NgModule repo this should equal the component
  count — see `STND-01` in `REQUIREMENTS.md`.

## Repeatable / regression check (golden baseline)

Smoke mode has no pass/fail. To make verification repeatable, snapshot a reviewed
output as a committed baseline and diff future runs against it:

```bash
npm run verify:real:bless    # write verify-real.expected.json from current output
npm run verify:real:check    # rebuild + diff vs baseline; exit 1 (with paths) if it drifts
```

- `verify-real.expected.json` is committed (it is NOT a `*.actual.json`, so not gitignored).
- Output is sorted deterministically, so the baseline diff is machine-independent.
- `:check` prints precise paths of every difference, e.g.
  `components[3].selector: expected "app-x" | actual "app-y"`.
- After an **intentional** sample change, re-run `:bless` to update the baseline.

## Caveats (smoke mode)

- No ground truth → no pass/fail; you eyeball whether the output is sane.
- Template deps only resolve to components **present in this folder** (registry is
  built from local components, not your whole app).
- Route detection reuses the POC's over-broad `findRoutesArray` fallback — flagged
  in `phase0-SUMMARY.md` as a Phase 1 fix. Double-check route files with array
  literals that aren't actually routes.
