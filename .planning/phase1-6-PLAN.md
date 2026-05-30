# Phase 1 — Plan 6: Caching / Incremental Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Avoid recomputing the graph when nothing changed: maintain a content-hash `manifest.json`, and on each build either return the cached `graph.json` (no source changed) or do a **full, sound** rebuild (any change). Expose the hash-diff primitives a future warm-project incremental can use.

**Architecture:** One task. `cache/manifest.ts` = pure hashing + manifest read/write/diff. `cache/index.ts` = `buildIncremental(root, cmapDir)`: hash sources → if manifest+graph match, load cached graph; else full `buildGraphFromRoot` + persist graph + manifest. **Soundness:** any change triggers a FULL rebuild (the global selector/NgModule registry is rebuilt), so we never emit stale edges from a partial re-resolve (RESEARCH §5). Fine-grained per-file re-parse (warm Project) is a documented follow-up the diff primitives enable.

**Tech Stack:** Node ESM (fs, crypto), vitest.

---

```yaml
must_haves:
  observable_truths:
    - "hashSources(root) returns a deterministic relPath->sha256 map over .ts files, excluding *.spec.ts / dist / node_modules / .cmap."
    - "buildIncremental: first run rebuilds (fromCache:false) and writes graph.json + manifest.json; an unchanged second run returns fromCache:true with the same graph; changing a source triggers a fresh rebuild (fromCache:false)."
    - "A schemaVersion bump or an unreadable graph.json forces a rebuild (never serves a stale/incompatible cache)."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/cache/manifest.ts — hashSources, Manifest, readManifest, writeManifest, hashesEqual, diffManifest"
    - "tool/src/cache/index.ts — buildIncremental(root, cmapDir) -> { graph, parseErrors, fromCache, changed }"
    - "tests for both"
  required_wiring:
    - "CLI (Plan 9) calls buildIncremental for `cmap index`; Query (Plan 7) loads the graph buildIncremental produced."
    - "Uses buildGraphFromRoot/writeGraph (Plan 5) + loadGraph + SCHEMA_VERSION."
  key_links:
    - "any change => FULL rebuild => no stale-registry edges (RESEARCH §5 soundness)"
    - "content-hash manifest + .cmap artifacts (RESEARCH §1/§8)"
```

---

## File Structure

- `tool/src/cache/manifest.ts` — pure hashing + manifest I/O + diff. One responsibility: change detection.
- `tool/src/cache/index.ts` — cache-or-rebuild orchestration. One responsibility: produce a graph using the cache.
- Tests alongside.

---

## Wave: Cache

### Task 12: Content-hash manifest + cache-or-rebuild

<model>opus</model>

<read_first>
- `tool/src/graph/index.ts` (buildGraphFromRoot, writeGraph), `tool/src/graph/assemble.ts` (loadGraph), `tool/src/types.ts` (SCHEMA_VERSION, Graph)
- `.planning/phase1-RESEARCH.md` §1 (incremental via hashes), §5 (soundness: a changed selector affects OTHER files → rebuild full registry; we do a full rebuild on any change)
</read_first>

**Files:**
- Create: `tool/src/cache/manifest.ts`
- Test: `tool/src/cache/manifest.test.ts`
- Create: `tool/src/cache/index.ts`
- Test: `tool/src/cache/index.test.ts`

<action>

- [ ] **Step 1: Write the failing test for manifest** — `tool/src/cache/manifest.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashSources, readManifest, writeManifest, hashesEqual, diffManifest } from './manifest.js';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-m-')); }

describe('hashSources', () => {
  it('hashes .ts files (relative keys), excluding specs/dist/node_modules', () => {
    const d = tmp();
    try {
      mkdirSync(join(d, 'sub'), { recursive: true });
      writeFileSync(join(d, 'a.ts'), 'export const a = 1;');
      writeFileSync(join(d, 'sub', 'b.ts'), 'export const b = 2;');
      writeFileSync(join(d, 'a.spec.ts'), 'test');
      mkdirSync(join(d, 'node_modules'), { recursive: true });
      writeFileSync(join(d, 'node_modules', 'x.ts'), 'ignored');
      const h = hashSources(d);
      expect(Object.keys(h).sort()).toEqual(['a.ts', 'sub/b.ts']);
      expect(h['a.ts']).toMatch(/^[0-9a-f]{64}$/);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('hash changes when content changes', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, 'a.ts'), 'export const a = 1;');
      const h1 = hashSources(d)['a.ts'];
      writeFileSync(join(d, 'a.ts'), 'export const a = 2;');
      expect(hashSources(d)['a.ts']).not.toBe(h1);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('manifest io + diff', () => {
  it('round-trips and compares', () => {
    const d = tmp();
    try {
      writeManifest(d, { schemaVersion: 1, hashes: { 'a.ts': 'x' } });
      expect(readManifest(d)).toEqual({ schemaVersion: 1, hashes: { 'a.ts': 'x' } });
      expect(hashesEqual({ a: '1' }, { a: '1' })).toBe(true);
      expect(hashesEqual({ a: '1' }, { a: '2' })).toBe(false);
      expect(diffManifest({ a: '1', b: '1' }, { a: '2', c: '1' })).toEqual({ changed: ['a'], added: ['c'], deleted: ['b'] });
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('readManifest returns null when absent', () => {
    const d = tmp();
    try { expect(readManifest(d)).toBeNull(); } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/cache/manifest.test.ts`

- [ ] **Step 3: Implement `tool/src/cache/manifest.ts`**

```ts
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export interface Manifest { schemaVersion: number; hashes: Record<string, string>; }

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.cmap']);

function walkTs(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (!IGNORED_DIRS.has(name.name)) walkTs(join(dir, name.name), acc);
    } else if (name.name.endsWith('.ts') && !name.name.endsWith('.spec.ts') && !name.name.includes('.actual.')) {
      acc.push(join(dir, name.name));
    }
  }
}

// Deterministic relPath(forward-slash) -> sha256 of file contents, over source .ts files.
export function hashSources(root: string): Record<string, string> {
  const files: string[] = [];
  walkTs(root, files);
  const out: Record<string, string> = {};
  for (const f of files.sort()) {
    const rel = relative(root, f).replace(/\\/g, '/');
    out[rel] = createHash('sha256').update(readFileSync(f)).digest('hex');
  }
  return out;
}

export function readManifest(cmapDir: string): Manifest | null {
  const p = join(cmapDir, 'manifest.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Manifest) : null;
}

export function writeManifest(cmapDir: string, manifest: Manifest): void {
  mkdirSync(cmapDir, { recursive: true });
  writeFileSync(join(cmapDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

export function hashesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export function diffManifest(
  oldH: Record<string, string>,
  newH: Record<string, string>,
): { changed: string[]; added: string[]; deleted: string[] } {
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  for (const k of Object.keys(newH)) {
    if (!(k in oldH)) added.push(k);
    else if (oldH[k] !== newH[k]) changed.push(k);
  }
  for (const k of Object.keys(oldH)) if (!(k in newH)) deleted.push(k);
  return { changed, added, deleted };
}
```

- [ ] **Step 4: Run, verify PASS** (4 tests).

- [ ] **Step 5: Write the failing test for buildIncremental** — `tool/src/cache/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIncremental } from './index.js';

function tmpRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'cmap-i-'));
  writeFileSync(join(d, 'x.ts'), `
    import { Component, NgModule } from '@angular/core';
    @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
    @Component({ selector: 'app-parent', template: '<app-child></app-child>' }) export class ParentComponent {}
    @NgModule({ declarations: [ChildComponent, ParentComponent] }) export class M {}`);
  return d;
}

describe('buildIncremental', () => {
  it('rebuilds on first run, serves cache when unchanged, rebuilds after a change', () => {
    const root = tmpRepo();
    const cmap = join(root, '.cmap');
    try {
      const first = buildIncremental(root, cmap);
      expect(first.fromCache).toBe(false);
      expect(existsSync(join(cmap, 'graph.json'))).toBe(true);
      expect(existsSync(join(cmap, 'manifest.json'))).toBe(true);
      expect(first.graph.components.length).toBe(2);

      const second = buildIncremental(root, cmap);
      expect(second.fromCache).toBe(true);
      expect(second.graph.components.length).toBe(2);

      // change a source file => rebuild
      writeFileSync(join(root, 'x.ts'), `
        import { Component, NgModule } from '@angular/core';
        @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
        @NgModule({ declarations: [ChildComponent] }) export class M {}`);
      const third = buildIncremental(root, cmap);
      expect(third.fromCache).toBe(false);
      expect(third.graph.components.length).toBe(1);
      expect(third.changed).toContain('x.ts');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 6: Run, verify FAIL.** `cd tool && npx vitest run src/cache/index.test.ts`

- [ ] **Step 7: Implement `tool/src/cache/index.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../types.js';
import { SCHEMA_VERSION } from '../types.js';
import { buildGraphFromRoot, writeGraph } from '../graph/index.js';
import { loadGraph } from '../graph/assemble.js';
import { hashSources, readManifest, writeManifest, hashesEqual, diffManifest } from './manifest.js';

export interface IncrementalResult {
  graph: Graph;
  parseErrors: { component: string; messages: string[] }[];
  fromCache: boolean;
  changed: string[];
}

// Cache-or-rebuild. Any source change (or schemaVersion bump / unreadable cache) triggers a
// FULL rebuild — sound, because the global selector/NgModule registry is rebuilt every time
// (a partial per-file re-resolve would emit stale edges; see RESEARCH §5).
export function buildIncremental(root: string, cmapDir: string): IncrementalResult {
  const current = hashSources(root);
  const old = readManifest(cmapDir);
  const graphPath = join(cmapDir, 'graph.json');

  if (old && old.schemaVersion === SCHEMA_VERSION && hashesEqual(old.hashes, current) && existsSync(graphPath)) {
    try {
      const graph = loadGraph(readFileSync(graphPath, 'utf8'));
      return { graph, parseErrors: [], fromCache: true, changed: [] };
    } catch {
      // unreadable/incompatible cache => fall through to rebuild
    }
  }

  const { graph, parseErrors } = buildGraphFromRoot(root);
  writeGraph(graph, cmapDir);
  writeManifest(cmapDir, { schemaVersion: SCHEMA_VERSION, hashes: current });
  const d = old ? diffManifest(old.hashes, current) : { changed: Object.keys(current), added: [], deleted: [] };
  return { graph, parseErrors, fromCache: false, changed: [...d.changed, ...d.added, ...d.deleted] };
}
```

- [ ] **Step 8: Run, verify PASS** (1 test).

- [ ] **Step 9: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 10: Commit**

```bash
cd tool && git add src/cache/manifest.ts src/cache/manifest.test.ts src/cache/index.ts src/cache/index.test.ts
git commit -m "feat(tool): content-hash manifest + sound cache-or-rebuild (buildIncremental)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. Critically: first build writes graph.json+manifest.json (fromCache:false); an unchanged rerun is a cache hit (fromCache:true); editing a source rebuilds (fromCache:false) and reflects the change (2→1 components), with the changed file listed.
</verify>

<done>
`buildIncremental(root, cmapDir)` serves a cached graph when nothing changed and does a full sound rebuild otherwise, persisting `graph.json` + `manifest.json` under `.cmap/`. Fine-grained per-file re-parse (warm Project) is a documented follow-up enabled by `diffManifest`.
</done>

---

## Self-Review (Plan 6)

- **Spec coverage:** SAC-05 (content-hash manifest, incremental build via cache). Soundness honored by full-rebuild-on-change (RESEARCH §5). Perf benchmark deferred per spec §11. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `Manifest {schemaVersion, hashes}`; `buildIncremental` returns `{graph, parseErrors, fromCache, changed}`; reuses `buildGraphFromRoot`→`{graph,parseErrors}`, `writeGraph`, `loadGraph`, `SCHEMA_VERSION`. fs/crypto from `node:`. NodeNext `.js` imports. ✓
- **Known limitation (noted):** Phase 1 does cache-or-FULL-rebuild, not per-file partial re-parse — sound but not the minimal-work incremental; the `<5s` target + warm-Project refresh are deferred (benchmark deferred too). ✓
- **Verify bounds:** task verifies <60s. ✓
