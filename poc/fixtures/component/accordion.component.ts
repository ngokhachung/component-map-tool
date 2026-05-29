import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-accordion',
  standalone: false,
  templateUrl: './accordion.component.html',
})
export class AccordionComponent {
  @Input() items: string[] = [];
  @Input() expandedIndex = -1;
  @Output() expandedIndexChange = new EventEmitter<number>();
}

@NgModule({ declarations: [AccordionComponent] })
export class AccordionModule {}
