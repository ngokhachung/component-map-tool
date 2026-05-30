import { Project, SourceFile, ClassDeclaration, Node, SyntaxKind } from 'ts-morph';
import { readFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import type { ComponentRecord, Edge } from '../types.js';
import { buildMatcher, parseTemplateDeps, type SelectorEntry } from './template-visitor.js';

export function buildSelectorRegistry(records: ComponentRecord[]): SelectorEntry[] {
  return records
    .filter((r): r is ComponentRecord & { selector: string } => r.selector !== null)
    .map((r) => ({ selector: r.selector, className: r.className }));
}

function readComponentTemplate(cls: ClassDeclaration, sf: SourceFile): string | null {
  const arg = cls.getDecorator('Component')?.getArguments()[0];
  if (!arg || !Node.isObjectLiteralExpression(arg)) return null;
  const t = arg.getProperty('template')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (t && (Node.isStringLiteral(t) || Node.isNoSubstitutionTemplateLiteral(t))) return t.getLiteralValue();
  const u = arg.getProperty('templateUrl')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  if (u && Node.isStringLiteral(u)) {
    const p = posix.join(posix.dirname(sf.getFilePath()), u.getLiteralValue());
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  return null;
}

function scanTsDeps(cls: ClassDeclaration): string[] {
  const reasons: string[] = [];
  for (const prop of cls.getProperties()) {
    if (prop.getDecorator('ViewChild') || prop.getDecorator('ViewChildren')) reasons.push('@ViewChild query');
  }
  for (const call of cls.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (Node.isPropertyAccessExpression(expr) && expr.getName() === 'createComponent') reasons.push('createComponent');
  }
  return reasons;
}

export interface EdgeBuildResult {
  edges: Edge[];
  parseErrors: { component: string; messages: string[] }[];
}

export function buildEdges(project: Project, records: ComponentRecord[], _opts: { root: string }): EdgeBuildResult {
  const matcher = buildMatcher(buildSelectorRegistry(records));
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const parseErrors: { component: string; messages: string[] }[] = [];

  const push = (e: Edge): void => {
    const key = `${e.from}|${e.to}|${e.kind}|${e.reason}`;
    if (!seen.has(key)) { seen.add(key); edges.push(e); }
  };

  for (const sf of project.getSourceFiles()) {
    for (const cls of sf.getClasses()) {
      if (!cls.getDecorator('Component')) continue;
      const from = cls.getName() ?? '<anon>';
      const html = readComponentTemplate(cls, sf);
      if (html !== null) {
        const r = parseTemplateDeps(html, `${from}.html`, matcher);
        if (r.parseErrors > 0) parseErrors.push({ component: from, messages: r.errorMessages });
        for (const d of r.deps) push({ from, to: d.component, kind: d.kind, via: 'template', reason: d.reason });
      }
      for (const reason of scanTsDeps(cls)) push({ from, to: null, kind: 'unresolved-static', via: 'template', reason });
    }
  }
  return { edges, parseErrors };
}
