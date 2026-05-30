import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGraph, writeGraph } from './index.js';
import { loadGraph } from './assemble.js';

function repo(): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/src/x.ts', `
    import { Component, NgModule, RouterModule } from '@angular/core';
    @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
    @Component({ selector: 'app-parent', template: '<app-child></app-child>' }) export class ParentComponent {}
    @NgModule({ declarations: [ChildComponent, ParentComponent] }) export class M {}
    RouterModule.forRoot([{ path: 'p', component: ParentComponent }]);`);
  return p;
}

describe('buildGraph', () => {
  it('assembles components + edges + routes into a versioned graph', () => {
    const { graph, parseErrors } = buildGraph(repo(), { root: '/src' });
    expect(graph.components.map((c) => c.id).sort()).toEqual(['ChildComponent', 'ParentComponent']);
    expect(graph.edges).toContainEqual({ from: 'ParentComponent', to: 'ChildComponent', kind: 'resolved', via: 'template', reason: null });
    expect(graph.routes[0].fullPath).toBe('p');
    expect(parseErrors).toEqual([]);
  });
});

describe('writeGraph', () => {
  it('writes a loadable graph.json into the out dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-'));
    try {
      const { graph } = buildGraph(repo(), { root: '/src' });
      const p = writeGraph(graph, dir);
      const loaded = loadGraph(readFileSync(p, 'utf8'));
      expect(loaded.components.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
