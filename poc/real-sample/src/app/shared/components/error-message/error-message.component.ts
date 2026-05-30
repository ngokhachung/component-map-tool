import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-error-message',  templateUrl: './error-message.component.html',
  styleUrls: ['./error-message.component.scss'],
})
export class ErrorMessageComponent {
  @Input() text: string | null = null;
  @Input('errorCode') code = 0;
}
