// Regression gate for the real-sample: build the verify:real report and compare
// it against a committed golden baseline (verify-real.expected.json).
//
//   npm run verify:real:check    -> diff vs baseline; exit 1 if it drifts
//   npm run verify:real:bless    -> (re)write the baseline from the current output
//
// Throwaway POC tooling — not production code.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport, writeActual, REAL } from './verify-real.js';

const EXPECTED_PATH = join(REAL, 'verify-real.expected.json');
const bless = process.argv.includes('--bless');

// Generic structural diff. With sortReport() making arrays deterministic, index
// alignment is stable, so paths like `components[3].standaloneResolved` are precise.
function deepDiff(exp: unknown, act: unknown, path = '', out: string[] = []): string[] {
  if (exp === act) return out;
  const bothObj = exp !== null && act !== null && typeof exp === 'object' && typeof act === 'object';
  if (!bothObj) {
    out.push(`${path || '(root)'}: expected ${JSON.stringify(exp)}  |  actual ${JSON.stringify(act)}`);
    return out;
  }
  if (Array.isArray(exp) || Array.isArray(act)) {
    const ea = exp as unknown[];
    const aa = act as unknown[];
    const n = Math.max(ea.length, aa.length);
    for (let i = 0; i < n; i++) {
      if (i >= ea.length) out.push(`${path}[${i}]: ADDED ${JSON.stringify(aa[i])}`);
      else if (i >= aa.length) out.push(`${path}[${i}]: REMOVED ${JSON.stringify(ea[i])}`);
      else deepDiff(ea[i], aa[i], `${path}[${i}]`, out);
    }
    return out;
  }
  const eo = exp as Record<string, unknown>;
  const ao = act as Record<string, unknown>;
  for (const k of new Set([...Object.keys(eo), ...Object.keys(ao)])) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in eo)) out.push(`${p}: ADDED ${JSON.stringify(ao[k])}`);
    else if (!(k in ao)) out.push(`${p}: REMOVED ${JSON.stringify(eo[k])}`);
    else deepDiff(eo[k], ao[k], p, out);
  }
  return out;
}

let report;
try {
  report = buildReport();
} catch (e) {
  console.error(`\n[verify:real:check] ${(e as Error).message}\n`);
  process.exit(1);
}

const serialized = JSON.stringify(report, null, 2);

if (bless) {
  writeFileSync(EXPECTED_PATH, serialized + '\n');
  console.log('[verify:real:check] Baseline written to verify-real.expected.json');
  console.log(`[verify:real:check] Summary: ${JSON.stringify(report.summary)}`);
  process.exit(0);
}

// keep the inspectable actual.json fresh too
writeActual(report);

if (!existsSync(EXPECTED_PATH)) {
  console.error(
    '\n[verify:real:check] No baseline found (verify-real.expected.json).\n' +
    'Create one from the current (reviewed) output with:  npm run verify:real:bless\n',
  );
  process.exit(1);
}

const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'));
const diffs = deepDiff(expected, report);

if (diffs.length === 0) {
  console.log(`[verify:real:check] OK — output matches baseline. ${JSON.stringify(report.summary)}`);
  process.exit(0);
}

console.error(`\n[verify:real:check] REGRESSION — ${diffs.length} difference(s) vs baseline:\n`);
for (const d of diffs.slice(0, 100)) console.error('  ' + d);
if (diffs.length > 100) console.error(`  … and ${diffs.length - 100} more`);
console.error('\nIf this change is intentional, update the baseline:  npm run verify:real:bless\n');
process.exit(1);
