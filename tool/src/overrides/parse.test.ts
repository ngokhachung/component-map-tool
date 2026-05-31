import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOverrides } from './parse.js';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-ov-')); }

describe('readOverrides', () => {
  it('reads *.cmap.yaml into a map keyed by componentId', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, 'C1.cmap.yaml'), 'schemaVersion: 1\ncomponentId: C1\ndynamicDeps:\n  - target: FooComponent\n    reason: dialog\n');
      const { overrides, warnings } = readOverrides(d);
      expect(overrides.get('C1')?.dynamicDeps[0].target).toBe('FooComponent');
      expect(warnings).toEqual([]);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it('warns + skips malformed YAML, unknown schemaVersion, and duplicate componentId', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, 'bad.cmap.yaml'), 'schemaVersion: 1\ncomponentId: [unclosed\n');
      writeFileSync(join(d, 'future.cmap.yaml'), 'schemaVersion: 99\ncomponentId: C9\ndynamicDeps: []\n');
      writeFileSync(join(d, 'a.cmap.yaml'), 'schemaVersion: 1\ncomponentId: DUP\ndynamicDeps: []\n');
      writeFileSync(join(d, 'b.cmap.yaml'), 'schemaVersion: 1\ncomponentId: DUP\ndynamicDeps: []\n');
      const { overrides, warnings } = readOverrides(d);
      expect(overrides.has('C9')).toBe(false);
      expect(overrides.has('DUP')).toBe(true);
      expect(warnings.some((w) => w.toLowerCase().includes('yaml'))).toBe(true);
      expect(warnings.some((w) => w.includes('schemaVersion'))).toBe(true);
      expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it('returns empty for a missing dir', () => {
    expect(readOverrides('/no/such/dir').overrides.size).toBe(0);
  });
});
