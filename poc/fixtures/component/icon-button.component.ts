import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-icon-button',
  template: `<button>{{ icon() }}</button>`,
})
export class IconButtonComponent {
  icon = input.required<string>();
  disabled = input<boolean>(false);
  clicked = output<void>();
}
