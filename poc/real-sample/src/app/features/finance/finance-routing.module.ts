import { NgModule } from '@angular/core';
import { RouterModule, Routes, CanActivateChildFn } from '@angular/router';

import { InvoiceListPage } from './pages/invoice-list/invoice-list.page';
import { PaymentDetailPage } from './pages/payment-detail/payment-detail.page';
import { ReportDashboardPage } from './pages/report-dashboard/report-dashboard.page';

export const roleGuard: CanActivateChildFn = () => true;

const routes: Routes = [
  { path: '', redirectTo: 'invoices', pathMatch: 'full' },
  { path: 'invoices', component: InvoiceListPage },
  { path: 'payments/:id', component: PaymentDetailPage, canActivate: [roleGuard] },
  { path: 'reports', component: ReportDashboardPage },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FinanceRoutingModule {}
