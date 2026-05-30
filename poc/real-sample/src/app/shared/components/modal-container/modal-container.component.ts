import {
  Component, Input, Type, ViewChild, ViewContainerRef,
} from '@angular/core';

@Component({
  selector: 'app-modal-container',  templateUrl: './modal-container.component.html',
  styleUrls: ['./modal-container.component.scss'],
})
export class ModalContainerComponent {
  @Input() title = '';

  // dynamic host — POC should flag createComponent as unresolved-static
  @ViewChild('host', { read: ViewContainerRef }) host!: ViewContainerRef;

  load(cmp: Type<unknown>): void {
    this.host.clear();
    this.host.createComponent(cmp);
  }
}
