// Order-insensitive, COUNT-AWARE deep equality (must not dedupe).
// Canonicalize every value to a stable string; arrays compared as multisets
// by canonicalizing each element and comparing sorted canonical-string lists.

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) {
    const parts = value.map(canonical).sort();
    return `[${parts.join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export function multisetEqual(actual: unknown, expected: unknown): boolean {
  return canonical(actual) === canonical(expected);
}
