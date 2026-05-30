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
    ]);

    expect(edges.find((e) => e.from === 'ParentComponent' && e.reason === 'ng-content')?.kind).toBe('indirect');
    expect(edges.find((e) => e.from === 'ParentComponent' && e.reason === '@ViewChild query')).toMatchObject({
      to: null, kind: 'unresolved-static', via: 'template',
    });
    expect(parseErrors).toEqual([]);
  });
});
