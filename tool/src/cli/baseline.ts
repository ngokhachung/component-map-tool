import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const BASELINE_SCHEMA_VERSION = 1;

// Accepted documentation debt: repo-relative component filePath → set of issue codes.
// Issue codes: 'missing-md' | `gap:<reason>` | `override-broken:<target>`.
export interface BaselineFile {
  schemaVersion: number;
  entries: Record<string, string[]>;
}

export function emptyBaseline(): BaselineFile {
  return { schemaVersion: BASELINE_SCHEMA_VERSION, entries: {} };
}

export function readBaseline(path: string): BaselineFile {
  if (!existsSync(path)) return emptyBaseline();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BaselineFile>;
    if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
      return {
        schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : BASELINE_SCHEMA_VERSION,
        entries: parsed.entries as Record<string, string[]>,
      };
    }
  } catch { /* malformed → treat as empty */ }
  return emptyBaseline();
}

// Deterministic: sorted keys + sorted codes (stable git diffs, stable tests).
export function writeBaseline(path: string, file: BaselineFile): void {
  mkdirSync(dirname(path) || '.', { recursive: true });
  const entries: Record<string, string[]> = {};
  for (const k of Object.keys(file.entries).sort()) entries[k] = [...file.entries[k]].sort();
  writeFileSync(path, `${JSON.stringify({ schemaVersion: file.schemaVersion, entries }, null, 2)}\n`);
}

// Codes present now (per changed file) that the baseline has NOT already accepted.
export function newViolations(
  current: Map<string, string[]>,
  baseline: BaselineFile,
): { filePath: string; codes: string[] }[] {
  const out: { filePath: string; codes: string[] }[] = [];
  for (const [filePath, codes] of current) {
    const accepted = new Set(baseline.entries[filePath] ?? []);
    const fresh = codes.filter((c) => !accepted.has(c));
    if (fresh.length) out.push({ filePath, codes: fresh });
  }
  return out;
}

// Union current codes into the baseline (for --accept and the migrate snapshot).
export function acceptInto(baseline: BaselineFile, current: Map<string, string[]>): BaselineFile {
  const entries: Record<string, string[]> = { ...baseline.entries };
  for (const [filePath, codes] of current) {
    const set = new Set([...(entries[filePath] ?? []), ...codes]);
    if (set.size) entries[filePath] = [...set];
  }
  return { schemaVersion: baseline.schemaVersion, entries };
}
