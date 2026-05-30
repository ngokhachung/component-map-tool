import { describe, it, expect } from 'vitest';
import { angularMajorFromPkg, standaloneDefault } from './version.js';

describe('angularMajorFromPkg', () => {
  it('reads the major from dependencies', () => {
    expect(angularMajorFromPkg({ dependencies: { '@angular/core': '15.2.9' } })).toBe(15);
  });
  it('handles range prefixes and devDependencies', () => {
    expect(angularMajorFromPkg({ devDependencies: { '@angular/core': '^17.0.0' } })).toBe(17);
  });
  it('returns null when @angular/core is absent', () => {
    expect(angularMajorFromPkg({ dependencies: { rxjs: '7.0.0' } })).toBeNull();
  });
});

describe('standaloneDefault', () => {
  it('is false for Angular <= 18 (NgModule-default era) and unknown', () => {
    expect(standaloneDefault(15)).toBe(false);
    expect(standaloneDefault(18)).toBe(false);
    expect(standaloneDefault(null)).toBe(false);
  });
  it('is true from Angular 19 (standalone became the default)', () => {
    expect(standaloneDefault(19)).toBe(true);
  });
});
