import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-notification-banner',
  templateUrl: './notification-banner.component.html',
  styleUrls: ['./notification-banner.component.scss'],
})
export class NotificationBannerComponent {
  @Input() level: 'info' | 'warn' | 'error' = 'info';
  @Input() message = '';
}
