import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync('../azure-pipelines-audit.yml', 'utf8');

describe('Azure audit pipeline', () => {
  it('runs quarterly on a cron with full history', () => {
    expect(yml).toContain('schedules:');
    expect(yml).toContain("cron: '0 9 1 1,4,7,10 *'");
    expect(yml).toContain('fetchDepth: 0');
  });
  it('runs cmap audit and publishes summary + artifact', () => {
    expect(yml).toContain('cmap -- audit');
    expect(yml).toContain('--report');
    expect(yml).toContain('##vso[task.uploadsummary]');
    expect(yml).toContain('PublishPipelineArtifact');
  });
});
