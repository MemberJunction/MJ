import { NgModule } from '@angular/core';
import { QueryGridComponent } from './ng-query-grid.component';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

/**
 * @deprecated Use `QueryViewerModule` from `@memberjunction/ng-query-viewer` instead.
 * This module is deprecated and will be removed in a future version.
 */
@NgModule({
  declarations: [
    QueryGridComponent
  ],
  imports: [
    CommonModule,
    GridModule,
    DialogsModule,
    ExcelExportModule,
    ContainerDirectivesModule,
    ButtonsModule
  ],
  exports: [
    QueryGridComponent
  ]
})
export class QueryGridModule { }