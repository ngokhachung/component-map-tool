import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<canvas></canvas>`,
})
export class ChartComponent {
  data = input.required<number[]>();
  activeIndex = model.required<number>();
}
