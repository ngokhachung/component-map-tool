import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

const ROOT = '../poc/real-sample/src';
const CHANGED = 'data-table.component.ts';
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-cli-')); }

describe('cmap lint (CLI)', () => {
  it('exits 1 on new debt, 0 after --accept, 0 again with the baseline', () => {
    const d = tmp();
    try {
      const out = join(d, '.cmap');
      const baseline = join(d, '.cmap-baseline.json');
      const args = ['--root', ROOT, '--out', out, '--baseline', baseline, '--changed', CHANGED];

      const first = runCli(['lint', ...args]);
      expect(first.code).toBe(1);                       // no MD → missing-md is new debt

      const accept = runCli(['lint', ...args, '--accept']);
      expect(accept.code).toBe(0);
      expect(existsSync(baseline)).toBe(true);

      const second = runCli(['lint', ...args]);
      expect(second.code).toBe(0);                      // grandfathered
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('cmap migrate (CLI)', () => {
  it('writes baseline + coverage and exits 0', () => {
    const d = tmp();
    try {
      const baseline = join(d, '.cmap-baseline.json');
      const coverage = join(d, 'cmap-coverage.md');
      const r = runCli(['migrate', '--root', ROOT, '--out', join(d, '.cmap'),
        '--overrides', join(d, 'component-map'), '--baseline', baseline, '--coverage', coverage]);
      expect(r.code).toBe(0);
      expect(existsSync(baseline)).toBe(true);
      expect(existsSync(coverage)).toBe(true);
      expect(existsSync(coverage.replace(/\.md$/, '.json'))).toBe(true);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
