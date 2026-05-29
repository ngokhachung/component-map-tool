import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-nav-bar',
  standalone: true,
  template: `<nav><span>{{ title }}</span></nav>`,
})
export class NavBarComponent {
  @Input() title = '';
  @Input() logoUrl = '';
  @Output() menuToggle = new EventEmitter<void>();
}
