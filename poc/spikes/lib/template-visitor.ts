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
    if (hasBinding(node, OUTLET_UNRESOLVED)) {
      this.deps.push({ tag: OUTLET_UNRESOLVED, component: null, kind: 'unresolved-static', reason: 'ngComponentOutlet' });
    }
    if (hasBinding(node, OUTLET_INDIRECT)) {
      this.deps.push({ tag: OUTLET_INDIRECT, component: null, kind: 'indirect', reason: 'ngTemplateOutlet' });
    }
    if (!tag) return;
    const cssSel = cssSelectorFromElement(node, tag);
    let matched: string | null = null;
    this.matcher.match(cssSel, (_, ctx) => { matched = ctx; });
    if (matched) this.deps.push({ tag, component: matched, kind: 'resolved', reason: null });
  }

  override visitElement(el: TmplAstElement): void {
    this.classifyElementLike(el, el.name);
    super.visitElement(el);
  }
  override visitTemplate(t: TmplAstTemplate): void {
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
