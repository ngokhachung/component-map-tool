import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { parseRoutes } from './index.js';

function repo(): Project {
  const p = new Project({ useInMemoryFileSystem: true });
  p.createSourceFile('/src/app-routing.module.ts', `
    import { RouterModule } from '@angular/router';
    const routes = [
      { path: '', redirectTo: 'finance', pathMatch: 'full' },
      { path: 'finance', loadChildren: () => import('./feature/finance.module').then(m => m.FinanceModule) }
    ];
    RouterModule.forRoot(routes);`);
  p.createSourceFile('/src/feature/finance.module.ts', `
    import { RouterModule } from '@angular/router';
    const routes = [
      { path: '', redirectTo: 'invoices', pathMatch: 'full' },
      { path: 'invoices', component: InvoiceListPage }
    ];
    RouterModule.forChild(routes);`);
  return p;
}

describe('parseRoutes', () => {
  it('stitches a lazy loadChildren route to its target module forChild routes (full URL)', () => {
    const roots = parseRoutes(repo(), { root: '/src' });
    expect(roots).toHaveLength(2);
    expect(roots[0]).toMatchObject({ fullPath: '', redirectTo: 'finance', pathMatch: 'full' });

    const finance = roots[1];
    expect(finance.fullPath).toBe('finance');
    expect(finance.loadChildren).toEqual({ importPath: './feature/finance.module', symbol: 'FinanceModule' });
    const invoices = finance.children.find((c) => c.component === 'InvoiceListPage')!;
    expect(invoices.fullPath).toBe('finance/invoices');
    expect(finance.children.find((c) => c.redirectTo === 'invoices')?.fullPath).toBe('finance');
  });

  it('returns [] when there are no root route arrays', () => {
    const p = new Project({ useInMemoryFileSystem: true });
    p.createSourceFile('/src/x.ts', `const a = [{ path: 'nope' }];`);
    expect(parseRoutes(p, { root: '/src' })).toEqual([]);
  });
});
