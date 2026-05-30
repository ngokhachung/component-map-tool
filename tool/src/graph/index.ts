import { Project } from 'ts-morph';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../types.js';
import { createProject, addSources } from '../shared/project.js';
import { indexComponents } from '../indexer/index.js';
import { buildEdges } from '../edges/index.js';
import { parseRoutes } from '../routes/index.js';
import { assembleGraph, serializeGraph } from './assemble.js';

export interface BuildResult {
  graph: Graph;
  parseErrors: { component: string; messages: string[] }[];
}

export function buildGraph(project: Project, opts: { root: string }): BuildResult {
  const records = indexComponents(project, opts);
  const { edges, parseErrors } = buildEdges(project, records, opts);
  const routes = parseRoutes(project, opts);
  return { graph: assembleGraph(records, edges, routes), parseErrors };
}

export function buildGraphFromRoot(root: string): BuildResult {
  const project = createProject();
  addSources(project, root);
  return buildGraph(project, { root });
}

export function writeGraph(graph: Graph, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const p = join(outDir, 'graph.json');
  writeFileSync(p, serializeGraph(graph));
  return p;
}
