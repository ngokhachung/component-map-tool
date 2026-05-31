import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

const ROOT = '../poc/real-sample/src';
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-audit-')); }

describe('cmap audit (CLI)', () => {
  it('prints a markdown audit and exits 0', () => {
    const d = tmp();
    try {
      const r = runCli(['audit', '--root', ROOT, '--out', join(d, '.cmap')]);
      expect(r.code).toBe(0);
      const md = r.lines.join('\n');
      expect(md).toContain('# Component Map — Audit');
      expect(md).toContain('## Coverage');
      expect(md).toContain('## Open gaps');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('--report writes <p>.md + <p>.json', () => {
    const d = tmp();
    try {
      const report = join(d, 'audit');
      const r = runCli(['audit', '--root', ROOT, '--out', join(d, '.cmap'), '--report', report]);
      expect(r.code).toBe(0);
      expect(existsSync(`${report}.md`)).toBe(true);
      expect(existsSync(`${report}.json`)).toBe(true);
      const json = JSON.parse(readFileSync(`${report}.json`, 'utf8'));
      expect(json.coverage.withMd).toBe(0);
      expect(Array.isArray(json.gaps)).toBe(true);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
