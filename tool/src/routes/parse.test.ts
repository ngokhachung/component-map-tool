import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind, ArrayLiteralExpression } from 'ts-morph';
import { parseRouteArray, findRootRouteArrays, findChildRouteArrays } from './parse.js';

function firstArray(src: string): ArrayLiteralExpression {
  const p = new Project({ useInMemoryFileSystem: true });
  const sf = p.createSourceFile('/r.ts', src);
  return sf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);
}

describe('parseRouteArray', () => {
  it('parses paths, components, redirects, guards, outlets, pathMatch and nested full paths', () => {
    const arr = firstArray(`const r = [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'admin', component: AdminComponent, canActivate: [authGuard], children: [
        { path: 'users', component: UsersComponent },
        { path: '', component: AdminHomeComponent }
      ]},
      { path: 'aux', component: AuxComponent, outlet: 'side' },
      { path: '**', component: NotFoundComponent }
    ];`);
    const routes = parseRouteArray(arr, '');
    expect(routes[0]).toMatchObject({ fullPath: '', redirectTo: 'home', pathMatch: 'full', component: null });
    expect(routes[1]).toMatchObject({ fullPath: 'admin', component: 'AdminComponent', guards: ['authGuard'] });
    expect(routes[1].children[0]).toMatchObject({ fullPath: 'admin/users', component: 'UsersComponent' });
    expect(routes[1].children[1].fullPath).toBe('admin');
    expect(routes[2]).toMatchObject({ fullPath: 'aux', outlet: 'side' });
    expect(routes[3].fullPath).toBe('**');
  });

  it('recovers lazy loadChildren / loadComponent targets', () => {
    const arr = firstArray(`const r = [
      { path: 'lazy', loadChildren: () => import('./feature/x.module').then(m => m.XModule) },
      { path: 'lc', loadComponent: () => import('./y.component').then(m => m.YComponent) }
    ];`);
    const routes = parseRouteArray(arr, '');
    expect(routes[0].loadChildren).toEqual({ importPath: './feature/x.module', symbol: 'XModule' });
    expect(routes[1].loadComponent).toEqual({ importPath: './y.component', symbol: 'YComponent' });
  });
});

describe('route-array detection (restricted)', () => {
  it('finds arrays fed to forRoot/provideRouter (root) and forChild (child), inline or local const', () => {
    const p = new Project({ useInMemoryFileSystem: true });
    const sf = p.createSourceFile('/m.ts', `
      const routes = [{ path: 'a' }];
      RouterModule.forRoot(routes);
      provideRouter([{ path: 'b' }]);
      RouterModule.forChild([{ path: 'c' }]);
      const NOT_ROUTES = [{ foo: 1 }];`);
    expect(findRootRouteArrays(sf)).toHaveLength(2);
    expect(findChildRouteArrays(sf)).toHaveLength(1);
  });
});
