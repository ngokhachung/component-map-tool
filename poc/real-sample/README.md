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

## Caveats (smoke mode)

- No ground truth → no pass/fail; you eyeball whether the output is sane.
- Template deps only resolve to components **present in this folder** (registry is
  built from local components, not your whole app).
- Route detection reuses the POC's over-broad `findRoutesArray` fallback — flagged
  in `phase0-SUMMARY.md` as a Phase 1 fix. Double-check route files with array
  literals that aren't actually routes.
