import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCoverage, migrate } from './migrate.js';
import { computeIssues } from './lint.js';
import { readBaseline } from './baseline.js';
import type { Graph, ComponentNode, Edge } from '../types.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function graph(components: ComponentNode[], edges: Edge[] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
const outlet = (from: string): Edge => ({ from, to: null, kind: 'unresolved-static', via: 'template', reason: 'ngComponentOutlet' });
function tmp(): string { return mkdtempSync(join(tmpdir(), 'cmap-mig-')); }

describe('computeCoverage', () => {
  it('counts MD coverage, needingDoc and documented', () => {
    const g = graph(
      [node('A', 'CA'), node('B', 'CB'), node('C', null)],
      [outlet('A'), outlet('B')],
    );
    const issues = computeIssues(g, new Map([['CA', { schemaVersion: 1, componentId: 'CA', dynamicDeps: [{ target: 'C', reason: 'ngComponentOutlet' }] }]]));
    const cov = computeCoverage(g, issues);
    expect(cov.totalComponents).toBe(3);
    expect(cov.withMd).toBe(2);
    expect(cov.needingDoc).toBe(2);      // A and B have constructs
    expect(cov.documented).toBe(1);      // A covered, B open
    expect(cov.missingMd).toEqual(['src/C.ts']);
  });
});

describe('migrate', () => {
  it('writes a baseline matching computeIssues and a coverage md+json', () => {
    const d = tmp();
    try {
      const g = graph([node('NoMd', null)], [outlet('NoMd')]);
      const overridesDir = join(d, 'component-map');
      const baselinePath = join(d, '.cmap-baseline.json');
      const coveragePath = join(d, 'cmap-coverage.md');
      const r = migrate(g, new Map(), { overridesDir, baselinePath, coveragePath });

      const issues = computeIssues(g, new Map());
      const base = readBaseline(baselinePath);
      expect(new Set(base.entries['src/NoMd.ts'])).toEqual(new Set(issues.get('src/NoMd.ts')));
      expect(existsSync(coveragePath)).toBe(true);
      expect(existsSync(coveragePath.replace(/\.md$/, '.json'))).toBe(true);
      expect(r.coverage.withMd).toBe(0);
      expect(readFileSync(coveragePath, 'utf8')).toContain('Coverage');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
