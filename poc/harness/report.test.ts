import { describe, it, expect } from 'vitest';
import { scoreCase, scoreTask } from './report.js';
import type { CaseResult } from '../types.js';

describe('scoreCase', () => {
  it('passes when actual matches expected and no parse errors', () => {
    const r = scoreCase('f1', [{ a: 1 }], [{ a: 1 }], 0);
    expect(r.pass).toBe(true);
    expect(r.borderline).toBe(false);
  });
  it('FAILS when parseErrors > 0 even if nodes match', () => {
    const r = scoreCase('f2', [{ a: 1 }], [{ a: 1 }], 2);
    expect(r.pass).toBe(false);
    expect(r.notes).toContain('parse error');
  });
  it('fails on mismatch', () => {
    const r = scoreCase('f3', [{ a: 1 }], [{ a: 2 }], 0);
    expect(r.pass).toBe(false);
  });
});

describe('scoreTask', () => {
  it('computes rate from raw counts', () => {
    const cases: CaseResult[] = [
      { fixture: 'a', pass: true, notes: '', borderline: false },
      { fixture: 'b', pass: false, notes: 'x', borderline: false },
    ];
    const t = scoreTask('component', cases);
    expect(t.total).toBe(2);
    expect(t.passed).toBe(1);
    expect(t.rate).toBe(0.5);
  });
});
