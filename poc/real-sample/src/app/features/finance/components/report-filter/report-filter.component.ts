import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-report-filter',  templateUrl: './report-filter.component.html',
  styleUrls: ['./report-filter.component.scss'],
})
export class ReportFilterComponent {
  @Output() apply = new EventEmitter<{ q: string; type: string }>();
  type = 'all';
  emit(): void {
    this.apply.emit({ q: '', type: this.type });
  }
}
