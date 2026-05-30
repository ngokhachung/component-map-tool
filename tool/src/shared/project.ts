import { Project, SourceFile, ClassDeclaration, VariableDeclaration } from 'ts-morph';
import { posix } from 'node:path';

// AST-only Project: no tsconfig, no dependency walking, no type info.
// NEVER call getType/getSymbol/findReferences/getDefinitionNodes on files from this Project
// (each boots the TS type-checker — see RESEARCH §1).
export function createProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false, strict: false },
  });
}

// Add all .ts under `root`, excluding tests / generated / build dirs.
// ts-morph stores paths with forward slashes; globs use them too.
export function addSources(project: Project, root: string): SourceFile[] {
  const r = root.replace(/\\/g, '/').replace(/\/$/, '');
  return project.addSourceFilesAtPaths([
    `${r}/**/*.ts`,
    `!${r}/**/*.spec.ts`,
    `!${r}/**/*.actual.*`,
    `!${r}/**/dist/**`,
    `!${r}/**/node_modules/**`,
  ]);
}

// Resolve a RELATIVE import specifier (from `fromFile`) to a SourceFile already in the project.
// Returns null for bare specifiers (e.g. '@angular/core') — Phase 1 only follows relative imports.
// Pure path math + project lookup; no type-checker.
export function resolveImportFile(project: Project, fromFile: string, specifier: string): SourceFile | null {
  if (!specifier.startsWith('.')) return null;
  const fromDir = posix.dirname(fromFile.replace(/\\/g, '/'));
  const base = posix.normalize(posix.join(fromDir, specifier));
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    const sf = project.getSourceFile(candidate);
    if (sf) return sf;
  }
  return null;
}

// Find an EXPORTED class or top-level const named `name` in `sf`. No type-checker.
export function getExportedDeclaration(
  sf: SourceFile,
  name: string,
): ClassDeclaration | VariableDeclaration | null {
  const cls = sf.getClass(name);
  if (cls?.isExported()) return cls;
  const v = sf.getVariableDeclaration(name);
  if (v && v.getVariableStatement()?.isExported()) return v;
  return null;
}
