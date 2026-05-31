import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyBaseline, readBaseline, writeBaseline, newViolations, acceptInto } from './baseline.js';

function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-bl-')); }

describe('baseline', () => {
  it('returns an empty baseline for a missing file', () => {
    expect(readBaseline('/no/such/baseline.json').entries).toEqual({});
  });

  it('round-trips and writes deterministically (sorted keys + codes)', () => {
    const d = tmp();
    try {
      const p = join(d, '.cmap-baseline.json');
      writeBaseline(p, { schemaVersion: 1, entries: { 'b.ts': ['gap:x', 'missing-md'], 'a.ts': ['gap:z', 'gap:a'] } });
      const text = readFileSync(p, 'utf8');
      expect(text.indexOf('"a.ts"')).toBeLessThan(text.indexOf('"b.ts"'));      // keys sorted
      expect(readBaseline(p).entries['a.ts']).toEqual(['gap:a', 'gap:z']);       // codes sorted
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('newViolations: all codes new when file absent; only unseen codes when partially present', () => {
    const base = { schemaVersion: 1, entries: { 'a.ts': ['gap:x'] } };
    const current = new Map<string, string[]>([
      ['a.ts', ['gap:x', 'gap:y']],   // gap:x grandfathered, gap:y new
      ['b.ts', ['missing-md']],       // file absent → new
    ]);
    const v = newViolations(current, base);
    expect(v).toContainEqual({ filePath: 'a.ts', codes: ['gap:y'] });
    expect(v).toContainEqual({ filePath: 'b.ts', codes: ['missing-md'] });
    expect(v.find((e) => e.filePath === 'a.ts')!.codes).not.toContain('gap:x');
  });

  it('acceptInto unions current codes into the baseline per file', () => {
    const base = emptyBaseline();
    const merged = acceptInto(base, new Map([['a.ts', ['gap:x']], ['b.ts', ['missing-md']]]));
    expect(new Set(merged.entries['a.ts'])).toEqual(new Set(['gap:x']));
    expect(merged.entries['b.ts']).toEqual(['missing-md']);
  });
});
