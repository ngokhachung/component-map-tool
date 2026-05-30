import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../types.js';
import { SCHEMA_VERSION } from '../types.js';
import { buildGraphFromRoot, writeGraph } from '../graph/index.js';
import { loadGraph } from '../graph/assemble.js';
import { hashSources, readManifest, writeManifest, hashesEqual, diffManifest } from './manifest.js';

export interface IncrementalResult {
  graph: Graph;
  parseErrors: { component: string; messages: string[] }[];
  fromCache: boolean;
  changed: string[];
}

export function buildIncremental(root: string, cmapDir: string): IncrementalResult {
  const current = hashSources(root);
  const old = readManifest(cmapDir);
  const graphPath = join(cmapDir, 'graph.json');

  if (old && old.schemaVersion === SCHEMA_VERSION && hashesEqual(old.hashes, current) && existsSync(graphPath)) {
    try {
      const graph = loadGraph(readFileSync(graphPath, 'utf8'));
      return { graph, parseErrors: [], fromCache: true, changed: [] };
    } catch {
      // unreadable/incompatible cache => fall through to rebuild
    }
  }

  const { graph, parseErrors } = buildGraphFromRoot(root);
  writeGraph(graph, cmapDir);
  writeManifest(cmapDir, { schemaVersion: SCHEMA_VERSION, hashes: current });
  const d = old ? diffManifest(old.hashes, current) : { changed: Object.keys(current), added: [], deleted: [] };
  return { graph, parseErrors, fromCache: false, changed: [...d.changed, ...d.added, ...d.deleted] };
}
