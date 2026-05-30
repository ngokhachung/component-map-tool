import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { resolveStandalone, indexComponents } from './index.js';

describe('resolveStandalone', () => {
  it('honors an explicit flag over everything', () => {
    expect(resolveStandalone(true, 'M', false)).toBe(true);
    expect(resolveStandalone(false, null, true)).toBe(false);
  });
  it('NgModule membership forces non-standalone when flag omitted', () => {
    expect(resolveStandalone(null, 'FeatureModule', true)).toBe(false);
  });
  it('falls back to the version default when no flag and no module', () => {
    expect(resolveStandalone(null, null, true)).toBe(true);
    expect(resolveStandalone(null, null, false)).toBe(false);
  });
});

describe('indexComponents', () => {
  it('produces records with resolved standalone (v15-like repo: no package.json => default false)', () => {
    const p = new Project({ useInMemoryFileSystem: true });
    p.createSourceFile('/src/feat.ts', `
      import { Component, NgModule } from '@angular/core';
      @Component({ selector: 'app-a', template: '' }) export class AComponent {}
      @Component({ selector: 'app-b', standalone: true, template: '' }) export class BComponent {}
      @NgModule({ declarations: [AComponent] }) export class FeatureModule {}`);
    const recs = indexComponents(p, { root: '/src' });
    const a = recs.find((r) => r.className === 'AComponent')!;
    const b = recs.find((r) => r.className === 'BComponent')!;
    expect(a.module).toBe('FeatureModule');
    expect(a.standalone).toBe(false);
    expect(a.filePath).toBe('feat.ts');
    expect(b.module).toBeNull();
    expect(b.standalone).toBe(true);
    expect(recs).toHaveLength(2);
  });
});
