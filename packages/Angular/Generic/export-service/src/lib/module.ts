import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ExportDialogComponent } from './export-dialog.component';
import { ExportService } from './export.service';

@NgModule({
  declarations: [
    ExportDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule
  ],
  exports: [
    ExportDialogComponent
  ],
  providers: [
    ExportService
  ]
})
export class ExportServiceModule { }
