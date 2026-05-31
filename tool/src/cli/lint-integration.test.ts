import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIncremental } from '../cache/index.js';
import { computeIssues, lintChanged } from './lint.js';
import { emptyBaseline, acceptInto } from './baseline.js';
import type { CmapOverride } from '../overrides/schema.js';

const ROOT = '../poc/real-sample/src';
const work = mkdtempSync(join(tmpdir(), 'cmap-int-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('M4 enforcement on real Angular 15 (real-sample)', () => {
  it('missing-md blocks without a baseline, passes after accept', () => {
    const { graph } = buildIncremental(ROOT, join(work, 'a'));
    const changed = graph.components[0].filePath;          // any real component file
    expect(lintChanged(graph, new Map(), [changed], emptyBaseline()).ok).toBe(false);

    const baseline = acceptInto(emptyBaseline(), computeIssues(graph, new Map()));
    expect(lintChanged(graph, new Map(), [changed], baseline).ok).toBe(true);
  });

  it('a waiver closes a real ngComponentOutlet gap', () => {
    const { graph } = buildIncremental(ROOT, join(work, 'b'));
    const edge = graph.edges.find((e) => e.kind === 'unresolved-static' && e.reason === 'ngComponentOutlet');
    expect(edge).toBeDefined();
    const host = graph.components.find((c) => c.id === edge!.from)!;
    host.componentId = 'RD1';                              // simulate a project MD giving it an id

    expect(computeIssues(graph, new Map()).get(host.filePath)).toContain('gap:ngComponentOutlet');

    const waived: Map<string, CmapOverride> = new Map([
      ['RD1', { schemaVersion: 1, componentId: 'RD1', dynamicDeps: [{ target: '', reason: 'ngComponentOutlet', waived: true }] }],
    ]);
    expect(computeIssues(graph, waived).get(host.filePath) ?? []).not.toContain('gap:ngComponentOutlet');
  });
});
