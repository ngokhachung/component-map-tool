export const PR_MARKER = '<!-- cmap-pr-bot -->';

export interface PrComponent {
  id: string;
  componentId: string | null;
  selector: string | null;
  filePath: string;
  description: string | null;
  ancestors: string[];
  uncertain: boolean;
  accessPaths: { routeUrl: string; componentChain: string[] }[];
  gaps: string[];
}

function renderOne(c: PrComponent, maxAncestors: number): string {
  const sel = c.selector ? ` (\`${c.selector}\`)` : '';
  const cid = c.componentId ? ` — ${c.componentId}` : '';
  const lines = [`### \`${c.id}\`${sel}${cid}`];
  if (c.description) lines.push(c.description);
  const shown = c.ancestors.slice(0, maxAncestors);
  const more = c.ancestors.length - shown.length;
  const anc = c.ancestors.length ? `${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}` : '_none_';
  lines.push(`**Affected (${c.ancestors.length}):** ${anc}${c.uncertain ? '  ⚠ _impact may be incomplete (dynamic deps)_' : ''}`);
  if (c.accessPaths.length) {
    lines.push(`**UI access paths:** ${c.accessPaths.map((p) => `\`${p.routeUrl}\` ← ${p.componentChain.join(' › ')}`).join(' · ')}`);
  }
  if (c.gaps.length) {
    lines.push(`**⚠ Undocumented dynamic deps:** ${c.gaps.join(', ')} — run \`cmap gaps --write\` and fill the target(s)`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderPrComment(
  components: PrComponent[],
  opts: { maxAncestors?: number; maxBytes?: number } = {},
): string {
  const maxAncestors = opts.maxAncestors ?? 10;
  const maxBytes = opts.maxBytes ?? 60000;
  const header = `${PR_MARKER}\n## 🗺️ Component Map — impact of this PR\n`;
  if (components.length === 0) return `${header}\n_No mapped component changes._\n`;

  const sections = components.map((c) => renderOne(c, maxAncestors));
  const full = `${header}\n${sections.join('\n')}`;
  if (Buffer.byteLength(full, 'utf8') <= maxBytes) return full;

  let acc = `${header}\n`;
  let shown = 0;
  for (const s of sections) {
    if (Buffer.byteLength(`${acc + s}\n`, 'utf8') > maxBytes - 120) break;
    acc += `${s}\n`;
    shown += 1;
  }
  acc += `\n_… ${components.length - shown} more component(s) truncated._\n`;
  return acc;
}
