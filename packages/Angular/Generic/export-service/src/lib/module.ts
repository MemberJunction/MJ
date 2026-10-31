import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ExportDialogComponent } from './export-dialog.component';
import { ExportService } from './export.service';
import { OfficeConnectPanelComponent } from './office-connect-panel.component';

@NgModule({
  declarations: [
    ExportDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    OfficeConnectPanelComponent
  ],
  exports: [
    ExportDialogComponent,
    OfficeConnectPanelComponent
  ],
  providers: [
    ExportService
  ]
})
export class ExportServiceModule { }
