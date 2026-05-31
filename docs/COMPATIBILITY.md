# Compatibility Matrix

The Component Map Tool parses Angular source with a **pinned** `@angular/compiler` (newer-parses-older is
safe: the bundled compiler reads templates from older Angular versions). Parsing is AST-only via `ts-morph`.

| Target Angular | Status | Notes |
| --- | --- | --- |
| 15.2.9 | ✅ Verified | Validated on `poc/real-sample` (18 components, NgModule-based); 19/19 edge accuracy. |
| 16 – 18 | ⚠️ Untested | Expected to work (older than the bundled compiler). Run the upgrade checklist before relying on it. |
| 19+ | ⚠️ Untested | Standalone-default flips to `true` in v19 — `STND-01` resolves version-aware defaults, but re-verify. |

**Pinned tool dependencies:** `@angular/compiler@19.2.14`, `ts-morph@24.0.0`, Node ≥ 20.

## Angular-upgrade verify checklist

When the analyzed project upgrades its Angular major version, spend ~2–3 hours verifying the tool:

- [ ] Run `cd tool && npm test` — the full suite is green.
- [ ] Run `cmap index --root <src>` on the upgraded app — no parse-error spike vs the prior run.
- [ ] Spot-check 3 components with `cmap query <c>` — impact + UI access paths still resolve.
- [ ] Confirm `standalone` classification on a few components (explicit flag / NgModule membership / version default).
- [ ] If parsing breaks, bump `@angular/compiler` to the project's major (or the next that parses it) and re-run.
- [ ] Update the row above and `CHANGELOG.md`.
