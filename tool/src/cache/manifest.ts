import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export interface Manifest { schemaVersion: number; hashes: Record<string, string>; }

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.cmap']);

function walkTs(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (!IGNORED_DIRS.has(name.name)) walkTs(join(dir, name.name), acc);
    } else if (name.name.endsWith('.ts') && !name.name.endsWith('.spec.ts') && !name.name.includes('.actual.')) {
      acc.push(join(dir, name.name));
    }
  }
}

export function hashSources(root: string): Record<string, string> {
  const files: string[] = [];
  walkTs(root, files);
  const out: Record<string, string> = {};
  for (const f of files.sort()) {
    const rel = relative(root, f).replace(/\\/g, '/');
    out[rel] = createHash('sha256').update(readFileSync(f)).digest('hex');
  }
  return out;
}

export function readManifest(cmapDir: string): Manifest | null {
  const p = join(cmapDir, 'manifest.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Manifest) : null;
}

export function writeManifest(cmapDir: string, manifest: Manifest): void {
  mkdirSync(cmapDir, { recursive: true });
  writeFileSync(join(cmapDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

export function hashesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export function diffManifest(
  oldH: Record<string, string>,
  newH: Record<string, string>,
): { changed: string[]; added: string[]; deleted: string[] } {
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  for (const k of Object.keys(newH)) {
    if (!(k in oldH)) added.push(k);
    else if (oldH[k] !== newH[k]) changed.push(k);
  }
  for (const k of Object.keys(oldH)) if (!(k in newH)) deleted.push(k);
  return { changed, added, deleted };
}
