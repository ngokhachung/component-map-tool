import { execFileSync } from 'node:child_process';

// Last-commit (author) epoch seconds for a path, or null if untracked / no history / git error.
export function gitMtime(path: string): number | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { encoding: 'utf8' }).trim();
    if (!out) return null;
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Map each path to its git mtime, omitting paths with no resolvable time.
export function gitMtimes(paths: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of paths) {
    const t = gitMtime(p);
    if (t !== null) m.set(p, t);
  }
  return m;
}
