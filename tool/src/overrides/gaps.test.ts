import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { findGaps, scaffoldGaps } from './gaps.js';
import type { Graph, ComponentNode, Edge } from '../types.js';
import type { CmapOverride } from './schema.js';

function node(className: string, componentId: string | null): ComponentNode {
  return { id: className, componentId, className, selector: null, filePath: `src/${className}.ts`, standalone: false, module: null, templateKind: 'none', inputs: [], outputs: [], docPath: null, images: [], description: null };
}
function unresolved(from: string, reason: string): Edge {
  return { from, to: null, kind: 'unresolved-static', via: 'template', reason };
}
function graph(components: ComponentNode[], edges: Edge[]): Graph {
  return { schemaVersion: 2, components, edges, routes: [] };
}

describe('findGaps', () => {
  it('reports components with uncovered dynamic-construct reasons', () => {
    const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
    const gaps = findGaps(g, new Map());
    expect(gaps).toEqual([{ id: 'HostComponent', componentId: 'C1', filePath: 'src/HostComponent.ts', uncovered: ['ngComponentOutlet'] }]);
  });
  it('omits a component whose constructs are all covered by a filled override entry', () => {
    const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
    const ov = new Map<string, CmapOverride>([['C1', { schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: 'WidgetComponent', reason: 'ngComponentOutlet' }] }]]);
    expect(findGaps(g, ov)).toEqual([]);
  });
  it('omits components with no dynamic constructs', () => {
    const g = graph([node('Plain', 'C2')], [{ from: 'Plain', to: 'X', kind: 'resolved', via: 'template', reason: null }]);
    expect(findGaps(g, new Map())).toEqual([]);
  });
});

describe('scaffoldGaps', () => {
  it('writes a skeleton with an empty target per construct', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-sc-'));
    try {
      const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
      const { written } = scaffoldGaps(g, new Map(), dir);
      expect(written).toEqual(['C1.cmap.yaml']);
      const doc = yaml.load(readFileSync(join(dir, 'C1.cmap.yaml'), 'utf8')) as CmapOverride;
      expect(doc).toMatchObject({ schemaVersion: 1, componentId: 'C1', dynamicDeps: [{ target: '', reason: 'ngComponentOutlet' }] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('preserves an already-filled target (merge-safe) and marks a vanished construct stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-sc-'));
    try {
      const g = graph([node('HostComponent', 'C1')], [unresolved('HostComponent', 'ngComponentOutlet')]);
      const existing = new Map<string, CmapOverride>([['C1', { schemaVersion: 1, componentId: 'C1', dynamicDeps: [
        { target: 'WidgetComponent', reason: 'ngComponentOutlet' },
        { target: 'OldComponent', reason: 'createComponent' },
      ] }]]);
      scaffoldGaps(g, existing, dir);
      const doc = yaml.load(readFileSync(join(dir, 'C1.cmap.yaml'), 'utf8')) as CmapOverride;
      expect(doc.dynamicDeps).toContainEqual({ target: 'WidgetComponent', reason: 'ngComponentOutlet' });
      expect(doc.dynamicDeps).toContainEqual({ target: 'OldComponent', reason: 'createComponent', stale: true });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('skips (with warning) a component that has dynamic deps but no componentId', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmap-sc-'));
    try {
      const g = graph([node('NoIdComponent', null)], [unresolved('NoIdComponent', 'ngComponentOutlet')]);
      const { written, warnings } = scaffoldGaps(g, new Map(), dir);
      expect(written).toEqual([]);
      expect(warnings.some((w) => w.includes('NoIdComponent') && w.toLowerCase().includes('componentid'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
