import { describe, it, expect } from 'vitest';
import { gitMtime, gitMtimes } from './mtime.js';

describe('gitMtime', () => {
  it('returns a positive epoch for a tracked file', () => {
    // tests run from tool/ ; package.json is tracked
    const t = gitMtime('package.json');
    expect(typeof t).toBe('number');
    expect(t as number).toBeGreaterThan(0);
  });
  it('returns null for an unknown path', () => {
    expect(gitMtime('no/such/file-xyz-123.ts')).toBeNull();
  });
  it('gitMtimes maps only the resolvable paths', () => {
    const m = gitMtimes(['package.json', 'no/such/file-xyz-123.ts']);
    expect(m.has('package.json')).toBe(true);
    expect(m.has('no/such/file-xyz-123.ts')).toBe(false);
  });
});
