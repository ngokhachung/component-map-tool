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
    expect(r.deps.filter((d) => d.component === 'FooComponent')).toEqual([
      { tag: 'app-foo', component: 'FooComponent', kind: 'resolved', reason: null },
    ]);
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
    const r = parseTemplateDeps(`<div`, 't.html', matcher);
    expect(r.parseErrors).toBeGreaterThan(0);
    expect(r.errorMessages.length).toBeGreaterThan(0);
  });
});
