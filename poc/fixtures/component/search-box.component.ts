import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-search-box',
  standalone: true,
  template: `<input [value]="query()" />`,
})
export class SearchBoxComponent {
  query = input('', { alias: 'q' });
  search = output<string>();
}
