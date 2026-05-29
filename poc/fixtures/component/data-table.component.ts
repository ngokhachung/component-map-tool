import { Component, input, output, model } from '@angular/core';

@Component({
  selector: 'app-data-table',
  standalone: true,
  template: `<table></table>`,
})
export class DataTableComponent {
  rows = input.required<unknown[]>();
  pageSize = input<number>(10);
  selectedRow = model<unknown>(null);
  rowClick = output<unknown>();
}
