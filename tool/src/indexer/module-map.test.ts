import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { buildModuleMap } from './module-map.js';

function projectWith(src: string): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/m.ts', src);
  return p;
}

describe('buildModuleMap', () => {
  it('maps declared components (inline identifiers) to their NgModule', () => {
    const p = projectWith(`
      import { NgModule } from '@angular/core';
      class AComponent {} class BComponent {}
      @NgModule({ declarations: [AComponent, BComponent] })
      export class FeatureModule {}`);
    const map = buildModuleMap(p);
    expect(map.get('AComponent')).toBe('FeatureModule');
    expect(map.get('BComponent')).toBe('FeatureModule');
  });

  it('flattens a spread of a local const array (the POC gap)', () => {
    const p = projectWith(`
      import { NgModule } from '@angular/core';
      class CComponent {}
      const SHARED = [CComponent];
      @NgModule({ declarations: [...SHARED] })
      export class SharedModule {}`);
    expect(buildModuleMap(p).get('CComponent')).toBe('SharedModule');
  });

  it('ignores classes not in any declarations array', () => {
    const p = projectWith(`class Lonely {}`);
    expect(buildModuleMap(p).get('Lonely')).toBeUndefined();
  });
});
