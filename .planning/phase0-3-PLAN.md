# Phase 0 POC — Plan 3: Template Spike + Feasibility Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use happypowerprocess:subagent-driven-development (recommended) or happypowerprocess:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove `@angular/compiler` resolves template child-component dependencies across the full hard set (POC-03/04), then aggregate all three spikes into `FEASIBILITY-REPORT.md` with a computed GO/NO-GO verdict (POC-05).

**Architecture:** The template spike parses each `.html` fixture with `parseTemplate`, walks the R3 AST with a `RecursiveVisitor` that descends control-flow/structural children, matches element tags against a selector registry via Angular's `SelectorMatcher`, and classifies each dependency as `resolved` / `indirect` / `unresolved-static`. The two TS-level dynamic constructs (`@ViewChild`, `ViewContainerRef.createComponent`) are detected with a small `ts-morph` pass. The report task runs all three spikes and applies the gate thresholds.

**Tech Stack:** `@angular/compiler@19` (`parseTemplate`, `TmplAst*`, `CssSelector`, `SelectorMatcher`), `ts-morph`, TypeScript ESM. Depends on Plans 1 & 2.

---

```yaml
must_haves:
  observable_truths:
    - "`npm run spike:template` resolves components under static, *ngIf/*ngFor, @if/@for/@switch, and @defer; flags ng-content + ngTemplateOutlet as indirect and *ngComponentOutlet + ViewContainerRef + @ViewChild as unresolved-static."
    - "Any template fixture with parseTemplate errors is scored FAIL (not a clean miss)."
    - "`npm run report` writes FEASIBILITY-REPORT.md containing per-task counts+rates and a GO/NO-GO/GO-with-caveats verdict per the gate thresholds."
  required_artifacts:
    - "poc/spikes/lib/template-visitor.ts — DepCollector visitor + CssSelector builder"
    - "poc/spikes/spike-template.ts — html + ts fixture scoring"
    - "poc/fixtures/template/selectors.json + *.html/*.ts + *.expected.json (full hard set + messy + @defer)"
    - "poc/spikes/report-all.ts — runs 3 spikes, applies gate, writes FEASIBILITY-REPORT.md"
    - "poc/FEASIBILITY-REPORT.md (generated)"
  required_wiring:
    - "spike-template exports runTemplateSpike; report-all imports run{Component,Routing,Template}Spike."
    - "Visitor uses enableBlockSyntax:true and asserts block node types appear."
  key_links:
    - "SelectorMatcher (not hand-rolled) -> attribute/multi/:not selectors matched (research P-DC1)"
    - "visitor recurses Template/IfBlock/ForLoopBlock/SwitchBlock/DeferredBlock children -> no silent miss (P-DC1)"
    - "parseTemplate errors -> parseErrors count -> harness FAIL (P-AC4)"
    - "gate thresholds -> verdict (spec §5)"
```

---

## File Structure

- `poc/spikes/lib/template-visitor.ts` — `DepCollector` (RecursiveVisitor) + `cssSelectorFromElement`.
- `poc/spikes/spike-template.ts` — parses html fixtures + ts fixtures, scores, prints `TaskReport`.
- `poc/fixtures/template/selectors.json` — selector→className registry.
- `poc/fixtures/template/*.html` / `*.ts` + `*.expected.json`.
- `poc/spikes/report-all.ts` — orchestrator + gate + report writer.

---

## Wave 3

### Task 5: Template dependency spike + fixtures (POC-03 / POC-04)

<model>opus</model>

<read_first>
- `poc/types.ts` (`TemplateDep`, `TemplateResult`, `DepKind`)
- `poc/harness/report.ts` (`scoreCase`, `scoreTask`)
- `poc/spikes/lib/load-fixtures.ts`
- `.planning/phase0-RESEARCH.md` — verified `TmplAst*` node shapes, `SelectorMatcher`, P-AC3/P-AC4/P-DC1..P-DC4
- `docs/specs/2026-05-29-phase0-poc-validation-design.md` §3 construct→outcome table + §11
</read_first>

**Files:**
- Create: `poc/spikes/lib/template-visitor.ts`
- Create: `poc/spikes/spike-template.ts`
- Create: `poc/fixtures/template/selectors.json` + fixtures + `*.expected.json`

<action>

- [ ] **Step 1: Implement the visitor + selector builder** — `poc/spikes/lib/template-visitor.ts`

```ts
import {
  TmplAstRecursiveVisitor, tmplAstVisitAll,
  TmplAstElement, TmplAstTemplate, TmplAstContent,
  CssSelector, SelectorMatcher,
} from '@angular/compiler';
import type { TemplateDep } from '../../types.js';

export interface SelectorEntry { selector: string; className: string; }

export function buildMatcher(registry: SelectorEntry[]): SelectorMatcher<string> {
  const matcher = new SelectorMatcher<string>();
  for (const e of registry) matcher.addSelectables(CssSelector.parse(e.selector), e.className);
  return matcher;
}

// Build a CssSelector for an element node from its tag + static attributes/inputs
// so SelectorMatcher can match attribute selectors like `button[appConfirm]` (research P-DC1).
function cssSelectorFromElement(el: TmplAstElement | TmplAstTemplate, tag: string): CssSelector {
  const sel = new CssSelector();
  sel.setElement(tag);
  for (const a of el.attributes) sel.addAttribute(a.name, a.value ?? '');
  for (const i of el.inputs) sel.addAttribute(i.name, '');
  return sel;
}

const OUTLET_INDIRECT = 'ngTemplateOutlet';
const OUTLET_UNRESOLVED = 'ngComponentOutlet';

function hasBinding(el: TmplAstElement | TmplAstTemplate, name: string): boolean {
  const inAttrs = el.attributes.some((a) => a.name === name);
  const inInputs = el.inputs.some((i) => i.name === name);
  const inTplAttrs = 'templateAttrs' in el && (el as TmplAstTemplate).templateAttrs.some((t) => t.name === name);
  return inAttrs || inInputs || !!inTplAttrs;
}

export class DepCollector extends TmplAstRecursiveVisitor {
  readonly deps: TemplateDep[] = [];
  constructor(private matcher: SelectorMatcher<string>) { super(); }

  private classifyElementLike(node: TmplAstElement | TmplAstTemplate, tag: string | null): void {
    // outlet bindings first (a host element can carry them)
    if (hasBinding(node, OUTLET_UNRESOLVED)) {
      this.deps.push({ tag: OUTLET_UNRESOLVED, component: null, kind: 'unresolved-static', reason: 'ngComponentOutlet' });
    }
    if (hasBinding(node, OUTLET_INDIRECT)) {
      this.deps.push({ tag: OUTLET_INDIRECT, component: null, kind: 'indirect', reason: 'ngTemplateOutlet' });
    }
    if (!tag) return;
    // resolved component match
    const cssSel = cssSelectorFromElement(node, tag);
    let matched: string | null = null;
    this.matcher.match(cssSel, (_, ctx) => { matched = ctx; });
    if (matched) this.deps.push({ tag, component: matched, kind: 'resolved', reason: null });
  }

  override visitElement(el: TmplAstElement): void {
    this.classifyElementLike(el, el.name);
    super.visitElement(el); // descends into children
  }
  override visitTemplate(t: TmplAstTemplate): void {
    // *ngIf/*ngFor desugar to Template; the real element is in children (handled by super).
    this.classifyElementLike(t, t.tagName);
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
  return v.deps;
}
```

Note: `RecursiveVisitor` descends `IfBlock`/`ForLoopBlock`/`SwitchBlock`/`DeferredBlock` children automatically (research-verified), so components under `@if`/`@for`/`@switch`/`@defer` reach `visitElement` with no extra code. If a future check shows a block child is NOT visited, override the corresponding `visitIfBlock`/`visitForLoopBlock`/etc. to call `super` — but verify first in Step 4.

- [ ] **Step 2: Implement the template spike** — `poc/spikes/spike-template.ts`

```ts
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseTemplate } from '@angular/compiler';
import { Project, SyntaxKind, Node } from 'ts-morph';
import type { TemplateResult, TemplateDep, TaskReport, CaseResult } from '../types.js';
import { scoreCase, scoreTask } from '../harness/report.js';
import { buildMatcher, collectTemplateDeps } from './lib/template-visitor.js';
import type { SelectorEntry } from './lib/template-visitor.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures', 'template');

function parseHtmlFixture(html: string, matcher: ReturnType<typeof buildMatcher>): TemplateResult {
  const parsed = parseTemplate(html, 'fixture.html', { enableBlockSyntax: true });
  const parseErrors = parsed.errors?.length ?? 0;
  const deps = parseErrors > 0 ? [] : collectTemplateDeps(parsed.nodes, matcher);
  return { deps, parseErrors };
}

// TS-level constructs (research P-DC3): @ViewChild + ViewContainerRef.createComponent — not in template AST.
function parseTsFixture(sourcePath: string): TemplateResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const sf = project.addSourceFileAtPath(sourcePath);
  const deps: TemplateDep[] = [];
  for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyDeclaration)) {
    if (prop.getDecorator('ViewChild') || prop.getDecorator('ViewChildren'))
      deps.push({ tag: 'ViewChild', component: null, kind: 'unresolved-static', reason: '@ViewChild query' });
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (Node.isPropertyAccessExpression(expr) && expr.getName() === 'createComponent')
      deps.push({ tag: 'ViewContainerRef.createComponent', component: null, kind: 'unresolved-static', reason: 'dynamic createComponent' });
  }
  return { deps, parseErrors: 0 };
}

function main(): TaskReport {
  const registry = JSON.parse(readFileSync(join(FIXTURES, 'selectors.json'), 'utf8')) as SelectorEntry[];
  const matcher = buildMatcher(registry);
  const files = readdirSync(FIXTURES);

  const cases: CaseResult[] = [];
  for (const f of files) {
    if (f === 'selectors.json' || f.endsWith('.expected.json')) continue;
    const base = f.replace(/\.(html|ts)$/, '');
    const expectedPath = join(FIXTURES, `${base}.expected.json`);
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as TemplateResult;
    const sourcePath = join(FIXTURES, f);
    const actual = f.endsWith('.html')
      ? parseHtmlFixture(readFileSync(sourcePath, 'utf8'), matcher)
      : parseTsFixture(sourcePath);
    writeFileSync(`${sourcePath}.actual.json`, JSON.stringify(actual, null, 2));
    // score deps multiset AND assert parseErrors==0 via scoreCase's parseErrors arg
    cases.push(scoreCase(base, actual.deps, expected.deps, actual.parseErrors));
  }
  const report = scoreTask('template', cases);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('spike-template.ts')) main();
export { main as runTemplateSpike };
```

- [ ] **Step 3: Create the selector registry** — `poc/fixtures/template/selectors.json`

```json
[
  { "selector": "app-child", "className": "ChildComponent" },
  { "selector": "app-row", "className": "RowComponent" },
  { "selector": "app-badge", "className": "BadgeComponent" },
  { "selector": "app-panel", "className": "PanelComponent" },
  { "selector": "button[appConfirm]", "className": "ConfirmButtonComponent" },
  { "selector": "app-a, app-b", "className": "MultiSelectComponent" }
]
```

- [ ] **Step 4: Author exemplar — static + structural + control flow** — `poc/fixtures/template/control-flow.html`

```html
<app-child></app-child>
<div *ngIf="show"><app-row></app-row></div>
<ul><li *ngFor="let x of items"><app-badge></app-badge></li></ul>
@if (ready) { <app-panel></app-panel> }
@for (it of list; track it) { <app-child></app-child> }
@switch (mode) { @case ('a') { <app-row></app-row> } }
```

`poc/fixtures/template/control-flow.expected.json` (order-insensitive; counts matter — note `app-child` appears twice):

```json
{
  "parseErrors": 0,
  "deps": [
    { "tag": "app-child", "component": "ChildComponent", "kind": "resolved", "reason": null },
    { "tag": "app-row", "component": "RowComponent", "kind": "resolved", "reason": null },
    { "tag": "app-badge", "component": "BadgeComponent", "kind": "resolved", "reason": null },
    { "tag": "app-panel", "component": "PanelComponent", "kind": "resolved", "reason": null },
    { "tag": "app-child", "component": "ChildComponent", "kind": "resolved", "reason": null },
    { "tag": "app-row", "component": "RowComponent", "kind": "resolved", "reason": null }
  ]
}
```

> Step-4 verification aid: this fixture is the canary for research P-DC1 (structural/control-flow recursion) and P-AC3 (block syntax on). If `app-panel`/the `@for` `app-child`/the `@switch` `app-row` are missing from actual, the visitor is not descending block children — add the block-node overrides noted in Step 1. If `parseErrors > 0`, `enableBlockSyntax` handling is wrong.

- [ ] **Step 5: Author exemplar — indirect + dynamic (ng-content / ngTemplateOutlet / ngComponentOutlet)** — `poc/fixtures/template/dynamic.html`

```html
<ng-content></ng-content>
<ng-container [ngComponentOutlet]="cmp"></ng-container>
<ng-container *ngTemplateOutlet="tpl"></ng-container>
<app-child></app-child>
```

`poc/fixtures/template/dynamic.expected.json`:

```json
{
  "parseErrors": 0,
  "deps": [
    { "tag": "ng-content", "component": null, "kind": "indirect", "reason": "ng-content" },
    { "tag": "ngComponentOutlet", "component": null, "kind": "unresolved-static", "reason": "ngComponentOutlet" },
    { "tag": "ngTemplateOutlet", "component": null, "kind": "indirect", "reason": "ngTemplateOutlet" },
    { "tag": "app-child", "component": "ChildComponent", "kind": "resolved", "reason": null }
  ]
}
```

> Verification aid (research open-question #3): confirm in `dynamic.html.actual.json` whether `ngComponentOutlet`/`ngTemplateOutlet` land in `attributes`, `inputs`, or `templateAttrs`. The `hasBinding` helper checks all three, so it is robust to placement; if a binding is still missed, log the node shape and adjust `hasBinding`.

- [ ] **Step 6: Author exemplar — @defer + messy selectors** — `poc/fixtures/template/defer-messy.html`

```html
@defer (on viewport) { <app-child></app-child> } @placeholder { <app-badge></app-badge> }
<button appConfirm>Delete</button>
<app-a></app-a>
```

`poc/fixtures/template/defer-messy.expected.json`:

```json
{
  "parseErrors": 0,
  "deps": [
    { "tag": "app-child", "component": "ChildComponent", "kind": "resolved", "reason": null },
    { "tag": "app-badge", "component": "BadgeComponent", "kind": "resolved", "reason": null },
    { "tag": "button", "component": "ConfirmButtonComponent", "kind": "resolved", "reason": null },
    { "tag": "app-a", "component": "MultiSelectComponent", "kind": "resolved", "reason": null }
  ]
}
```

> This fixture validates @defer child recursion, the attribute selector `button[appConfirm]`, and the multi-selector `app-a, app-b` — all via `SelectorMatcher`. If `button`/`app-a` are unmatched, the `cssSelectorFromElement` attribute wiring or registry parse is wrong.

- [ ] **Step 7: Author the TS-level dynamic fixtures**

`poc/fixtures/template/viewchild.ts`:

```ts
import { Component, ViewChild, ElementRef } from '@angular/core';
@Component({ selector: 'app-host', template: '' })
export class HostComponent {
  @ViewChild('ref') ref!: ElementRef;
}
```

`poc/fixtures/template/viewchild.expected.json`:

```json
{ "parseErrors": 0, "deps": [ { "tag": "ViewChild", "component": null, "kind": "unresolved-static", "reason": "@ViewChild query" } ] }
```

`poc/fixtures/template/vcr.ts`:

```ts
import { Component, ViewContainerRef, inject } from '@angular/core';
@Component({ selector: 'app-dyn', template: '' })
export class DynHostComponent {
  private vcr = inject(ViewContainerRef);
  load(cmp: any) { this.vcr.createComponent(cmp); }
}
```

`poc/fixtures/template/vcr.expected.json`:

```json
{ "parseErrors": 0, "deps": [ { "tag": "ViewContainerRef.createComponent", "component": null, "kind": "unresolved-static", "reason": "dynamic createComponent" } ] }
```

- [ ] **Step 8: Commit**

```bash
cd poc && git add spikes/spike-template.ts spikes/lib/template-visitor.ts fixtures/template/
git commit -m "feat(poc): template dependency spike + full hard-set fixtures (POC-03/04)"
```

</action>

<verify>
Run (Nyquist: <60s): `cd poc && npm run spike:template`
Expected: printed `TaskReport` with `task:"template"`, `passed == total`. Each construct class is correct: resolved components under static/`*ngIf`/`*ngFor`/`@if`/`@for`/`@switch`/`@defer`; `ng-content`+`ngTemplateOutlet` = indirect; `ngComponentOutlet`+`@ViewChild`+`createComponent` = unresolved-static; every fixture `parseErrors == 0`. On any failure, diff the printed case against `<fixture>.actual.json`.
</verify>

<done>
`spike:template` correctly classifies the full hard construct set with zero parse errors and SelectorMatcher-based matching (incl. attribute + multi selectors), demonstrating POC-03 (resolved cases) and POC-04 (indirect/unresolved-static flagging). Structural/control-flow/@defer recursion verified by the canary fixture.
</done>

---

## Wave 4

### Task 6: Feasibility report + GO/NO-GO verdict (POC-05)

<model>sonnet</model>

<read_first>
- `poc/spikes/spike-component.ts` (`runComponentSpike`), `spike-routing.ts` (`runRoutingSpike`), `spike-template.ts` (`runTemplateSpike`)
- `docs/specs/2026-05-29-phase0-poc-validation-design.md` §5 gate thresholds, §6 report contents
</read_first>

**Files:**
- Create: `poc/spikes/report-all.ts`
- Test: `poc/spikes/report-all.test.ts`
- Generates: `poc/FEASIBILITY-REPORT.md`

<action>

- [ ] **Step 1: Write the failing test for the verdict function** — `poc/spikes/report-all.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { verdictForRateTask, verdictForComponent, overallVerdict } from './report-all.js';
import type { TaskReport } from '../types.js';

// Rate-band gate applies to routing + template only (spec §5).
describe('verdictForRateTask', () => {
  it('NO-GO at <=50%', () => expect(verdictForRateTask(0.5)).toBe('NO-GO'));
  it('GO-with-caveats between 50 and 80', () => expect(verdictForRateTask(0.7)).toBe('GO-with-caveats'));
  it('GO at >=80%', () => expect(verdictForRateTask(0.8)).toBe('GO'));
});

// Component gate is the ≥5-correct-of-EACH-type count, NOT the rate band (spec §5).
function compReport(standalonePassed: number, ngModulePassed: number, rate = 1): TaskReport {
  return { task: 'component', total: 11, passed: standalonePassed + ngModulePassed, rate, cases: [], meta: { standalonePassed, ngModulePassed } };
}
describe('verdictForComponent', () => {
  it('GO when >=5 of each type pass', () => expect(verdictForComponent(compReport(6, 5))).toBe('GO'));
  it('GO-with-caveats when one type is short but rate still >50%', () =>
    expect(verdictForComponent(compReport(6, 4, 0.91))).toBe('GO-with-caveats'));
  it('NO-GO when rate <=50%', () => expect(verdictForComponent(compReport(3, 2, 0.45))).toBe('NO-GO'));
  it('NO-GO when meta missing (cannot prove the per-type gate)', () =>
    expect(verdictForComponent({ task: 'component', total: 11, passed: 11, rate: 1, cases: [] })).toBe('NO-GO'));
});

describe('overallVerdict', () => {
  it('NO-GO if any task is NO-GO', () => {
    expect(overallVerdict(['GO', 'NO-GO', 'GO'])).toBe('NO-GO');
  });
  it('GO-with-caveats if any caveats and no NO-GO', () => {
    expect(overallVerdict(['GO', 'GO-with-caveats', 'GO'])).toBe('GO-with-caveats');
  });
  it('GO if all GO', () => expect(overallVerdict(['GO', 'GO', 'GO'])).toBe('GO'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd poc && npx vitest run spikes/report-all.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement `poc/spikes/report-all.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { TaskReport } from '../types.js';
import { runComponentSpike } from './spike-component.js';
import { runRoutingSpike } from './spike-routing.js';
import { runTemplateSpike } from './spike-template.js';

export type Verdict = 'GO' | 'GO-with-caveats' | 'NO-GO';

const COMPONENT_TYPE_MIN = 5; // spec §5: >=5 correct of EACH type

// Rate-band gate (spec §5) — applies to routing + template: <=50% NO-GO; 50-80% caveats; >=80% GO.
export function verdictForRateTask(rate: number): Verdict {
  if (rate <= 0.5) return 'NO-GO';
  if (rate < 0.8) return 'GO-with-caveats';
  return 'GO';
}

// Component gate (spec §5) — NOT the rate band. GO requires >=5 correct of EACH type.
// Falls back to NO-GO if meta is absent (we cannot prove the per-type gate).
export function verdictForComponent(r: TaskReport): Verdict {
  if (r.rate <= 0.5) return 'NO-GO';
  const sa = r.meta?.standalonePassed;
  const ng = r.meta?.ngModulePassed;
  if (sa === undefined || ng === undefined) return 'NO-GO';
  if (sa >= COMPONENT_TYPE_MIN && ng >= COMPONENT_TYPE_MIN) return 'GO';
  return 'GO-with-caveats';
}

function verdictForReport(r: TaskReport): Verdict {
  return r.task === 'component' ? verdictForComponent(r) : verdictForRateTask(r.rate);
}

export function overallVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.includes('NO-GO')) return 'NO-GO';
  if (verdicts.includes('GO-with-caveats')) return 'GO-with-caveats';
  return 'GO';
}

function renderTaskSection(r: TaskReport): string {
  const v = verdictForReport(r);
  const rows = r.cases.map((c) =>
    `| ${c.fixture} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.borderline ? 'yes' : ''} | ${c.notes} |`).join('\n');
  const metaLine = r.task === 'component' && r.meta
    ? `Type split: standalone ${r.meta.standalonePassed}/?, NgModule ${r.meta.ngModulePassed}/? correct (gate: ≥${COMPONENT_TYPE_MIN} each)`
    : '';
  return [
    `### ${r.task} — ${v}`,
    `Pass rate: **${r.passed}/${r.total}** (${(r.rate * 100).toFixed(0)}%)`,
    metaLine,
    '',
    '| Fixture | Result | Borderline | Notes |',
    '|---|---|---|---|',
    rows,
    '',
  ].join('\n');
}

export function buildReport(reports: TaskReport[], compilerVersion: string): string {
  const verdicts = reports.map(verdictForReport);
  const overall = overallVerdict(verdicts);
  const component = reports.find((r) => r.task === 'component');
  const lines = [
    '# Phase 0 — Feasibility Report',
    '',
    `**Generated:** see git commit date  `,
    `**@angular/compiler pinned:** ${compilerVersion}  `,
    `**Overall verdict: ${overall}**`,
    '',
    '> Gate (spec §5): NO-GO if routing or template ≤50%; GO-with-caveats 50–80%; confident GO ≥80% per task AND component correct for ≥5 of each type.',
    '',
    '## Per-task results',
    '',
    ...reports.map(renderTaskSection),
    '## Notes & risks carried to Phase 1',
    '',
    '- @angular/compiler template API is experimental/private and version-sensitive — GO is scoped to Angular 19 only; Phase 1 should evaluate the bundled-compiler vendoring pattern for multi-version (research P-AC2).',
    '- Import paths used: `parseTemplate`, `TmplAst*`, `CssSelector`, `SelectorMatcher` from `@angular/compiler`; `Project` from `ts-morph`.',
    `- Component coverage: ${component?.total ?? 0} components; standalone passed ${component?.meta?.standalonePassed ?? 0}, NgModule passed ${component?.meta?.ngModulePassed ?? 0} (requirement: ≥5 each).`,
    '- Borderline cases (if any) are flagged in the tables above — review before trusting the percentage.',
    '',
  ];
  return lines.join('\n');
}

function main(): void {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const reports = [runComponentSpike(), runRoutingSpike(), runTemplateSpike()];
  const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const md = buildReport(reports, pkg.dependencies['@angular/compiler']);
  writeFileSync(join(HERE, '..', 'FEASIBILITY-REPORT.md'), md);
  console.log(md);
}

if (process.argv[1] && process.argv[1].endsWith('report-all.ts')) main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd poc && npx vitest run spikes/report-all.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Generate the report end-to-end**

Run: `cd poc && npm run report`
Expected: `FEASIBILITY-REPORT.md` written; stdout shows the markdown with an **Overall verdict** line and three per-task sections with pass rates.

- [ ] **Step 6: Commit**

```bash
cd poc && git add spikes/report-all.ts spikes/report-all.test.ts FEASIBILITY-REPORT.md
git commit -m "feat(poc): feasibility report + GO/NO-GO verdict (POC-05)"
```

</action>

<verify>
Run (Nyquist: <60s): `cd poc && npm test && npm run report`
Expected: all vitest green (incl. verdict tests); `FEASIBILITY-REPORT.md` exists and contains `Overall verdict:`, three `###` task sections with `Pass rate: X/Y`, the pinned compiler version, and the component coverage count. The verdict is computed (not hand-typed) from the gate thresholds.
</verify>

<done>
`npm run report` produces `FEASIBILITY-REPORT.md` with per-task counts+rates and a gate-computed GO/NO-GO/GO-with-caveats verdict, plus the pinned compiler version and risks for Phase 1. POC-05 demonstrated; Phase 0 milestone deliverable complete.
</done>

---

## Self-Review (Plan 3)

- **Spec coverage:** POC-03 (resolved: static/`*ngIf`/`*ngFor`/`@if`/`@for`/`@switch`/`@defer`) ✓; POC-04 (indirect: ng-content, ngTemplateOutlet; unresolved-static: ngComponentOutlet, @ViewChild, ViewContainerRef) ✓; POC-05 (report + gate verdict, raw counts, compiler version, risks) ✓; §11 rules (enableBlockSyntax true, errors→FAIL, SelectorMatcher, block recursion) ✓.
- **Placeholder scan:** Visitor + spike + report code complete and pure-ESM (the prior `require` shim was removed — `report-all.ts` now uses a top-level `readFileSync` import). Fixtures complete with exact `expected.json`. No silent placeholders. ✓
- **Verification derivation (spec §5):** component task gated on `verdictForComponent` (≥5 correct of EACH type via `meta.standalonePassed`/`ngModulePassed`), routing+template on `verdictForRateTask` (rate band). Component meta populated by Plan 2's spike. ✓
- **Type consistency:** `TemplateDep`/`TemplateResult`/`DepKind`/`TaskReport`(+`meta?`)/`CaseResult` match `poc/types.ts`; `scoreCase(fixture, actual, expected, parseErrors)` signature matches Plan 1; `SelectorEntry` imported with `import type`; `run{Component,Routing,Template}Spike` exports match Plans 2/3 names; `.js` ESM import extensions throughout. ✓
- **Wave/overlap:** Task 5 (`fixtures/template/`, `spike-template.ts`, `lib/template-visitor.ts`) vs Task 6 (`report-all.ts`, `FEASIBILITY-REPORT.md`) — Task 6 only *reads/imports* the spikes, no write overlap; Task 6 is Wave 4 (needs all spikes). ✓
