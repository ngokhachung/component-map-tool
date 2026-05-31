import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync('../.github/workflows/component-map-pr.yml', 'utf8');

describe('PR workflow — lint gate', () => {
  it('runs cmap lint with a baseline', () => {
    expect(yml).toContain('cmap -- lint');
    expect(yml).toContain('--baseline .cmap-baseline.json');
  });
  it('passes changed files to lint via env, not shell interpolation', () => {
    const lintLine = yml.split('\n').find((l) => l.includes('cmap -- lint'));
    expect(lintLine).toBeDefined();
    expect(lintLine!).toContain('"$CHANGED_FILES"');
    expect(lintLine!).not.toContain('${{');
  });
  it('keeps the comment step and avoids pull_request_target', () => {
    expect(yml).toContain('actions/github-script');
    expect(yml).not.toContain('pull_request_target');
  });
});
