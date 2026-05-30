import { Component } from '@angular/core';

@Component({
  selector: 'app-payment-detail-page',  templateUrl: './payment-detail.page.html',
  styleUrls: ['./payment-detail.page.scss'],
})
export class PaymentDetailPage {
  id = '0';
  status: 'info' | 'error' = 'info';
}
