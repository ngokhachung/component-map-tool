import { describe, it, expect } from 'vitest';
import { validate } from './schema.js';

describe('validate', () => {
  it('accepts a well-formed override', () => {
    const r = validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: 'FooComponent', reason: 'x' }] });
    expect(r.ok).toBe(true);
  });
  it('rejects missing componentId and non-array dynamicDeps', () => {
    expect(validate({ schemaVersion: 1, dynamicDeps: [] }).ok).toBe(false);
    expect(validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: 'no' }).ok).toBe(false);
  });
  it('rejects a dynamicDeps entry whose target is not a string', () => {
    const r = validate({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ reason: 'x' }] });
    expect(r.ok).toBe(false);
  });
  it('rejects a non-object', () => {
    expect(validate('nope').ok).toBe(false);
    expect(validate(null).ok).toBe(false);
  });
});
