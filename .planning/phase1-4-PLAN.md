# Phase 1 — Plan 4: Edge Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Resolve each component's template into dependency `Edge`s — `resolved` child components, `indirect` (`ng-content`, `ngTemplateOutlet`), and `unresolved-static` (`ngComponentOutlet`, `@ViewChild`, `ViewContainerRef.createComponent`) — **without the POC's `*ngIf`/`*ngFor` double-count** and **without silently dropping deps on a parse error**.

**Architecture:** Two tasks. T8 = the `@angular/compiler` template visitor: match selectors on `TmplAstElement` ONLY (a structural-directive-desugared `TmplAstTemplate` carries the same tag and caused the double-count), flag outlets/content, and surface parse errors loudly. T9 = the edge builder: build a global selector registry from `ComponentRecord[]`, read each component's template (inline or `templateUrl` sibling), and emit deduped `Edge[]` plus per-component parse-error reports.

**Tech Stack:** `@angular/compiler` (parseTemplate, SelectorMatcher, TmplAst*), ts-morph, Node ESM, vitest.

---

```yaml
must_haves:
  observable_truths:
    - "A `<app-x *ngIf>` usage produces exactly ONE resolved dep for app-x (the POC double-count is gone)."
    - "ng-content -> indirect; ngTemplateOutlet -> indirect; ngComponentOutlet -> unresolved-static; @ViewChild / createComponent -> unresolved-static."
    - "A template with parse errors reports parseErrors>0 + messages (never silently returns empty deps)."
    - "buildEdges emits deduped Edge[] (from=component className, to=child className|null) and a per-component parseErrors list."
    - "`npm test` green and `tsc --noEmit` clean."
  required_artifacts:
    - "tool/src/edges/template-visitor.ts — buildMatcher, collectTemplateDeps, parseTemplateDeps, SelectorEntry, TemplateDep"
    - "tool/src/edges/index.ts — buildSelectorRegistry, buildEdges(project, records, {root}) -> { edges, parseErrors }"
    - "tests for both"
  required_wiring:
    - "Edge.from/to use component CLASS NAME (graph node id == className in Plan 5); Graph (Plan 5) embeds these edges + dedups across templates."
    - "Selector registry built from indexComponents output (Plan 2)."
  key_links:
    - "match TmplAstElement only, skip desugared Template -> fixes *ngIf/*ngFor double-count (RESEARCH §3, confirmed reproducible)"
    - "parse error => loud (parseErrors + messages), deps still collected -> never drop (RESEARCH §3, ATAM §3)"
    - "indirect/unresolved flagging -> kinds carried on every edge (SAC-02)"
```

---

## File Structure

- `tool/src/edges/template-visitor.ts` — pure `@angular/compiler` template → `TemplateDep[]` (selector matching + outlet/content flagging + parse-error surfacing). One responsibility: one template's deps.
- `tool/src/edges/index.ts` — registry + per-component template reading + `Edge[]` assembly with dedup. One responsibility: codebase-wide template edges.
- Tests alongside.

---

## Wave: Edges

### Task 8: Template visitor (double-count fix + parse-error-loud)

<model>opus</model>

<read_first>
- `tool/src/types.ts` (DepKind)
- `poc/spikes/lib/template-visitor.ts` (the recipe to port — DepCollector/buildMatcher/cssSelectorFromElement). NOTE the bug: it matches BOTH visitElement and visitTemplate, double-counting `*ngIf`/`*ngFor`. FIX: match Element only.
- `.planning/phase1-RESEARCH.md` §3 (the templateAttrs discriminator + parse-error-loud)
</read_first>

**Files:**
- Create: `tool/src/edges/template-visitor.ts`
- Test: `tool/src/edges/template-visitor.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/edges/template-visitor.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildMatcher, parseTemplateDeps } from './template-visitor.js';

const matcher = buildMatcher([
  { selector: 'app-child', className: 'ChildComponent' },
  { selector: 'app-foo', className: 'FooComponent' },
]);

describe('parseTemplateDeps', () => {
  it('resolves child components and does NOT double-count *ngIf (the POC bug)', () => {
    const html = `
      <app-child></app-child>
      <app-foo *ngIf="x"></app-foo>
      <app-child *ngFor="let c of items"></app-child>`;
    const r = parseTemplateDeps(html, 't.html', matcher);
    expect(r.parseErrors).toBe(0);
    // app-foo used once under *ngIf => exactly ONE resolved dep (not two)
    expect(r.deps.filter((d) => d.component === 'FooComponent')).toEqual([
      { tag: 'app-foo', component: 'FooComponent', kind: 'resolved', reason: null },
    ]);
    // app-child appears twice (plain + *ngFor) but dedups to one resolved dep
    expect(r.deps.filter((d) => d.component === 'ChildComponent')).toHaveLength(1);
  });

  it('flags ng-content / ngTemplateOutlet (indirect) and ngComponentOutlet (unresolved-static)', () => {
    const html = `
      <ng-content></ng-content>
      <ng-container *ngTemplateOutlet="tpl"></ng-container>
      <ng-container *ngComponentOutlet="widget"></ng-container>`;
    const kinds = parseTemplateDeps(html, 't.html', matcher).deps;
    expect(kinds.find((d) => d.reason === 'ng-content')?.kind).toBe('indirect');
    expect(kinds.find((d) => d.reason === 'ngTemplateOutlet')?.kind).toBe('indirect');
    expect(kinds.find((d) => d.reason === 'ngComponentOutlet')?.kind).toBe('unresolved-static');
  });

  it('reports parse errors loudly instead of silently returning empty deps', () => {
    const r = parseTemplateDeps(`<div [.="x"></div>`, 't.html', matcher);
    expect(r.parseErrors).toBeGreaterThan(0);
    expect(r.errorMessages.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/edges/template-visitor.test.ts`

- [ ] **Step 3: Implement `tool/src/edges/template-visitor.ts`**

```ts
import {
  parseTemplate,
  TmplAstRecursiveVisitor, tmplAstVisitAll,
  TmplAstElement, TmplAstTemplate, TmplAstContent,
  CssSelector, SelectorMatcher,
} from '@angular/compiler';
import type { DepKind } from '../types.js';

export interface SelectorEntry { selector: string; className: string; }
export interface TemplateDep { tag: string; component: string | null; kind: DepKind; reason: string | null; }

export function buildMatcher(registry: SelectorEntry[]): SelectorMatcher<string> {
  const matcher = new SelectorMatcher<string>();
  for (const e of registry) matcher.addSelectables(CssSelector.parse(e.selector), e.className);
  return matcher;
}

function cssSelectorFromElement(el: TmplAstElement | TmplAstTemplate, tag: string): CssSelector {
  const sel = new CssSelector();
  sel.setElement(tag);
  for (const a of el.attributes) sel.addAttribute(a.name, a.value ?? '');
  for (const i of el.inputs) sel.addAttribute(i.name, '');
  return sel;
}

function hasBinding(node: TmplAstElement | TmplAstTemplate, name: string): boolean {
  const inAttrs = node.attributes.some((a) => a.name === name);
  const inInputs = node.inputs.some((i) => i.name === name);
  const inTpl = 'templateAttrs' in node && (node as TmplAstTemplate).templateAttrs.some((t) => t.name === name);
  return inAttrs || inInputs || !!inTpl;
}

class DepCollector extends TmplAstRecursiveVisitor {
  readonly deps: TemplateDep[] = [];
  constructor(private matcher: SelectorMatcher<string>) { super(); }

  private outlets(node: TmplAstElement | TmplAstTemplate): void {
    if (hasBinding(node, 'ngComponentOutlet'))
      this.deps.push({ tag: 'ngComponentOutlet', component: null, kind: 'unresolved-static', reason: 'ngComponentOutlet' });
    if (hasBinding(node, 'ngTemplateOutlet'))
      this.deps.push({ tag: 'ngTemplateOutlet', component: null, kind: 'indirect', reason: 'ngTemplateOutlet' });
  }

  override visitElement(el: TmplAstElement): void {
    this.outlets(el);
    const cssSel = cssSelectorFromElement(el, el.name);
    let matched: string | null = null;
    this.matcher.match(cssSel, (_, ctx) => { matched = ctx; });
    if (matched) this.deps.push({ tag: el.name, component: matched, kind: 'resolved', reason: null });
    super.visitElement(el);
  }

  override visitTemplate(t: TmplAstTemplate): void {
    // Structural-directive outlets live on the template node...
    this.outlets(t);
    // ...but DO NOT selector-match t.tagName: a `<app-x *ngIf>` desugars to a Template
    // whose tagName is 'app-x' wrapping the real Element (also matched). Matching here
    // is the POC double-count bug. The inner Element is matched in visitElement.
    super.visitTemplate(t);
  }

  override visitContent(c: TmplAstContent): void {
    this.deps.push({ tag: 'ng-content', component: null, kind: 'indirect', reason: 'ng-content' });
    super.visitContent(c);
  }
}

export function collectTemplateDeps(nodes: unknown[], matcher: SelectorMatcher<string>): TemplateDep[] {
  const v = new DepCollector(matcher);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tmplAstVisitAll(v, nodes as any);
  const seen = new Set<string>();
  const out: TemplateDep[] = [];
  for (const d of v.deps) {
    const key = `${d.tag}|${d.component}|${d.kind}|${d.reason}`;
    if (!seen.has(key)) { seen.add(key); out.push(d); }
  }
  return out;
}

export interface TemplateParseResult { deps: TemplateDep[]; parseErrors: number; errorMessages: string[]; }

export function parseTemplateDeps(
  html: string,
  fileName: string,
  matcher: SelectorMatcher<string>,
): TemplateParseResult {
  const parsed = parseTemplate(html, fileName, { preserveWhitespaces: true });
  const errors = parsed.errors ?? [];
  // Collect deps even when there are errors — never silently drop dependencies (ATAM: correctness).
  const deps = collectTemplateDeps(parsed.nodes, matcher);
  return { deps, parseErrors: errors.length, errorMessages: errors.map((e) => e.toString()) };
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests)

Run: `cd tool && npx vitest run src/edges/template-visitor.test.ts`

- [ ] **Step 5: Commit**

```bash
cd tool && git add src/edges/template-visitor.ts src/edges/template-visitor.test.ts
git commit -m "feat(tool): template visitor — Element-only match (fix *ngIf double-count) + parse-error-loud"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npx vitest run src/edges/template-visitor.test.ts && npx tsc --noEmit`
Expected: 3 tests PASS; tsc clean. Critically: `<app-foo *ngIf>` yields exactly ONE FooComponent dep (double-count fixed), outlets/content carry the right kinds, and a malformed template reports `parseErrors>0` + messages.
</verify>

<done>
`parseTemplateDeps` turns one template into deduped `TemplateDep[]` with correct kinds and surfaces parse errors. The `*ngIf`/`*ngFor` double-count is eliminated by matching `TmplAstElement` only.
</done>

---

### Task 9: Edge builder (registry + per-component templates → Edge[])

<model>opus</model>

<read_first>
- `tool/src/edges/template-visitor.ts` (T8)
- `tool/src/types.ts` (Edge, ComponentRecord)
- `tool/src/indexer/index.ts` (indexComponents — used by the test to build records)
- `poc/spikes/spike-template.ts` `parseTsFixture` (the @ViewChild / createComponent scan to port)
</read_first>

**Files:**
- Create: `tool/src/edges/index.ts`
- Test: `tool/src/edges/index.test.ts`

<action>

- [ ] **Step 1: Write the failing test** — `tool/src/edges/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { indexComponents } from '../indexer/index.js';
import { buildSelectorRegistry, buildEdges } from './index.js';

function repo(): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/src/x.ts', `
    import { Component, NgModule, ViewChild } from '@angular/core';
    @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
    @Component({
      selector: 'app-parent',
      template: '<app-child></app-child><app-child *ngIf="x"></app-child><ng-content></ng-content>'
    })
    export class ParentComponent { @ViewChild('r') ref: unknown; }
    @NgModule({ declarations: [ChildComponent, ParentComponent] }) export class M {}`);
  return p;
}

describe('buildSelectorRegistry', () => {
  it('maps selectors to class names, skipping selectorless components', () => {
    const recs = indexComponents(repo(), { root: '/src' });
    const reg = buildSelectorRegistry(recs);
    expect(reg).toContainEqual({ selector: 'app-child', className: 'ChildComponent' });
    expect(reg).toContainEqual({ selector: 'app-parent', className: 'ParentComponent' });
  });
});

describe('buildEdges', () => {
  it('emits one resolved edge per child (no double-count), plus indirect + unresolved-static', () => {
    const p = repo();
    const recs = indexComponents(p, { root: '/src' });
    const { edges, parseErrors } = buildEdges(p, recs, { root: '/src' });

    const resolved = edges.filter((e) => e.from === 'ParentComponent' && e.to === 'ChildComponent');
    expect(resolved).toEqual([
      { from: 'ParentComponent', to: 'ChildComponent', kind: 'resolved', via: 'template', reason: null },
    ]); // exactly one despite two usages (one under *ngIf)

    expect(edges.find((e) => e.from === 'ParentComponent' && e.reason === 'ng-content')?.kind).toBe('indirect');
    expect(edges.find((e) => e.from === 'ParentComponent' && e.reason === '@ViewChild query')).toMatchObject({
      to: null, kind: 'unresolved-static', via: 'template',
    });
    expect(parseErrors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd tool && npx vitest run src/edges/index.test.ts`

- [ ] **Step 3: Implement `tool/src/edges/index.ts`**

```ts
import { Project, SourceFile, ClassDeclaration, Node, SyntaxKind } from 'ts-morph';
import { readFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import type { ComponentRecord, Edge } from '../types.js';
import { buildMatcher, parseTemplateDeps, type SelectorEntry } from './template-visitor.js';

export function buildSelectorRegistry(records: ComponentRecord[]): SelectorEntry[] {
  return records
    .filter((r): r is ComponentRecord & { selector: string } => r.selector !== null)
    .map((r) => ({ selector: r.selector, className: r.className }));
}

// Inline template string, or the templateUrl sibling file content, or null.
function readComponentTemplate(cls: ClassDeclaration, sf: SourceFile): string | null {
  const arg = cls.getDecorator('Component')?.getArguments()[0];
  if (!arg || !Node.isObjectLiteralExpression(arg)) return null;
  const t = arg.getProperty('template')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (t && (Node.isStringLiteral(t) || Node.isNoSubstitutionTemplateLiteral(t))) return t.getLiteralValue();
  const u = arg.getProperty('templateUrl')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (u && Node.isStringLiteral(u)) {
    const p = posix.join(posix.dirname(sf.getFilePath()), u.getLiteralValue());
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  return null;
}

// @ViewChild/@ViewChildren queries + ViewContainerRef.createComponent => unresolved-static reasons.
function scanTsDeps(cls: ClassDeclaration): string[] {
  const reasons: string[] = [];
  for (const prop of cls.getProperties()) {
    if (prop.getDecorator('ViewChild') || prop.getDecorator('ViewChildren')) reasons.push('@ViewChild query');
  }
  for (const call of cls.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (Node.isPropertyAccessExpression(expr) && expr.getName() === 'createComponent') reasons.push('createComponent');
  }
  return reasons;
}

export interface EdgeBuildResult {
  edges: Edge[];
  parseErrors: { component: string; messages: string[] }[];
}

export function buildEdges(project: Project, records: ComponentRecord[], _opts: { root: string }): EdgeBuildResult {
  const matcher = buildMatcher(buildSelectorRegistry(records));
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const parseErrors: { component: string; messages: string[] }[] = [];

  const push = (e: Edge): void => {
    const key = `${e.from}|${e.to}|${e.kind}|${e.reason}`;
    if (!seen.has(key)) { seen.add(key); edges.push(e); }
  };

  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      if (!cls.getDecorator('Component')) continue;
      const from = cls.getName() ?? '<anon>';
      const html = readComponentTemplate(cls, sf);
      if (html !== null) {
        const r = parseTemplateDeps(html, `${from}.html`, matcher);
        if (r.parseErrors > 0) parseErrors.push({ component: from, messages: r.errorMessages });
        for (const d of r.deps) push({ from, to: d.component, kind: d.kind, via: 'template', reason: d.reason });
      }
      for (const reason of scanTsDeps(cls)) push({ from, to: null, kind: 'unresolved-static', via: 'template', reason });
    }
  }
  return { edges, parseErrors };
}
```

- [ ] **Step 4: Run, verify PASS** (2 tests).

- [ ] **Step 5: Run all + typecheck**

Run: `cd tool && npm test && npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
cd tool && git add src/edges/index.ts src/edges/index.test.ts
git commit -m "feat(tool): edge builder — selector registry + template/ts deps -> deduped Edge[]"
```

</action>

<verify>
Run (Nyquist <60s): `cd tool && npm test && npx tsc --noEmit`
Expected: green + clean. Critically: ParentComponent→ChildComponent is ONE resolved edge (two template usages, one under `*ngIf`, deduped), ng-content → indirect edge, @ViewChild → unresolved-static edge (to:null), and `parseErrors` is empty for valid templates.
</verify>

<done>
`buildEdges(project, records, {root})` returns deduped `Edge[]` (from/to = class names) covering resolved/indirect/unresolved-static template deps + `@ViewChild`/`createComponent`, plus a per-component `parseErrors` list for loud surfacing. Graph assembly (Plan 5) consumes these.
</done>

---

## Self-Review (Plan 4)

- **Spec coverage:** SAC-02 (template child deps; indirect for ng-content/ngTemplateOutlet; unresolved-static for ngComponentOutlet/@ViewChild/createComponent; never silently dropped), double-count fix (RESEARCH §3), parse-error-loud. ✓
- **Placeholder scan:** complete code/tests/commands; no TBD. ✓
- **Type consistency:** `SelectorEntry`/`TemplateDep` defined in template-visitor.ts and reused by index.ts; `Edge` (from/to/kind/via/reason) matches `types.ts`; `Edge.to` null for unresolved; `from`/`to` use class names (== graph node id in Plan 5). `parseTemplateDeps` returns `{deps, parseErrors, errorMessages}`. NodeNext `.js` imports. ✓
- **Known limitations (noted):** selector matching is global (no NgModule-import scoping — over-match possible if two modules reuse a selector; RESEARCH §3, deferred); custom `interpolation` config not read (preserveWhitespaces:true only) — rare, deferred. Edge multiplicity collapsed to a set (correct for a dependency graph). ✓
- **Verify bounds:** both tasks <60s. ✓
