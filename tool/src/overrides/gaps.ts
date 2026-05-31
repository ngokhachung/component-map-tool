import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { Graph } from '../types.js';
import { OVERRIDE_SCHEMA_VERSION, type CmapOverride, type DynamicDep } from './schema.js';

export interface GapComponent {
  id: string;
  componentId: string | null;
  filePath: string;
  uncovered: string[];
}

// A "gap" is a PINNABLE dynamic construct — one where the user can name a target component.
// Only `unresolved-static` edges qualify (ngComponentOutlet / @ViewChild / createComponent).
// `indirect` edges (ng-content, ngTemplateOutlet) are structural/projection with no component
// target to document, so they are NOT gaps (avoids adoption-killing noise — QA S1).
function constructsByComponent(graph: Graph): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.kind === 'unresolved-static' && e.reason) {
      const s = m.get(e.from) ?? new Set<string>();
      s.add(e.reason);
      m.set(e.from, s);
    }
  }
  return new Map([...m].map(([k, s]) => [k, [...s].sort()]));
}

function coveredReasons(ov: CmapOverride | undefined): Set<string> {
  const covered = new Set<string>();
  if (ov) for (const d of ov.dynamicDeps) if (!d.stale && d.reason && (d.target.trim() || d.waived)) covered.add(d.reason);
  return covered;
}

export function findGaps(graph: Graph, overrides: Map<string, CmapOverride>): GapComponent[] {
  const constructs = constructsByComponent(graph);
  const gaps: GapComponent[] = [];
  for (const node of graph.components) {
    const reasons = constructs.get(node.id);
    if (!reasons) continue;
    const covered = coveredReasons(node.componentId ? overrides.get(node.componentId) : undefined);
    const uncovered = reasons.filter((r) => !covered.has(r));
    if (uncovered.length) gaps.push({ id: node.id, componentId: node.componentId, filePath: node.filePath, uncovered });
  }
  return gaps;
}

// Scaffold/update <componentId>.cmap.yaml for every component with dynamic constructs.
// Merge-safe: keep existing entries (preserving filled targets) by construct reason; add new
// constructs with target:''; mark entries whose construct disappeared stale:true. Idempotent.
export function scaffoldGaps(
  graph: Graph,
  overrides: Map<string, CmapOverride>,
  docsDir: string,
): { written: string[]; warnings: string[] } {
  const constructs = constructsByComponent(graph);
  const written: string[] = [];
  const warnings: string[] = [];
  mkdirSync(docsDir, { recursive: true });

  for (const node of graph.components) {
    const reasons = constructs.get(node.id);
    if (!reasons) continue;
    if (!node.componentId) {
      warnings.push(`${node.id} has dynamic deps but no componentId (add project MD first) — cannot scaffold`);
      continue;
    }
    const existing = overrides.get(node.componentId);
    const byReason = new Map<string, DynamicDep>();
    if (existing) for (const d of existing.dynamicDeps) if (d.reason) byReason.set(d.reason, d);

    const deps: DynamicDep[] = [];
    for (const reason of reasons) {
      const prev = byReason.get(reason);
      deps.push(prev ? { target: prev.target, reason } : { target: '', reason });
      byReason.delete(reason);
    }
    for (const [reason, prev] of byReason) deps.push({ target: prev.target, reason, stale: true });

    const doc: CmapOverride = { schemaVersion: OVERRIDE_SCHEMA_VERSION, componentId: node.componentId, dynamicDeps: deps };
    const body = yaml.dump(doc, { lineWidth: -1, sortKeys: false });
    writeFileSync(join(docsDir, `${node.componentId}.cmap.yaml`), body);
    written.push(`${node.componentId}.cmap.yaml`);
  }
  return { written, warnings };
}
