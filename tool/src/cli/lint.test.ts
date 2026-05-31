import { describe, it, expect } from 'vitest';
import { computeIssues, lintChanged } from './lint.js';
import { emptyBaseline } from './baseline.js';
import type { Graph, ComponentNode, Edge } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function graph(components: ComponentNode[], edges: Edge[] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
function ovMap(entries: [string, CmapOverride['dynamicDeps']][]): Map<string, CmapOverride> {
  return new Map(entries.map(([id, deps]) => [id, { schemaVersion: 1, componentId: id, dynamicDeps: deps }]));
}
const outlet = (from: string): Edge => ({ from, to: null, kind: 'unresolved-static', via: 'template', reason: 'ngComponentOutlet' });

describe('computeIssues', () => {
  it('emits missing-md, gap:*, override-broken:*', () => {
    const g = graph(
      [node('NoMd', null), node('HasGap', 'C1'), node('BadOv', 'C2')],
      [outlet('HasGap'), outlet('BadOv')],
    );
    const ov = ovMap([['C2', [{ target: 'DoesNotExist', reason: 'ngComponentOutlet' }]]]);
    const issues = computeIssues(g, ov);
    expect(issues.get('src/NoMd.ts')).toContain('missing-md');
    expect(issues.get('src/HasGap.ts')).toContain('gap:ngComponentOutlet');
    expect(issues.get('src/BadOv.ts')).toContain('override-broken:DoesNotExist');
  });
});

describe('lintChanged', () => {
  it('blocks a changed component with new debt', () => {
    const g = graph([node('NoMd', null)]);
    const r = lintChanged(g, new Map(), ['src/NoMd.ts'], emptyBaseline());
    expect(r.ok).toBe(false);
    expect(r.blocking).toContainEqual({ filePath: 'src/NoMd.ts', codes: ['missing-md'] });
  });

  it('passes when the debt is grandfathered in baseline', () => {
    const g = graph([node('NoMd', null)]);
    const base = { schemaVersion: 1, entries: { 'src/NoMd.ts': ['missing-md'] } };
    expect(lintChanged(g, new Map(), ['src/NoMd.ts'], base).ok).toBe(true);
  });

  it('blocks a clean→dirty regression (file not in baseline)', () => {
    const g = graph([node('HasGap', 'C1')], [outlet('HasGap')]);
    const base = { schemaVersion: 1, entries: { 'src/Other.ts': ['missing-md'] } };
    expect(lintChanged(g, new Map(), ['src/HasGap.ts'], base).ok).toBe(false);
  });

  it('ignores components not in the changed set', () => {
    const g = graph([node('NoMd', null)]);
    expect(lintChanged(g, new Map(), ['src/Unrelated.ts'], emptyBaseline()).ok).toBe(true);
  });

  it('warns (not blocks) on a stale entry of a changed component', () => {
    const g = graph([node('Host', 'C1')]);
    const ov = ovMap([['C1', [{ target: 'X', reason: 'ngComponentOutlet', stale: true }]]]);
    const r = lintChanged(g, ov, ['src/Host.ts'], emptyBaseline());
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.toLowerCase().includes('stale'))).toBe(true);
  });
});
