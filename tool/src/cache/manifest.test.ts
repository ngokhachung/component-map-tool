import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashSources, readManifest, writeManifest, hashesEqual, diffManifest } from './manifest.js';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-m-')); }

describe('hashSources', () => {
  it('hashes .ts files (relative keys), excluding specs/dist/node_modules', () => {
    const d = tmp();
    try {
      mkdirSync(join(d, 'sub'), { recursive: true });
      writeFileSync(join(d, 'a.ts'), 'export const a = 1;');
      writeFileSync(join(d, 'sub', 'b.ts'), 'export const b = 2;');
      writeFileSync(join(d, 'a.spec.ts'), 'test');
      mkdirSync(join(d, 'node_modules'), { recursive: true });
      writeFileSync(join(d, 'node_modules', 'x.ts'), 'ignored');
      const h = hashSources(d);
      expect(Object.keys(h).sort()).toEqual(['a.ts', 'sub/b.ts']);
      expect(h['a.ts']).toMatch(/^[0-9a-f]{64}$/);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('hash changes when content changes', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, 'a.ts'), 'export const a = 1;');
      const h1 = hashSources(d)['a.ts'];
      writeFileSync(join(d, 'a.ts'), 'export const a = 2;');
      expect(hashSources(d)['a.ts']).not.toBe(h1);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('manifest io + diff', () => {
  it('round-trips and compares', () => {
    const d = tmp();
    try {
      writeManifest(d, { schemaVersion: 1, hashes: { 'a.ts': 'x' } });
      expect(readManifest(d)).toEqual({ schemaVersion: 1, hashes: { 'a.ts': 'x' } });
      expect(hashesEqual({ a: '1' }, { a: '1' })).toBe(true);
      expect(hashesEqual({ a: '1' }, { a: '2' })).toBe(false);
      expect(diffManifest({ a: '1', b: '1' }, { a: '2', c: '1' })).toEqual({ changed: ['a'], added: ['c'], deleted: ['b'] });
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('readManifest returns null when absent', () => {
    const d = tmp();
    try { expect(readManifest(d)).toBeNull(); } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
