import { Project, SourceFile } from 'ts-morph';
import { resolveImportFile } from '../shared/project.js';
import { findRootRouteArrays, findChildRouteArrays, parseRouteArray } from './parse.js';
import type { RouteNode } from '../types.js';

// Files reachable via the relative imports of `sf` (one level) — a lazy feature module
// typically holds its RouterModule.forChild() in a separate `*-routing.module.ts` that it imports.
function importedFiles(project: Project, sf: SourceFile): SourceFile[] {
  const out: SourceFile[] = [];
  for (const imp of sf.getImportDeclarations()) {
    const f = resolveImportFile(project, sf.getFilePath(), imp.getModuleSpecifierValue());
    if (f) out.push(f);
  }
  return out;
}

// A lazy module's forChild routes: in the resolved module file OR in a routing module it imports.
function lazyChildRoutes(project: Project, moduleFile: SourceFile, basePath: string): { routes: RouteNode[]; file: SourceFile } {
  for (const f of [moduleFile, ...importedFiles(project, moduleFile)]) {
    const arrays = findChildRouteArrays(f);
    if (arrays.length > 0) return { routes: arrays.flatMap((a) => parseRouteArray(a, basePath)), file: f };
  }
  return { routes: [], file: moduleFile };
}

function stitch(node: RouteNode, project: Project, fromFile: string): void {
  for (const c of node.children) stitch(c, project, fromFile);
  if (node.loadChildren) {
    const target = resolveImportFile(project, fromFile, node.loadChildren.importPath);
    if (target) {
      const { routes: grafted, file } = lazyChildRoutes(project, target, node.fullPath);
      for (const c of grafted) stitch(c, project, file.getFilePath());
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
