import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, imageDataUris } from './index.js';

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

describe('imageDataUris (security)', () => {
  it('embeds in-docs images but refuses path traversal and non-image files', () => {
    const docs = mkdtempSync(join(tmpdir(), 'cmap-docs-'));
    const outside = mkdtempSync(join(tmpdir(), 'cmap-secret-'));
    try {
      mkdirSync(join(docs, 'page'), { recursive: true });
      writeFileSync(join(docs, 'page', 'shot.png'), 'PNGDATA');
      writeFileSync(join(docs, 'page', 'notes.txt'), 'text');
      writeFileSync(join(outside, 'secret.png'), 'TOPSECRET');

      const result = imageDataUris(
        [
          { caption: 'ok', path: 'page/shot.png' },
          { caption: 'bad', path: '../../secret.png' },          // traversal
          { caption: 'bad2', path: join(outside, 'secret.png') }, // absolute escape
          { caption: 'txt', path: 'page/notes.txt' },            // non-image
        ],
        docs,
      );
      expect(result).toHaveLength(1);
      expect(result[0].caption).toBe('ok');
      expect(result[0].dataUri.startsWith('data:image/png;base64,')).toBe(true);
      // the secret file must never be embedded
      expect(result.some((r) => r.dataUri.includes(Buffer.from('TOPSECRET').toString('base64')))).toBe(false);
    } finally {
      rmSync(docs, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('runCli gaps', () => {
  function dynRepo(): string {
    const d = mkdtempSync(join(tmpdir(), 'cmap-gap-'));
    writeFileSync(join(d, 'h.ts'), `
      import { Component, NgModule } from '@angular/core';
      @Component({ selector: 'app-host', template: '<ng-container *ngComponentOutlet="w"></ng-container>' })
      export class HostComponent {}
      @NgModule({ declarations: [HostComponent] }) export class M {}`);
    return d;
  }

  it('lists components with undocumented dynamic deps', () => {
    const d = dynRepo();
    try {
      const r = runCli(['gaps', '--root', d, '--out', join(d, '.cmap'), '--overrides', join(d, 'docs/cmap')]);
      expect(r.code).toBe(0);
      const text = r.lines.join('\n');
      expect(text).toContain('HostComponent');
      expect(text).toContain('ngComponentOutlet');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('gaps --write warns when a gap component has no componentId', () => {
    const d = dynRepo();
    try {
      const r = runCli(['gaps', '--write', '--root', d, '--out', join(d, '.cmap'), '--overrides', join(d, 'docs/cmap')]);
      expect(r.code).toBe(0);
      expect(r.lines.join('\n').toLowerCase()).toContain('componentid');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
