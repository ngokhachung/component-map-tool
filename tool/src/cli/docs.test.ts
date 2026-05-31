import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p: string) => readFileSync(`../${p}`, 'utf8');

describe('maintenance docs', () => {
  it('compatibility matrix exists with the verified version + checklist', () => {
    const d = read('docs/COMPATIBILITY.md');
    expect(d).toContain('Angular');
    expect(d).toContain('15');
    expect(d).toContain('@angular/compiler');
    expect(d.toLowerCase()).toContain('upgrade');
  });
  it('schema doc lists the three versions + migration rule', () => {
    const d = read('docs/SCHEMA.md');
    expect(d).toContain('SCHEMA_VERSION');
    expect(d).toContain('OVERRIDE_SCHEMA_VERSION');
    expect(d).toContain('BASELINE_SCHEMA_VERSION');
    expect(d.toLowerCase()).toContain('migration');
  });
  it('changelog covers M1–M6', () => {
    const d = read('CHANGELOG.md');
    for (const m of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']) expect(d).toContain(m);
  });
  it('accuracy sampling checklist exists', () => {
    expect(read('docs/accuracy-sampling-checklist.md').toLowerCase()).toContain('sampl');
  });
  it('README points to CI + maintenance', () => {
    expect(existsSync('../README.md')).toBe(true);
    expect(read('README.md')).toContain('azure-pipelines');
  });
});
