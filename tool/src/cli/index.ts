import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { buildIncremental } from '../cache/index.js';
import { enrichGraph } from '../md/index.js';
import { writeGraph } from '../graph/index.js';
import { resolveLocator } from '../query/locator.js';
import { impact, uiAccessPaths } from '../query/index.js';
import { readOverrides } from '../overrides/parse.js';
import { applyOverrides } from '../overrides/merge.js';
import { findGaps, scaffoldGaps } from '../overrides/gaps.js';
import { renderPrComment, type PrComponent } from './pr.js';
import type { CmapOverride } from '../overrides/schema.js';
import { renderHtml, type HtmlData } from './html.js';
import type { Graph } from '../types.js';

export interface CliResult { code: number; lines: string[]; }

interface Built {
  graph: Graph;
  parseErrors: { component: string; messages: string[] }[];
  warnings: string[];
  fromCache: boolean;
  overrides: Map<string, CmapOverride>;
}

function buildEnriched(root: string, out: string, docs: string | undefined, overridesDir: string): Built {
  const { graph, parseErrors, fromCache } = buildIncremental(root, out);
  const warnings: string[] = [];
  if (docs) warnings.push(...enrichGraph(graph, docs).warnings);
  const { overrides, warnings: ovWarnings } = readOverrides(overridesDir);
  warnings.push(...ovWarnings);
  if (overrides.size > 0) warnings.push(...applyOverrides(graph, overrides).warnings);
  if (docs || overrides.size > 0) writeGraph(graph, out);
  return { graph, parseErrors, warnings, fromCache, overrides };
}

const SAFE_IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

export function imageDataUris(
  images: { caption: string | null; path: string }[],
  docs: string | undefined,
): { caption: string | null; dataUri: string }[] {
  if (!docs) return [];
  const out: { caption: string | null; dataUri: string }[] = [];
  for (const img of images) {
    const p = resolve(docs, img.path);
    const rel = relative(resolve(docs), p);
    if (rel.startsWith('..') || isAbsolute(rel)) continue;
    const ext = extname(p).slice(1).toLowerCase();
    if (!SAFE_IMG_EXT.has(ext)) continue;
    if (existsSync(p)) {
      out.push({ caption: img.caption, dataUri: `data:image/${ext};base64,${readFileSync(p).toString('base64')}` });
    }
  }
  return out;
}

// A repo path and a node filePath match when one is a full-segment suffix of the other
// (changed-file paths from git diff need not share the analyzed root's prefix).
function pathSuffixMatch(a: string, b: string): boolean {
  const x = a.replace(/\\/g, '/').split('/').filter(Boolean);
  const y = b.replace(/\\/g, '/').split('/').filter(Boolean);
  const n = Math.min(x.length, y.length);
  if (n === 0) return false;
  for (let i = 1; i <= n; i++) if (x[x.length - i] !== y[y.length - i]) return false;
  return true;
}

const USAGE = 'usage: cmap <index|query|gaps|pr> [--root dir] [--docs dir] [--overrides dir] [--out dir] [--html file] [--write] [--changed csv]';

export function runCli(argv: string[]): CliResult {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string', default: '.' },
      docs: { type: 'string' },
      out: { type: 'string', default: '.cmap' },
      html: { type: 'string' },
      overrides: { type: 'string' },
      write: { type: 'boolean', default: false },
      changed: { type: 'string' },
    },
  });
  const cmd = positionals[0];
  const root = values.root as string;
  const out = values.out as string;
  const docs = values.docs as string | undefined;
  const overridesDir = (values.overrides as string | undefined) ?? 'docs/component-map';

  if (cmd === 'index') {
    const { graph, parseErrors, warnings, fromCache } = buildEnriched(root, out, docs, overridesDir);
    return { code: 0, lines: [JSON.stringify({
      components: graph.components.length, edges: graph.edges.length, routes: graph.routes.length,
      parseErrorComponents: parseErrors.length, warnings: warnings.length, fromCache,
    }, null, 2)] };
  }

  if (cmd === 'query') {
    const locator = positionals[1];
    if (!locator) return { code: 1, lines: [USAGE] };
    const { graph } = buildEnriched(root, out, docs, overridesDir);
    const r = resolveLocator(graph, locator);
    if (!r.ok) {
      if (r.reason === 'ambiguous') return { code: 1, lines: [`ambiguous locator "${locator}"; candidates:`, ...r.candidates.map((c) => `  ${c.id}  (${c.filePath})`)] };
      return { code: 1, lines: [`no component found for "${locator}"`] };
    }
    const node = r.node;
    const imp = impact(graph, node.id);
    const paths = uiAccessPaths(graph, node.id);
    if (values.html) {
      const data: HtmlData = {
        component: { id: node.id, componentId: node.componentId, selector: node.selector, filePath: node.filePath, standalone: node.standalone, module: node.module },
        impact: imp, accessPaths: paths, images: imageDataUris(node.images, docs),
      };
      writeFileSync(values.html as string, renderHtml(data));
      return { code: 0, lines: [`wrote ${values.html}`] };
    }
    return { code: 0, lines: [JSON.stringify({
      component: { id: node.id, componentId: node.componentId, selector: node.selector, filePath: node.filePath, standalone: node.standalone, module: node.module, images: node.images },
      impact: imp, accessPaths: paths,
    }, null, 2)] };
  }

  if (cmd === 'gaps') {
    const { graph, overrides, warnings } = buildEnriched(root, out, docs, overridesDir);
    if (values.write) {
      const { written, warnings: w2 } = scaffoldGaps(graph, overrides, overridesDir);
      return { code: 0, lines: [`scaffolded ${written.length} override file(s) in ${overridesDir}`, ...written.map((f) => `  ${f}`), ...w2] };
    }
    const gaps = findGaps(graph, overrides);
    if (gaps.length === 0) return { code: 0, lines: ['no gaps — all components are statically complete or documented'] };
    return { code: 0, lines: [`${gaps.length} component(s) need documentation:`, ...gaps.map((g) => `  ${g.componentId ?? g.id} (${g.filePath}): ${g.uncovered.join(', ')}`), ...warnings] };
  }

  if (cmd === 'pr') {
    const files = ((values.changed as string | undefined) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const { graph, overrides } = buildEnriched(root, out, docs, overridesDir);
    const gapsByNode = new Map(findGaps(graph, overrides).map((g) => [g.id, g.uncovered]));
    const items: PrComponent[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      for (const node of graph.components.filter((c) => pathSuffixMatch(c.filePath, f))) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        const imp = impact(graph, node.id);
        const paths = uiAccessPaths(graph, node.id);
        items.push({
          id: node.id, componentId: node.componentId, selector: node.selector, filePath: node.filePath,
          description: node.description, ancestors: imp.ancestors, uncertain: imp.uncertain,
          accessPaths: paths.map((p) => ({ routeUrl: p.routeUrl, componentChain: p.componentChain })),
          gaps: gapsByNode.get(node.id) ?? [],
        });
      }
    }
    return { code: 0, lines: [renderPrComment(items)] };
  }

  return { code: 1, lines: [USAGE] };
}
