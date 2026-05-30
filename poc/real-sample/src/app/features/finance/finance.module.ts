import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../../shared/shared.module';
import { FinanceRoutingModule } from './finance-routing.module';

import { InvoiceManagementComponent } from './components/invoice-management/invoice-management.component';
import { PaymentSummaryComponent } from './components/payment-summary/payment-summary.component';
import { ReportFilterComponent } from './components/report-filter/report-filter.component';

import { InvoiceListPage } from './pages/invoice-list/invoice-list.page';
import { PaymentDetailPage } from './pages/payment-detail/payment-detail.page';
import { ReportDashboardPage } from './pages/report-dashboard/report-dashboard.page';

@NgModule({
  imports: [CommonModule, SharedModule, FinanceRoutingModule],
  declarations: [
    InvoiceManagementComponent,
    PaymentSummaryComponent,
    ReportFilterComponent,
    InvoiceListPage,
    PaymentDetailPage,
    ReportDashboardPage,
  ],
})
export class FinanceModule {}
