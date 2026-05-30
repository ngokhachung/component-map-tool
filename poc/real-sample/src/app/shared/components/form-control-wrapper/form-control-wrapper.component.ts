import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-form-control-wrapper',  templateUrl: './form-control-wrapper.component.html',
  styleUrls: ['./form-control-wrapper.component.scss'],
})
export class FormControlWrapperComponent {
  @Input() label = '';
  @Input() required = false;
}
