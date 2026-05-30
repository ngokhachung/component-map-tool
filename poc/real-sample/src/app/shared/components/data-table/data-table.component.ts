import { Component, ViewChild, TemplateRef, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-data-table',
  templateUrl: './data-table.component.html',
  styleUrls: ['./data-table.component.scss'],
})
export class DataTableComponent {
  @Input() rows: unknown[] = [];
  @Input() sortKey = '';
  @Output() rowClick = new EventEmitter<unknown>();

  @ViewChild('rowTpl') rowTemplate?: TemplateRef<unknown>;
}
