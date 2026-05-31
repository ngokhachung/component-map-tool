import { describe, it, expect } from 'vitest';
import { posix } from 'node:path';
import { auditReport, renderAuditMd } from './report.js';
import type { Graph, ComponentNode, Edge } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';

function node(id: string, over: Partial<ComponentNode> = {}): ComponentNode {
  return { id, componentId: null, className: id, selector: null, filePath: `app/${id}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null, ...over };
}
function graph(components: ComponentNode[], edges: Edge[] = []): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}
const ROOT = 'src';

describe('auditReport', () => {
  it('flags md-stale when component is newer than its doc, not when older', () => {
    const fresh = node('Fresh', { docPath: 'docs/Fresh.md' });
    const stale = node('Stale', { docPath: 'docs/Stale.md' });
    const g = graph([fresh, stale]);
    const mtimes = new Map<string, number>([
      [posix.join(ROOT, 'app/Fresh.ts'), 100], ['docs/Fresh.md', 200],
      [posix.join(ROOT, 'app/Stale.ts'), 300], ['docs/Stale.md', 100],
    ]);
    const r = auditReport(g, new Map(), { mtimes, root: ROOT, overrideFiles: new Map(), warnings: [] });
    expect(r.stale.map((s) => s.component)).toEqual(['Stale']);
    expect(r.stale[0].kind).toBe('md');
  });

  it('flags override-stale and lists override orphans', () => {
    const g = graph([node('Host', { componentId: 'C1' })]);
    const overrides = new Map<string, CmapOverride>([
      ['C1', { schemaVersion: 1, componentId: 'C1', dynamicDeps: [] }],
      ['GHOST', { schemaVersion: 1, componentId: 'GHOST', dynamicDeps: [] }],
    ]);
    const overrideFiles = new Map([['C1', 'docs/component-map/C1.cmap.yaml'], ['GHOST', 'docs/component-map/GHOST.cmap.yaml']]);
    const mtimes = new Map<string, number>([
      [posix.join(ROOT, 'app/Host.ts'), 500], ['docs/component-map/C1.cmap.yaml', 100],
    ]);
    const r = auditReport(g, overrides, { mtimes, root: ROOT, overrideFiles, warnings: ['w1'] });
    expect(r.stale.some((s) => s.kind === 'override' && s.component === 'Host')).toBe(true);
    expect(r.overrideOrphans).toEqual(['GHOST']);
    expect(r.warnings).toEqual(['w1']);
  });

  it('renders a markdown report with the expected sections', () => {
    const g = graph([node('A')]);
    const md = renderAuditMd(auditReport(g, new Map(), { mtimes: new Map(), root: ROOT, overrideFiles: new Map(), warnings: [] }));
    expect(md).toContain('# Component Map — Audit');
    expect(md).toContain('## Stale');
    expect(md).toContain('## Coverage');
    expect(md).toContain('## Orphans');
    expect(md).toContain('## Open gaps');
  });
});
