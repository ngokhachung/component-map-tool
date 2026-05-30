import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-payment-summary',  templateUrl: './payment-summary.component.html',
  styleUrls: ['./payment-summary.component.scss'],
})
export class PaymentSummaryComponent {
  @Input() paymentId = '';
  loading = false;
  error: string | null = null;
}
