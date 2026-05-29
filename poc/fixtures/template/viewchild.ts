import { Component, ViewChild, ElementRef } from '@angular/core';
@Component({ selector: 'app-host', template: '' })
export class HostComponent {
  @ViewChild('ref') ref!: ElementRef;
}
