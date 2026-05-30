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
    this.outlets(t);
    // DO NOT selector-match t.tagName — a `<app-x *ngIf>` desugars to a Template whose
    // tagName is 'app-x' wrapping the real Element (matched in visitElement). Matching
    // here is the POC double-count bug.
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
  const deps = collectTemplateDeps(parsed.nodes, matcher);
  return { deps, parseErrors: errors.length, errorMessages: errors.map((e) => e.toString()) };
}
