import { Component, ViewContainerRef, inject } from '@angular/core';
@Component({ selector: 'app-dyn', template: '' })
export class DynHostComponent {
  private vcr = inject(ViewContainerRef);
  load(cmp: any) { this.vcr.createComponent(cmp); }
}
