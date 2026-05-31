# M5 (Phase 3) — UAT

**Milestone:** M5 — Renderer & UX · **Date:** 2026-05-31
**Branch:** feature/phase3-renderer-ux-2026-05-31
Run from `tool/` (`cd tool`; or `npm --prefix tool ...`). AI does not mark M5 done until you confirm.

---

## 1. Tests + coverage
```
npm run test:cov
```
**Expected:** 146 tests pass (41 files); coverage ≈98% lines / 89% branch; exit 0.

## 2. Typecheck
```
npx tsc --noEmit
```
**Expected:** no output (clean).

## 3. Per-component report with Mermaid subgraph
```
npm run cmap -- query DataTableComponent --root ../poc/real-sample/src --html ../poc/real-sample/q.html
```
**Expected:** writes `q.html`. **Open it in a browser with WiFi OFF** — it must render fully offline: the existing sections (meta / impact / UI access paths) **plus** a "Dependency graph" section showing a Mermaid diagram of DataTableComponent's neighborhood (ancestors above, children below, route entries; dashed edges = dynamic/uncertain). Hover a node → a native tooltip shows its file path · selector. (Clean up `q.html` after.)

## 4. Whole-graph interactive overview
```
npm run cmap -- render --root ../poc/real-sample/src --html ../poc/real-sample/graph.html
```
**Expected:** prints `wrote …/graph.html (18 components, N resolved edges)`. **Open offline** — a whole-graph SVG. Verify: the **search box** dims non-matching components as you type; **mouse wheel** zooms and **drag** pans; **click a node** → it highlights, its incident edges turn gold, and the right-hand panel shows that component's file/selector/module/standalone. (Clean up `graph.html` after.)

## 5. Guard
```
npm run cmap -- render --root ../poc/real-sample/src
```
**Expected:** exit code 1, message `render requires --html <file>`.

---

## UAT Checklist (tick when verified)

- [ ] **Tests + coverage** — `npm run test:cov` → 146 pass, coverage ≥80% (≈98%/89%), exit 0.
- [ ] **Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **query --html renders offline** — open `q.html` with network OFF → existing sections + a Mermaid neighborhood diagram; dashed edges for dynamic deps; hover tooltip shows file·selector.
- [ ] **render --html whole graph** — open `graph.html` offline → SVG of all 18 components; search dims non-matches; wheel-zoom + drag-pan work; click → highlight + meta panel.
- [ ] **render guard** — `render` without `--html` → exit 1.
- [ ] **(optional) large-repo sanity** — point `--root` at a bigger Angular app; confirm the whole-graph page stays usable via search/pan-zoom (layout is a modest layered overview, not force-directed).

## Confirm
When green, reply **"confirmed"** → ship. Or describe any difference (command + expected vs actual) and AI fixes first.

> **Status: UAT DEFERRED** (user runs later, as with M2/M3/M4). Goal-backward verification already PASS (`phase3-VERIFICATION.md`, 6/6 REQ); final holistic review APPROVED (offline guarantee verified against the real Mermaid bundle).
