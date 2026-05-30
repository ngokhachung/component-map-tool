import { Project } from 'ts-morph';
import { resolveImportFile } from '../shared/project.js';
import { findRootRouteArrays, findChildRouteArrays, parseRouteArray } from './parse.js';
import type { RouteNode } from '../types.js';

function stitch(node: RouteNode, project: Project, fromFile: string): void {
  for (const c of node.children) stitch(c, project, fromFile);
  if (node.loadChildren) {
    const target = resolveImportFile(project, fromFile, node.loadChildren.importPath);
    if (target) {
      const grafted = findChildRouteArrays(target).flatMap((a) => parseRouteArray(a, node.fullPath));
      for (const c of grafted) stitch(c, project, target.getFilePath());
      node.children = [...node.children, ...grafted];
    }
  }
}

export function parseRoutes(project: Project, _opts: { root: string }): RouteNode[] {
  const roots: { node: RouteNode; file: string }[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const arr of findRootRouteArrays(sf)) {
      for (const node of parseRouteArray(arr, '')) roots.push({ node, file: sf.getFilePath() });
    }
  }
  for (const r of roots) stitch(r.node, project, r.file);
  return roots.map((r) => r.node);
}
