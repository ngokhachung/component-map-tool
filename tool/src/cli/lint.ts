import type { Graph } from '../types.js';
import type { CmapOverride } from '../overrides/schema.js';
import { findGaps } from '../overrides/gaps.js';
import { resolveLocator } from '../query/locator.js';
import { newViolations, type BaselineFile } from './baseline.js';

// Mirrors cli/index.ts pathSuffixMatch: two paths match when one is a full-segment
// suffix of the other (git-diff paths need not share the analyzed root's prefix).
function pathSuffixMatch(a: string, b: string): boolean {
  const x = a.replace(/\\/g, '/').split('/').filter(Boolean);
  const y = b.replace(/\\/g, '/').split('/').filter(Boolean);
  const n = Math.min(x.length, y.length);
  if (n === 0) return false;
  for (let i = 1; i <= n; i++) if (x[x.length - i] !== y[y.length - i]) return false;
  return true;
}

// Per-component issue codes for the whole graph.
//   'missing-md'               — node has no project-MD componentId
//   `gap:<reason>`             — uncovered (unfilled + unwaived) dynamic construct (via findGaps)
//   `override-broken:<target>` — a non-stale, non-waived override target that does not resolve
export function computeIssues(graph: Graph, overrides: Map<string, CmapOverride>): Map<string, string[]> {
  const issues = new Map<string, string[]>();
  const add = (filePath: string, code: string) => {
    const a = issues.get(filePath); if (a) a.push(code); else issues.set(filePath, [code]);
  };
  for (const node of graph.components) if (node.componentId === null) add(node.filePath, 'missing-md');
  for (const g of findGaps(graph, overrides)) for (const reason of g.uncovered) add(g.filePath, `gap:${reason}`);
  for (const node of graph.components) {
    if (!node.componentId) continue;
    const ov = overrides.get(node.componentId);
    if (!ov) continue;
    for (const dep of ov.dynamicDeps) {
      if (dep.stale || dep.waived || dep.target.trim().length === 0) continue;
      if (!resolveLocator(graph, dep.target).ok) add(node.filePath, `override-broken:${dep.target}`);
    }
  }
  return issues;
}

export interface LintResult {
  blocking: { filePath: string; codes: string[] }[];
  warnings: string[];
  ok: boolean;
}

export function lintChanged(
  graph: Graph,
  overrides: Map<string, CmapOverride>,
  changedFiles: string[],
  baseline: BaselineFile,
  overrideWarnings: string[] = [],
): LintResult {
  const isChanged = (filePath: string) => changedFiles.some((f) => pathSuffixMatch(filePath, f));
  const current = new Map<string, string[]>();
  for (const [filePath, codes] of computeIssues(graph, overrides)) if (isChanged(filePath)) current.set(filePath, codes);
  const blocking = newViolations(current, baseline);

  const warnings: string[] = [];
  for (const node of graph.components) {
    if (!node.componentId || !isChanged(node.filePath)) continue;
    const ov = overrides.get(node.componentId);
    if (!ov) continue;
    for (const dep of ov.dynamicDeps) if (dep.stale) warnings.push(`${node.filePath}: stale entry (${dep.reason ?? 'unknown construct'}) — vanished from code`);
  }
  warnings.push(...overrideWarnings);

  return { blocking, warnings, ok: blocking.length === 0 };
}

function explain(code: string): string {
  if (code === 'missing-md') return 'missing-md — no project MD (componentId). Create its MD doc.';
  if (code.startsWith('gap:')) return `${code} — undocumented dynamic dependency. Fill the target in .cmap.yaml (or set waived: true).`;
  if (code.startsWith('override-broken:')) return `${code} — override target does not resolve. Fix the target.`;
  return code;
}

export function renderLint(result: LintResult): string[] {
  const lines: string[] = result.warnings.map((w) => `⚠ ${w}`);
  if (result.ok) { lines.push('✓ cmap lint: no new documentation debt in changed components'); return lines; }
  lines.push(`✗ cmap lint: ${result.blocking.length} changed component(s) introduce new documentation debt:`);
  for (const b of result.blocking) {
    lines.push(`  ${b.filePath}`);
    for (const c of b.codes) lines.push(`    - ${explain(c)}`);
  }
  lines.push('Fix: fill the target in .cmap.yaml (or set `waived: true`), create the project MD, or run `cmap lint --accept` to grandfather this debt.');
  return lines;
}
