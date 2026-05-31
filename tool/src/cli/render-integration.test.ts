import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

const ROOT = '../poc/real-sample/src';
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-render-')); }

describe('cmap query --html (Mermaid subgraph)', () => {
  it('embeds a flowchart for the queried component', () => {
    const d = tmp();
    try {
      const html = join(d, 'q.html');
      const r = runCli(['query', 'DataTableComponent', '--root', ROOT, '--out', join(d, '.cmap'), '--html', html]);
      expect(r.code).toBe(0);
      const out = readFileSync(html, 'utf8');
      expect(out).toContain('class="mermaid"');
      expect(out).toContain('flowchart TD');
      expect(out).toContain('nDataTableComponent');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('cmap render --html (whole graph)', () => {
  it('writes an svg page covering all components', () => {
    const d = tmp();
    try {
      const html = join(d, 'g.html');
      const r = runCli(['render', '--root', ROOT, '--out', join(d, '.cmap'), '--html', html]);
      expect(r.code).toBe(0);
      const out = readFileSync(html, 'utf8');
      expect(out).toContain('<svg');
      expect(out).toContain('id="cmap-search"');
      expect((out.match(/data-id="/g) || []).length).toBeGreaterThanOrEqual(18);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('render without --html exits 1', () => {
    expect(runCli(['render', '--root', ROOT]).code).toBe(1);
  });
});
