import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WF = readFileSync(fileURLToPath(new URL('../../../.github/workflows/component-map-pr.yml', import.meta.url)), 'utf8');

describe('PR-bot workflow', () => {
  it('triggers on PRs to component files with the right permissions + concurrency', () => {
    expect(WF).toContain('on:');
    expect(WF).toContain('pull_request:');
    expect(WF).toContain('**/*.component.ts');
    expect(WF).toContain('pull-requests: write');
    expect(WF).toMatch(/concurrency:/);
    expect(WF).toContain('cancel-in-progress: true');
  });
  it('checks out full history, runs cmap pr, and posts a sticky comment', () => {
    expect(WF).toContain('fetch-depth: 0');
    expect(WF).toMatch(/git diff --name-only.*--diff-filter=ACMR/);
    expect(WF).toContain('cmap -- pr');
    expect(WF).toContain('actions/github-script@v7');
    expect(WF).toContain('<!-- cmap-pr-bot -->');
  });
  it('does NOT use pull_request_target (security)', () => {
    expect(WF).not.toContain('pull_request_target');
  });
});
