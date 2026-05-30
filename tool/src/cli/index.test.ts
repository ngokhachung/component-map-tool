import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index.js';

function repo(): string {
  const d = mkdtempSync(join(tmpdir(), 'cmap-cli-'));
  writeFileSync(join(d, 'x.ts'), `
    import { Component, NgModule } from '@angular/core';
    @Component({ selector: 'app-child', template: '' }) export class ChildComponent {}
    @Component({ selector: 'app-parent', template: '<app-child></app-child>' }) export class ParentComponent {}
    @NgModule({ declarations: [ChildComponent, ParentComponent] }) export class M {}`);
  return d;
}

describe('runCli index', () => {
  it('builds and reports a summary (exit 0)', () => {
    const d = repo();
    try {
      const r = runCli(['index', '--root', d, '--out', join(d, '.cmap')]);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.lines.join('\n')).components).toBe(2);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('runCli query', () => {
  it('returns impact + access paths JSON', () => {
    const d = repo();
    try {
      const r = runCli(['query', 'ChildComponent', '--root', d, '--out', join(d, '.cmap')]);
      expect(r.code).toBe(0);
      const out = JSON.parse(r.lines.join('\n'));
      expect(out.component.id).toBe('ChildComponent');
      expect(out.impact.ancestors).toContain('ParentComponent');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('writes an HTML preview with --html', () => {
    const d = repo();
    try {
      const html = join(d, 'preview.html');
      const r = runCli(['query', 'ChildComponent', '--root', d, '--out', join(d, '.cmap'), '--html', html]);
      expect(r.code).toBe(0);
      expect(existsSync(html)).toBe(true);
      expect(readFileSync(html, 'utf8')).toContain('ChildComponent');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('exits 1 on not-found and on missing locator', () => {
    const d = repo();
    try {
      expect(runCli(['query', 'Nope', '--root', d, '--out', join(d, '.cmap')]).code).toBe(1);
      expect(runCli(['query', '--root', d]).code).toBe(1);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
