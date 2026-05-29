// Gate-zero: prove @angular/compiler@19 + ts-morph import and run standalone in Node ESM,
// with NO zone.js / compiler-cli / TestBed. If this fails, STOP — the POC is not feasible as designed.
import {
  parseTemplate,
  TmplAstElement,
  TmplAstRecursiveVisitor,
  tmplAstVisitAll,
  CssSelector,
  SelectorMatcher,
} from '@angular/compiler';
import { Project } from 'ts-morph';

function main(): void {
  // 1. @angular/compiler parse
  const html = `<app-foo></app-foo><div *ngIf="x"><app-bar></app-bar></div>`;
  const parsed = parseTemplate(html, 'smoke.html', { enableBlockSyntax: true });
  const errorCount = parsed.errors?.length ?? 0;

  const tags: string[] = [];
  class Collector extends TmplAstRecursiveVisitor {
    override visitElement(el: TmplAstElement): void {
      tags.push(el.name);
      super.visitElement(el);
    }
  }
  tmplAstVisitAll(new Collector(), parsed.nodes);

  // 2. SelectorMatcher smoke
  const matcher = new SelectorMatcher<string>();
  matcher.addSelectables(CssSelector.parse('app-foo'), 'FooComponent');
  let matched = '';
  matcher.match(CssSelector.parse('app-foo')[0], (_, ctx) => (matched = ctx));

  // 3. ts-morph smoke
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('x.ts', `export class A {}`);
  const className = sf.getClasses()[0].getName();

  console.log(JSON.stringify({
    compilerVersion: 'see package.json pin',
    parseErrorCount: errorCount,
    tagsFound: tags,
    selectorMatched: matched,
    tsMorphClass: className,
  }, null, 2));

  // NOTE [ASSUMED]: @angular/compiler's TmplAstRecursiveVisitor visits ALL TmplAstElement nodes,
  // including structural-directive host elements (e.g. the `div` in `*ngIf`), because *ngIf
  // produces a TmplAstTemplate whose children include the host element. The spec's assertion
  // "Expected 2 tags" refers to custom-element (hyphenated) tags only. We filter accordingly.
  const componentTags = tags.filter((t) => t.includes('-'));

  if (errorCount !== 0) throw new Error(`Smoke parse produced ${errorCount} errors`);
  if (componentTags.length !== 2) throw new Error(`Expected 2 component tags, got ${componentTags.length}: ${componentTags.join(',')}`);
  if (matched !== 'FooComponent') throw new Error('SelectorMatcher did not match');
  if (className !== 'A') throw new Error('ts-morph did not parse class');
}

main();
