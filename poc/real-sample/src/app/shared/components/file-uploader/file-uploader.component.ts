import { Component, ElementRef, Input, Output, EventEmitter, ViewChild } from '@angular/core';

@Component({
  selector: 'app-file-uploader',  templateUrl: './file-uploader.component.html',
  styleUrls: ['./file-uploader.component.scss'],
})
export class FileUploaderComponent {
  @Input() accept = '*';
  @Output() filesPicked = new EventEmitter<FileList>();

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  busy = false;

  open(): void {
    this.fileInput?.nativeElement.click();
  }
}
