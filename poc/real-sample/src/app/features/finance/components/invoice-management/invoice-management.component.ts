import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-invoice-management',  templateUrl: './invoice-management.component.html',
  styleUrls: ['./invoice-management.component.scss'],
})
export class InvoiceManagementComponent {
  @Input() filter = '';
  invoices: { id: string; amount: number }[] = [];
  showModal = false;
}
