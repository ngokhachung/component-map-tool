import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-dropdown-selector',
  templateUrl: './dropdown-selector.component.html',
  styleUrls: ['./dropdown-selector.component.scss'],
})
export class DropdownSelectorComponent {
  @Input() options: string[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
}
