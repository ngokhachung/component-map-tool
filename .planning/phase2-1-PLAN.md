# M3 — Plan 1: Foundation (types + deps + MD description) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extend the shared contracts for M3 — `Edge.via: 'override'`, `ComponentNode.description`, bump `SCHEMA_VERSION` to 2 — add the `js-yaml` dependency, and have `MdIndex` capture the read-only project-MD description (`機能概要`).

**Architecture:** Two tasks. T1 ripples the type changes through the (few) ComponentNode constructors + bumps the cache schema. T2 extends the existing `md/` parser to read `## コンポーネント機能概要` into `node.description`. Builds on Phase 1.

**Tech Stack:** TS/Node ESM, ts-morph, `js-yaml` (new), vitest.

---

```yaml
must_haves:
  observable_truths:
    - "SCHEMA_VERSION === 2; Edge.via accepts 'override'; ComponentNode has a required `description: string | null`."
    - "assembleGraph sets description:null; the full suite + tsc stay green after the type ripple."
    - "parseMdDoc reads the `## コンポーネント機能概要` text into `description`; enrichGraph sets `node.description` for linked nodes."
    - "js-yaml + @types/js-yaml installed; `npm test` + `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/types.ts (Edge.via +'override', ComponentNode.description, SCHEMA_VERSION=2)"
    - "tool/src/graph/assemble.ts (description:null on assembled nodes)"
    - "tool/src/md/parse.ts + index.ts (description) + tests"
    - "tool/package.json (js-yaml, @types/js-yaml)"
  required_wiring:
    - "Overrides (Plan 2) parse .cmap.yaml with js-yaml and add via:'override' edges; PR renderer (Plan 5) shows node.description."
  key_links:
    - "schemaVersion bump -> old .cmap cache rebuilds via the existing loadGraph guard"
    - "js-yaml is a tool-owned data parser (not an Angular analysis tool) -> in-policy (owner-approved, RESEARCH §5)"
```

---

## File Structure

- `tool/src/types.ts` — contracts (modify: Edge.via, ComponentNode.description, SCHEMA_VERSION).
- `tool/src/graph/assemble.ts` — set `description: null` on assembled nodes (modify).
- `tool/src/md/parse.ts`, `index.ts` — capture `機能概要` (modify).
- `tool/package.json` — add `js-yaml` + `@types/js-yaml` (modify).
- Tests modified alongside.

---

## Wave 1

### Task 1: Type changes + js-yaml dependency

<model>sonnet</model>

<read_first>
- `tool/src/types.ts`, `tool/src/graph/assemble.ts`
- `docs/specs/2026-05-31-phase2-md-overrides-pr-bot-design.md` §5 (data model changes)
</read_first>

**Files:**
- Modify: `tool/src/types.ts`, `tool/src/graph/assemble.ts`, `tool/src/types.test.ts`, `tool/src/query/locator.test.ts`, `tool/src/md/index.test.ts`, `tool/package.json`

<action>

- [ ] **Step 1: Edit `tool/src/types.ts`** — three changes:
  1. `export const SCHEMA_VERSION = 1;` → `export const SCHEMA_VERSION = 2;`
  2. In `Edge`, change `via: 'template' | 'route';` → `via: 'template' | 'route' | 'override';`
  3. In `ComponentNode`, add after `images`: `description: string | null;  // from project MD 機能概要 (read-only), else null`

- [ ] **Step 2: Edit `tool/src/graph/assemble.ts`** — in `assembleGraph`, the node map adds `description: null`:

```ts
  const components: ComponentNode[] = records.map((r) => ({
    ...r,
    id: r.className,
    componentId: null,
    docPath: null,
    images: [],
    description: null,
  }));
```

- [ ] **Step 3: Update the ComponentNode constructors in tests** — add `description: null` to each `node()` helper / sample literal:
  - `tool/src/types.test.ts`: in the sample `node` object add `description: null,`; and change `expect(SCHEMA_VERSION).toBe(1);` → `expect(SCHEMA_VERSION).toBe(2);`
  - `tool/src/query/locator.test.ts`: in the `node()` helper return object add `description: null,`
  - `tool/src/md/index.test.ts`: in the `node()` helper return object add `description: null,`

- [ ] **Step 4: Add deps to `tool/package.json`** — under `dependencies` add `"js-yaml": "4.1.0"`; under `devDependencies` add `"@types/js-yaml": "4.0.9"`. Then run `npm --prefix tool install`. (If those exact versions are unavailable, use the nearest published 4.x and note it.)

- [ ] **Step 5: Run full suite + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all tests PASS (78), tsc clean. The type ripple compiles and no test broke.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/types.ts src/graph/assemble.ts src/types.test.ts src/query/locator.test.ts src/md/index.test.ts package.json package-lock.json
git commit -m "feat(tool): M3 types (Edge.via override, ComponentNode.description, schemaVersion 2) + js-yaml dep"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `SCHEMA_VERSION===2`, `Edge.via` accepts `'override'`, every assembled/constructed `ComponentNode` has `description`. js-yaml resolvable.
</verify>

<done>
The shared contracts carry M3's new fields, the cache schema is bumped, and `js-yaml` is available. No behavior change yet — overrides/description get populated in later tasks.
</done>

---

### Task 2: MD description (`機能概要`) enrichment (OVR-05)

<model>sonnet</model>

<read_first>
- `tool/src/md/parse.ts` (MdDoc + extractors), `tool/src/md/index.ts` (enrichGraph)
- `docs/components/C000011_Common_Table_Cell.md` (`## コンポーネント機能概要` section)
</read_first>

**Files:**
- Modify: `tool/src/md/parse.ts`, `tool/src/md/parse.test.ts`, `tool/src/md/index.ts`, `tool/src/md/index.test.ts`

<action>

- [ ] **Step 1: Add the failing test** — in `tool/src/md/parse.test.ts`, add inside `describe('parseMdDoc', ...)`:

```ts
  it('extracts the 機能概要 description', () => {
    expect(parseMdDoc(SAMPLE, 'components/C000011.md').description).toBe('Displays information.');
  });
  it('description is null when the section is absent', () => {
    expect(parseMdDoc('# [C1] Bare', 'x.md').description).toBeNull();
  });
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/md/parse.test.ts` (property `description` missing).

- [ ] **Step 3: Implement in `tool/src/md/parse.ts`**:
  1. Add to the `MdDoc` interface: `description: string | null;`
  2. Add an extractor:

```ts
function extractDescription(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s*コンポーネント機能概要/.test(lines[i])) {
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && !/^#/.test(lines[j]); j++) {
        if (lines[j].trim()) body.push(lines[j].trim());
      }
      return body.length ? body.join(' ') : null;
    }
  }
  return null;
}
```
  3. In `parseMdDoc`, add `description: extractDescription(lines),` to the returned object.

- [ ] **Step 4: Run, verify PASS.** `cd tool && npx vitest run src/md/parse.test.ts`

- [ ] **Step 5: Add the failing test for enrich** — in `tool/src/md/index.test.ts`, extend the first enrich test (the FooComponent one) with: after `enrichGraph(graph, dir)`, assert the linked node's description. To do that, change the `C1.md` fixture in that test to include a description section and assert it. Concretely, add this `it` to the `describe('enrichGraph', ...)` block:

```ts
  it('sets node.description from the project MD', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-md-'));
    try {
      writeFileSync(join(dir, 'D1.md'), `# [D1] Foo

## コンポーネント機能概要
A reusable foo.

## ソースパス
\`features/foo/foo.component.ts\`
`);
      const graph: Graph = { schemaVersion: 2, components: [node('FooComponent', 'src/app/features/foo/foo.component.ts')], edges: [], routes: [] };
      enrichGraph(graph, dir);
      expect(graph.components[0].description).toBe('A reusable foo.');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
```

- [ ] **Step 6: Run, verify FAIL.** `cd tool && npx vitest run src/md/index.test.ts` (description not set).

- [ ] **Step 7: Implement in `tool/src/md/index.ts`** — in the `enrichGraph` per-doc loop, where the matched node fields are set, add:

```ts
    node.description = d.description;
```
(alongside the existing `node.docPath = d.mdPath; node.images = d.images;`).

- [ ] **Step 8: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 9: Commit**

```bash
cd tool && git add src/md/parse.ts src/md/parse.test.ts src/md/index.ts src/md/index.test.ts
git commit -m "feat(tool): MdIndex captures 機能概要 description into node.description (OVR-05)"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. `parseMdDoc` reads `機能概要` → `description` (null when absent); `enrichGraph` sets `node.description` on the linked node.
</verify>

<done>
`MdIndex` now surfaces the read-only project-MD description on the graph node (OVR-05) — consumed by the PR comment + query output later. Project MD remains read-only (read-only extraction).
</done>

---

## Self-Review (Plan 1)

- **Spec coverage:** §5 data-model (Edge.via override, ComponentNode.description, schemaVersion bump), OVR-05 (description from 機能概要), js-yaml dep. ✓
- **Placeholder scan:** complete code/edits/commands; no TBD. ✓
- **Type consistency:** `description: string | null` added to ComponentNode AND set in assembleGraph + all 3 test constructors (ripple complete); `MdDoc.description` consumed by enrichGraph. SCHEMA_VERSION 2 reflected in types.test + the new md/index test fixture (`schemaVersion: 2`). NodeNext `.js` imports unchanged. ✓
- **Verify bounds:** both tasks <60s. ✓
