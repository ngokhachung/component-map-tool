import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Graph } from '../types.js';
import { parseMdDoc, type MdDoc } from './parse.js';

function walkMd(dir: string, acc: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walkMd(full, acc);
    else if (e.name.endsWith('.md')) acc.push(full);
  }
}

export function readMdDocs(docsDir: string): MdDoc[] {
  if (!existsSync(docsDir)) return [];
  const files: string[] = [];
  walkMd(docsDir, files);
  return files.sort().map((f) => parseMdDoc(readFileSync(f, 'utf8'), relative(docsDir, f).replace(/\\/g, '/')));
}

function pathSuffixMatch(nodePath: string, mdPath: string): boolean {
  const a = nodePath.split('/').filter(Boolean);
  const b = mdPath.split('/').filter(Boolean);
  const n = Math.min(a.length, b.length);
  if (n === 0) return false;
  for (let i = 1; i <= n; i++) if (a[a.length - i] !== b[b.length - i]) return false;
  return true;
}

export function enrichGraph(graph: Graph, docsDir: string): { warnings: string[] } {
  const docs = readMdDocs(docsDir);
  const warnings: string[] = [];

  const byId = new Map<string, string[]>();
  for (const d of docs) if (d.componentId) {
    const arr = byId.get(d.componentId);
    if (arr) arr.push(d.mdPath); else byId.set(d.componentId, [d.mdPath]);
  }
  for (const [id, paths] of byId) if (paths.length > 1) warnings.push(`duplicate componentId ${id} in: ${paths.join(', ')}`);

  for (const d of docs) {
    if (!d.sourcePath) { warnings.push(`MD ${d.mdPath} has no ソースパス source path`); continue; }
    const matches = graph.components.filter((c) => pathSuffixMatch(c.filePath, d.sourcePath as string));
    if (matches.length === 0) { warnings.push(`MD ${d.mdPath} source path ${d.sourcePath} matched no component (orphan)`); continue; }
    if (matches.length > 1) { warnings.push(`MD ${d.mdPath} source path ${d.sourcePath} matched ${matches.length} components (ambiguous)`); continue; }
    const node = matches[0];
    node.componentId = d.componentId;
    node.docPath = d.mdPath;
    node.images = d.images;
  }
  return { warnings };
}
