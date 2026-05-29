import { describe, it, expect } from 'vitest';
import { multisetEqual } from './diff.js';

describe('multisetEqual', () => {
  it('treats arrays as order-insensitive', () => {
    expect(multisetEqual([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }])).toBe(true);
  });
  it('is count-aware: duplicates must match (not deduped)', () => {
    expect(multisetEqual([{ a: 1 }, { a: 1 }], [{ a: 1 }])).toBe(false);
  });
  it('compares nested objects deeply', () => {
    expect(multisetEqual([{ a: { b: [1, 2] } }], [{ a: { b: [1, 2] } }])).toBe(true);
    expect(multisetEqual([{ a: { b: [1, 2] } }], [{ a: { b: [2, 1] } }])).toBe(true);
  });
  it('detects a missing element', () => {
    expect(multisetEqual([{ a: 1 }, { a: 2 }], [{ a: 1 }])).toBe(false);
  });
  it('compares scalars and equal objects', () => {
    expect(multisetEqual(5, 5)).toBe(true);
    expect(multisetEqual({ x: 1 }, { x: 1 })).toBe(true);
    expect(multisetEqual({ x: 1 }, { x: 2 })).toBe(false);
  });
});
