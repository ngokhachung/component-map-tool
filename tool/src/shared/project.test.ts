import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { createProject, resolveImportFile, getExportedDeclaration } from './project.js';

function mkProject(): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/src/b.ts', `export class FinanceModule {}\nexport const routes = [{ path: 'x' }];\nclass Hidden {}`);
  p.createSourceFile('/src/a.ts', `import { FinanceModule } from './b';`);
  return p;
}

describe('createProject', () => {
  it('returns a usable AST-only Project', () => {
    const p = createProject();
    const sf = p.createSourceFile('/m.ts', 'export class A {}');
    expect(sf.getClassOrThrow('A').getName()).toBe('A');
  });
});

describe('resolveImportFile', () => {
  it('resolves a relative specifier to its SourceFile', () => {
    const p = mkProject();
    expect(resolveImportFile(p, '/src/a.ts', './b')?.getFilePath()).toBe('/src/b.ts');
  });
  it('returns null for bare (non-relative) specifiers', () => {
    const p = mkProject();
    expect(resolveImportFile(p, '/src/a.ts', '@angular/core')).toBeNull();
  });
});

describe('getExportedDeclaration', () => {
  it('finds an exported class', () => {
    const b = mkProject().getSourceFileOrThrow('/src/b.ts');
    expect(getExportedDeclaration(b, 'FinanceModule')?.getKindName()).toBe('ClassDeclaration');
  });
  it('finds an exported const', () => {
    const b = mkProject().getSourceFileOrThrow('/src/b.ts');
    expect(getExportedDeclaration(b, 'routes')?.getKindName()).toBe('VariableDeclaration');
  });
  it('returns null for missing or non-exported names', () => {
    const b = mkProject().getSourceFileOrThrow('/src/b.ts');
    expect(getExportedDeclaration(b, 'Hidden')).toBeNull(); // declared but NOT exported
    expect(getExportedDeclaration(b, 'Nope')).toBeNull();
  });
});
