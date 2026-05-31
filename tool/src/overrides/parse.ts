import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import { validate, OVERRIDE_SCHEMA_VERSION, type CmapOverride } from './schema.js';

function walk(dir: string, acc: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith('.cmap.yaml')) acc.push(full);
  }
}

export function readOverrides(dir: string): { overrides: Map<string, CmapOverride>; warnings: string[] } {
  const overrides = new Map<string, CmapOverride>();
  const warnings: string[] = [];
  if (!existsSync(dir)) return { overrides, warnings };
  const files: string[] = [];
  walk(dir, files);
  for (const f of files.sort()) {
    const rel = relative(dir, f).replace(/\\/g, '/');
    let parsed: unknown;
    try {
      parsed = yaml.load(readFileSync(f, 'utf8'));
    } catch {
      warnings.push(`${rel}: YAML parse error — skipped`);
      continue;
    }
    const v = validate(parsed);
    if (!v.ok) { warnings.push(`${rel}: invalid override — ${v.errors.join('; ')}`); continue; }
    if (v.value.schemaVersion !== OVERRIDE_SCHEMA_VERSION) {
      warnings.push(`${rel}: unknown schemaVersion ${v.value.schemaVersion} — skipped`);
      continue;
    }
    if (overrides.has(v.value.componentId)) {
      warnings.push(`${rel}: duplicate override componentId ${v.value.componentId} — kept first`);
      continue;
    }
    overrides.set(v.value.componentId, v.value);
  }
  return { overrides, warnings };
}
