import { Component, input, output, model } from '@angular/core';

@Component({
  selector: 'app-user-card',
  standalone: true,
  template: `<div>{{ name() }}</div>`,
})
export class UserCardComponent {
  name = input.required<string>();
  avatarUrl = input<string>('');
  selected = model<boolean>(false);
  remove = output<void>();
}
