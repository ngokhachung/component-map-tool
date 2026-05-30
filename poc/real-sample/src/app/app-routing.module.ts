import { NgModule } from '@angular/core';
import { RouterModule, Routes, CanActivateFn } from '@angular/router';

// Functional guard (name is what the analyzer records, not the impl)
export const authGuard: CanActivateFn = () => true;

const routes: Routes = [
  { path: '', redirectTo: 'finance', pathMatch: 'full' },
  {
    path: 'finance',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/finance/finance.module').then((m) => m.FinanceModule),
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
