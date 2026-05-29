import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-tab-panel',
  standalone: false,
  template: `<div class="tab-panel"><ng-content></ng-content></div>`,
})
export class TabPanelComponent {
  @Input() activeTab = 0;
  @Input() tabCount = 1;
  @Output() tabChange = new EventEmitter<number>();
}

class TabHeaderComponent {}

@NgModule({ declarations: [TabPanelComponent, TabHeaderComponent] })
export class TabModule {}
