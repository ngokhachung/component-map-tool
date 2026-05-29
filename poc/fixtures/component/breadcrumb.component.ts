import { Component, Input } from '@angular/core';
import { NgModule } from '@angular/core';

@Component({
  selector: 'app-breadcrumb',
  standalone: false,
  template: `<nav aria-label="breadcrumb"></nav>`,
})
export class BreadcrumbComponent {
  @Input() items: { label: string; url: string }[] = [];
}

@NgModule({ declarations: [BreadcrumbComponent] })
export class BreadcrumbModule {}
