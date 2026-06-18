# Dependency Security & Source-Code Egress Audit — `cmap`

- **Date:** 2026-06-01
- **Target:** `tool/` (component-map CLI), git `master` @ `20fb77e` (clean working tree)
- **Question:** Can any third-party library used by the tool leak/exfiltrate the Angular source code it analyzes (network exfiltration, telemetry, phone-home, malicious install scripts, or known CVEs)?
- **Method:** Static analysis (dependency inventory + `npm audit` + network-API grep of dependency code) **+** dynamic verification (runtime egress probe that hooks Node's network primitives, blocks + logs every external connection while the tool runs).
- **Verdict:** ✅ **No runtime source-code egress.** The source-processing pipeline (`ts-morph` + `@angular/compiler` → graph → report) makes **zero outbound network connections**. Residual risk is limited to (a) distribution of *report artifacts* (metadata only, not source bodies) and (b) the Mermaid bundle executing in a **browser** when a report is opened — both mitigable by policy + CSP, not library defects.

---

## 1. Dependency inventory

Direct dependencies (`tool/package.json`); 150 packages installed transitively.

| Type | Package | Version | Role | Touches source? | Network refs in code |
|---|---|---|---|---|---|
| Runtime | `ts-morph` | 24.0.0 | read + AST of TypeScript | ✅ reads | ❌ 0 (`http/net/dns/tls`) |
| Runtime | `@angular/compiler` | 19.2.14 | parse templates | ✅ reads | ❌ 0 |
| Runtime | `js-yaml` | 4.1.0 | parse tool-owned `.cmap.yaml` | ⚠️ tool data | ❌ 0 |
| Runtime | `mermaid` | ^11.15.0 | **`readFileSync` only**, inlined into HTML; never executed in Node | ❌ not executed server-side | ⚠️ browser-only (see §5) |
| Dev/CI | `vitest`, `@vitest/coverage-v8`, `tsx`, `esbuild`, `vite`, `typescript` | — | test / transpile | ✅ at test time | dev-server only (see §4) |

**Install lifecycle scripts (supply-chain RCE vector):** only `esbuild` (`postinstall → node install.js`, downloads its native binary from the npm registry). This is a *download*, not an upload — not a source-leak vector. No other installed package has `preinstall`/`install`/`postinstall`.

**Note:** grep hits for `@angular/core` / `@angular/router` are **string literals / comments** (the tool *analyzes* the target repo's imports). Neither is declared in `package.json` nor installed — confirmed not a real dependency.

---

## 2. Known CVEs (`npm audit`) — 9 vulnerabilities, classified by relevance to the shipped CLI

| Advisory | Package | Severity | On the `cmap` CLI runtime path? |
|---|---|---|---|
| GHSA-9crc-q9x8-hgqq — Vitest RCE when API server listening + malicious website visited | `vitest`, `@vitest/coverage-v8` | **Critical ×2** | ❌ Dev/CI only — not shipped in the CLI |
| GHSA-67mh-4wv8-2f99 — esbuild dev-server lets any site read responses (source exposure during dev) | `esbuild` ← `tsx`/`vite` | Moderate | ❌ Dev only — tool never runs `esbuild serve` |
| GHSA-v4hv-rgfq-gp49 / GHSA-jrmj-c5cx-3cw6 / GHSA-g93w-mfhg-p222 — Angular XSS via SVG/MathML/i18n | `@angular/compiler` | **High** | ⚠️ Concerns *rendering* Angular in a browser; tool only *parses* → not triggered. Patch still advised |
| GHSA-mh29-5h37-fv8m — js-yaml prototype pollution via merge `<<` | `js-yaml` | Moderate | ⚠️ Only with `<<` merge keys in a `.cmap.yaml` (team-owned). Defense: strip `__proto__` at parse |

The 2 Critical + esbuild advisories are **dev/CI-only**; none execute inside the built tool's runtime. The most source-leak-relevant of them (esbuild/vitest dev-server) only matters if a developer runs the test server *and* browses a malicious site simultaneously — low probability, documented in the runbook recommendation.

---

## 3. Static evidence — no network API in runtime deps

Grep over `node_modules/{@angular/compiler,js-yaml,ts-morph}` for `require('http'|'https'|'net'|'dns'|'tls'|'dgram')`, `http(s).request/get`, `XMLHttpRequest`, `fetch(`, `WebSocket`, `navigator.sendBeacon`:

```
@angular/compiler  → 0 files reference http/net/dns/tls
js-yaml            → 0 files reference http/net/dns/tls
ts-morph           → 0 files reference http/net/dns/tls
```

`mermaid/dist/mermaid.min.js` (3,312,967 bytes) contains `fetch(` ×3 and 29 unique `http(s)://` URLs — all are XML namespaces (w3.org SVG/MathML), licenses, and doc links (chevrotain, wikipedia, jquery, marked); none are exfil endpoints. The `fetch` call-sites belong to mermaid features (architecture-diagram icon loading) **not** on the `flowchart`/`svg` path the tool uses, and the report sets `securityLevel: 'strict'` (`tool/src/cli/html.ts:41`).

**Where the source actually goes:**
- Read by `ts-morph` + `@angular/compiler` into in-memory AST — no network.
- Output artifacts (`.cmap/graph.json`, HTML reports) contain **structural metadata** (className, filePath, selector, route paths, MD-derived componentId/description/images) — **no function bodies / source text**.
- The only intentional egress is `cmap pr`, which posts a comment to the team's **own Azure DevOps** via `$(System.AccessToken)` in CI (verified injection-safe in prior review). This is tool behavior, not a library phoning home.

---

## 4. Dynamic verification — runtime egress probe

A probe (`egress-probe.cjs`, scratch, removed after the run) was preloaded via `node --require <probe> --import tsx ...` so it hooks the network layer **before** the tool loads and runs **in the same process**:

- Hooked `net.Socket.prototype.connect` (the choke-point for all outbound TCP), `dns.lookup/resolve*`, `tls.connect`, and global `fetch`.
- Policy: **allow loopback/IPC, block + log every external destination** with a stack trace. Blocking is enforced (`socket.destroy()` / `throw` / rejected promise), so any real dependency on network would also surface as a tool failure.

### Scenarios run (on the real Angular sample `poc/real-sample/src`, 18 components)

| Command | Code path exercised | External egress |
|---|---|---|
| `index` (cache hit) | load `graph.json` | **0** |
| `index` (**full rebuild**, `fromCache:false`) | ts-morph + @angular/compiler **parse all** `.ts`/`.html`, build edges/routes | **0** |
| `query app-data-table --html` | locator + impact/access-path + **Mermaid subgraph** | **0** |
| `render --html` | whole-graph SVG + **inline 3.3 MB Mermaid runtime** | **0** |
| **Control** (empty `.ts`, no tool code) | tsx/esbuild only | **0** |

### Observations

- **External connections (blocked): 0** in every command — including the full-rebuild parse and the HTML/Mermaid generation paths.
- **Loopback: exactly 2** `127.0.0.1` connects. The **control run (no tool code) produced the identical 2** → they are the **tsx/esbuild dev-runner handshake**, not the tool. When `cmap` runs on plain transpiled `node` (no tsx), these disappear too.
- With external connections hard-blocked, the tool still produced **identical correct output** (18 components / 28 edges / 2 routes / 0 parse errors) → it does **not depend on network** to function.

---

## 5. Residual risk & limitations (stated honestly)

- **Probe scope = main Node process only.** `cmap audit` spawns `git log` in a **child process** (no probe), but that is local `git` reading commit history — not library egress; statically verified to use `execFileSync` with array args (no shell).
- **Mermaid runs in the browser** when a report is opened — the dynamic probe measured the Node side, not the browser side. The 3.3 MB bundle has latent `fetch` capability not reached by the tool's render path + `securityLevel:'strict'`, but a hard guarantee requires a **CSP** in the report.
- Single-sample run. Results are expected to hold for any repo because the dependencies contain no network code, but the probe can be re-run against a real target repo if required.

---

## 6. Recommendations (priority: reduce source-leak surface)

1. **Patch dev/CI CVEs** (no runtime impact): `vitest` / `@vitest/coverage-v8` → ≥ 2.1.9 (pulls fixed `vite`/`esbuild`), closing both Critical + the esbuild dev-server advisory.
2. **`js-yaml` → 4.2.0** (prototype-pollution fix) + strip `__proto__`/`constructor`/`prototype` keys at override parse time.
3. **`@angular/compiler` → 19.2.24** (within the patch range, fixes 3 XSS advisories); update the compatibility matrix.
4. **Add a CSP** to generated HTML reports — e.g. `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">` — to make any browser-side `fetch`/CDN call technically impossible (turns "low risk" into "blocked by construction").
5. **Runbook note:** never run `vitest` with its API/UI server enabled on a host that can browse untrusted sites (already the default-off behavior).

---

## Appendix — reproduce the dynamic test

1. Create `tool/egress-probe.cjs` that hooks `net.Socket.prototype.connect`, `dns.lookup/resolve*`, `tls.connect`, and `globalThis.fetch`; allow loopback (`127.*`, `::1`, `localhost`, unix pipe), otherwise log destination + stack and block (`destroy`/`throw`/reject); print an `exit`-time summary of allowed-loopback vs blocked-external counts.
2. Clear cache: `rm -rf tool/.cmap <root>/.cmap`.
3. Run each command as: `node --require "$(pwd)/egress-probe.cjs" --import tsx src/cli/run.ts <cmd> --root ../poc/real-sample/src` and read the `EGRESS PROBE SUMMARY`.
4. Control: run a trivial `.ts` through the same wrapper; confirm the loopback count matches (proves loopback = tsx infra).
5. Remove the probe afterward (scratch artifact; not committed).
