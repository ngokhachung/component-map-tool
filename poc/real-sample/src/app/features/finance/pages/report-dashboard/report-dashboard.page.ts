import { Component, Type } from '@angular/core';

@Component({
  selector: 'app-report-dashboard-page',  templateUrl: './report-dashboard.page.html',
  styleUrls: ['./report-dashboard.page.scss'],
})
export class ReportDashboardPage {
  rows: unknown[] = [];
  widget: Type<unknown> | null = null;
  onApply(filter: unknown): void {
    this.rows = [];
  }
}
