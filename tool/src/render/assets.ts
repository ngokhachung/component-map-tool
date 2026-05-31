import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let cached: string | null = null;

// Mermaid's browser UMD runtime, read from the installed package and inlined into reports so
// the HTML stays offline / single-file. Mermaid runs client-side only (never in our analysis).
export function mermaidRuntime(): string {
  if (cached === null) cached = readFileSync(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');
  return cached;
}
