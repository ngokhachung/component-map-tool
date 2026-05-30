import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIncremental } from './index.js';

function tmpRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'cmap-i-'));
  writeFileSync(join(d, 'x.ts'), `
    import { Component, NgModule } from '@angular/core';
    @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
    @Component({ selector: 'app-parent', template: '<app-child></app-child>' }) export class ParentComponent {}
    @NgModule({ declarations: [ChildComponent, ParentComponent] }) export class M {}`);
  return d;
}

describe('buildIncremental', () => {
  it('rebuilds on first run, serves cache when unchanged, rebuilds after a change', () => {
    const root = tmpRepo();
    const cmap = join(root, '.cmap');
    try {
      const first = buildIncremental(root, cmap);
      expect(first.fromCache).toBe(false);
      expect(existsSync(join(cmap, 'graph.json'))).toBe(true);
      expect(existsSync(join(cmap, 'manifest.json'))).toBe(true);
      expect(first.graph.components.length).toBe(2);

      const second = buildIncremental(root, cmap);
      expect(second.fromCache).toBe(true);
      expect(second.graph.components.length).toBe(2);

      writeFileSync(join(root, 'x.ts'), `
        import { Component, NgModule } from '@angular/core';
        @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
        @NgModule({ declarations: [ChildComponent] }) export class M {}`);
      const third = buildIncremental(root, cmap);
      expect(third.fromCache).toBe(false);
      expect(third.graph.components.length).toBe(1);
      expect(third.changed).toContain('x.ts');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
