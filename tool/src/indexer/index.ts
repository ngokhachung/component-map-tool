import { Project } from 'ts-morph';
import { posix } from 'node:path';
import type { ComponentRecord } from '../types.js';
import { extractComponentMeta } from './component.js';
import { buildModuleMap } from './module-map.js';
import { detectAngularMajor, standaloneDefault } from './version.js';

export function resolveStandalone(explicit: boolean | null, module: string | null, versionDefault: boolean): boolean {
  if (explicit !== null) return explicit;
  if (module !== null) return false;
  return versionDefault;
}

function toRepoRelative(filePath: string, root: string): string {
  return posix.relative(root.replace(/\\/g, '/'), filePath.replace(/\\/g, '/'));
}

export function indexComponents(project: Project, opts: { root: string }): ComponentRecord[] {
  const moduleMap = buildModuleMap(project);
  const versionDefault = standaloneDefault(detectAngularMajor(opts.root));
  const records: ComponentRecord[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = toRepoRelative(sf.getFilePath(), opts.root);
    for (const cls of sf.getClasses()) {
      const meta = extractComponentMeta(cls, filePath);
      if (!meta) continue;
      const module = moduleMap.get(meta.className) ?? null;
      records.push({
        className: meta.className,
        selector: meta.selector,
        filePath: meta.filePath,
        standalone: resolveStandalone(meta.standaloneExplicit, module, versionDefault),
        module,
        templateKind: meta.templateKind,
        inputs: meta.inputs,
        outputs: meta.outputs,
      });
    }
  }
  return records;
}
