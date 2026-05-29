import { Component, Input, Output, EventEmitter, input } from '@angular/core';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-legacy-widget',
  standalone: false,
  templateUrl: './legacy-widget.component.html',
})
export class LegacyWidgetComponent {
  @Input() title = '';
  @Input('data-id') dataId = 0;
  @Output('save') onSave = new EventEmitter<void>();
  count = input<number>(0);
}

@NgModule({ declarations: [LegacyWidgetComponent] })
export class LegacyModule {}
