import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface PkgLike { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; }

export function angularMajorFromPkg(pkg: PkgLike): number | null {
  const dep = pkg.dependencies?.['@angular/core'] ?? pkg.devDependencies?.['@angular/core'];
  if (!dep) return null;
  const m = String(dep).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function detectAngularMajor(root: string): number | null {
  const p = join(root, 'package.json');
  return existsSync(p) ? angularMajorFromPkg(JSON.parse(readFileSync(p, 'utf8')) as PkgLike) : null;
}

export function standaloneDefault(major: number | null): boolean {
  return major != null && major >= 19;
}
