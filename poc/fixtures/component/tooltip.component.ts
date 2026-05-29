import { Component } from '@angular/core';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-tooltip',
  standalone: false,
  template: `<span class="tooltip"><ng-content></ng-content></span>`,
})
export class TooltipComponent {}

@NgModule({ declarations: [TooltipComponent] })
export class TooltipModule {}
