import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { extractComponentMeta } from './component.js';

function firstClass(src: string) {
  const p = new Project({ useInMemoryFileSystem: true });
  const sf = p.createSourceFile('/c.ts', src);
  return sf.getClasses()[0];
}

describe('extractComponentMeta', () => {
  it('returns null for a class without @Component', () => {
    expect(extractComponentMeta(firstClass('export class Plain {}'), 'c.ts')).toBeNull();
  });

  it('extracts selector, templateKind, filePath and decorator I/O', () => {
    const cls = firstClass(`
      import { Component, Input, Output, EventEmitter } from '@angular/core';
      @Component({ selector: 'app-foo', templateUrl: './foo.html' })
      export class FooComponent {
        @Input() value = 0;
        @Input('aliasName') internal = '';
        @Output() changed = new EventEmitter<string>();
      }`);
    const m = extractComponentMeta(cls, 'src/foo.component.ts')!;
    expect(m.className).toBe('FooComponent');
    expect(m.selector).toBe('app-foo');
    expect(m.filePath).toBe('src/foo.component.ts');
    expect(m.templateKind).toBe('templateUrl');
    expect(m.standaloneExplicit).toBeNull();
    expect(m.inputs).toEqual([
      { name: 'value', alias: null, kind: 'decorator', required: false },
      { name: 'internal', alias: 'aliasName', kind: 'decorator', required: false },
    ]);
    expect(m.outputs).toEqual([{ name: 'changed', alias: null, kind: 'decorator', required: false }]);
  });

  it('reads explicit standalone + inline template + signal I/O', () => {
    const cls = firstClass(`
      import { Component, input, output, model } from '@angular/core';
      @Component({ selector: 'app-bar', standalone: true, template: '<div></div>' })
      export class BarComponent {
        name = input.required<string>();
        size = input<number>(0, { alias: 'sz' });
        changed = output<void>();
        value = model<string>('');
      }`);
    const m = extractComponentMeta(cls, 'bar.ts')!;
    expect(m.standaloneExplicit).toBe(true);
    expect(m.templateKind).toBe('inline');
    expect(m.inputs).toEqual([
      { name: 'name', alias: null, kind: 'signal', required: true },
      { name: 'size', alias: 'sz', kind: 'signal', required: false },
      { name: 'value', alias: null, kind: 'signal', required: false },
    ]);
    expect(m.outputs).toEqual([
      { name: 'changed', alias: null, kind: 'signal', required: false },
      { name: 'value', alias: null, kind: 'signal', required: false },
    ]);
  });

  it('captures explicit standalone:false', () => {
    const cls = firstClass(`
      import { Component } from '@angular/core';
      @Component({ selector: 'app-x', standalone: false, template: '' })
      export class XComponent {}`);
    expect(extractComponentMeta(cls, 'x.ts')!.standaloneExplicit).toBe(false);
  });
});
