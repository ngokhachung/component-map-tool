import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DataTableComponent } from './components/data-table/data-table.component';
import { SearchBoxComponent } from './components/search-box/search-box.component';
import { PaginationComponent } from './components/pagination/pagination.component';
import { TooltipComponent } from './components/tooltip/tooltip.component';
import { ProgressIndicatorComponent } from './components/progress-indicator/progress-indicator.component';
import { NotificationBannerComponent } from './components/notification-banner/notification-banner.component';
import { DropdownSelectorComponent } from './components/dropdown-selector/dropdown-selector.component';
import { ErrorMessageComponent } from './components/error-message/error-message.component';
import { FileUploaderComponent } from './components/file-uploader/file-uploader.component';
import { FormControlWrapperComponent } from './components/form-control-wrapper/form-control-wrapper.component';
import { ModalContainerComponent } from './components/modal-container/modal-container.component';

// Angular 15: all shared components are NgModule-based (non-standalone by default).
@NgModule({
  imports: [CommonModule],
  declarations: [
    DataTableComponent,
    SearchBoxComponent,
    PaginationComponent,
    TooltipComponent,
    ProgressIndicatorComponent,
    NotificationBannerComponent,
    DropdownSelectorComponent,
    ErrorMessageComponent,
    FileUploaderComponent,
    FormControlWrapperComponent,
    ModalContainerComponent,
  ],
  exports: [
    DataTableComponent,
    SearchBoxComponent,
    PaginationComponent,
    TooltipComponent,
    ProgressIndicatorComponent,
    NotificationBannerComponent,
    DropdownSelectorComponent,
    ErrorMessageComponent,
    FileUploaderComponent,
    FormControlWrapperComponent,
    ModalContainerComponent,
  ],
})
export class SharedModule {}
