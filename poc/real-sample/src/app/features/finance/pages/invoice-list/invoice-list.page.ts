import { Component } from '@angular/core';

@Component({
  selector: 'app-invoice-list-page',  templateUrl: './invoice-list.page.html',
  styleUrls: ['./invoice-list.page.scss'],
})
export class InvoiceListPage {
  query = '';
  total = 0;
  page = 1;
  onSearch(q: string): void {
    this.query = q;
  }
}
