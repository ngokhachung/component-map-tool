import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { buildIncremental } from '../cache/index.js';
import { enrichGraph } from '../md/index.js';
import { writeGraph } from '../graph/index.js';
import { resolveLocator } from '../query/locator.js';
import { impact, uiAccessPaths } from '../query/index.js';
import { renderHtml, type HtmlData } from './html.js';
import type { Graph } from '../types.js';

export interface CliResult { code: number; lines: string[]; }

function buildEnriched(root: string, out: string, docs: string | undefined): { graph: Graph; parseErrors: { component: string; messages: string[] }[]; warnings: string[]; fromCache: boolean } {
  const { graph, parseErrors, fromCache } = buildIncremental(root, out);
  let warnings: string[] = [];
  if (docs) { warnings = enrichGraph(graph, docs).warnings; writeGraph(graph, out); }
  return { graph, parseErrors, warnings, fromCache };
}

function imageDataUris(images: { caption: string | null; path: string }[], docs: string | undefined): { caption: string | null; dataUri: string }[] {
  if (!docs) return [];
  const out: { caption: string | null; dataUri: string }[] = [];
  for (const img of images) {
    const p = join(docs, img.path);
    if (existsSync(p)) {
      const ext = extname(p).slice(1).toLowerCase() || 'png';
      out.push({ caption: img.caption, dataUri: `data:image/${ext};base64,${readFileSync(p).toString('base64')}` });
    }
  }
  return out;
}

export function runCli(argv: string[]): CliResult {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string', default: '.' },
      docs: { type: 'string' },
      out: { type: 'string', default: '.cmap' },
      html: { type: 'string' },
    },
  });
  const cmd = positionals[0];
  const root = values.root as string;
  const out = values.out as string;
  const docs = values.docs as string | undefined;

  if (cmd === 'index') {
    const { graph, parseErrors, warnings, fromCache } = buildEnriched(root, out, docs);
    return { code: 0, lines: [JSON.stringify({
      components: graph.components.length, edges: graph.edges.length, routes: graph.routes.length,
      parseErrorComponents: parseErrors.length, mdWarnings: warnings.length, fromCache,
    }, null, 2)] };
  }

  if (cmd === 'query') {
    const locator = positionals[1];
    if (!locator) return { code: 1, lines: ['usage: cmap query <locator> [--root dir] [--docs dir] [--out dir] [--html file]'] };
    const { graph } = buildEnriched(root, out, docs);
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

  return { code: 1, lines: ['usage: cmap <index|query> [--root dir] [--docs dir] [--out dir] [--html file]'] };
}
