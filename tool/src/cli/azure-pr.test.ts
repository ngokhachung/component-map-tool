import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const yml = readFileSync('../azure-pipelines-pr.yml', 'utf8');

describe('Azure PR pipeline', () => {
  it('triggers on PR for component files with full history', () => {
    expect(yml).toContain('pr:');
    expect(yml).toContain('**/*.component.ts');
    expect(yml).toContain('fetchDepth: 0');
  });
  it('runs the comment renderer and a fail-able lint gate', () => {
    expect(yml).toContain('cmap -- pr');
    expect(yml).toContain('cmap -- lint');
    expect(yml).toContain('--baseline .cmap-baseline.json');
  });
  it('uses the OAuth token via env, never interpolated into the Authorization line', () => {
    expect(yml).toContain('SYSTEM_ACCESSTOKEN: $(System.AccessToken)');
    const authLines = yml.split('\n').filter((l) => l.includes('Authorization: Bearer'));
    expect(authLines.length).toBeGreaterThan(0);
    for (const l of authLines) {
      expect(l).toContain('$SYSTEM_ACCESSTOKEN');
      expect(l).not.toContain('$(System.AccessToken)');
    }
  });
  it('posts a sticky comment via marker', () => {
    expect(yml).toContain('<!-- cmap-pr-bot -->');
  });
  it('the GitHub workflow has been removed', () => {
    expect(existsSync('../.github/workflows/component-map-pr.yml')).toBe(false);
  });
});
