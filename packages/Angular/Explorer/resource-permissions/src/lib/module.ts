import { NgModule } from '@angular/core';
import { ResourcePermissionsComponent } from './resource-permissions.component';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { LayoutModule } from '@progress/kendo-angular-layout';

import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FormsModule } from '@angular/forms';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

@NgModule({
  declarations: [
    ResourcePermissionsComponent,
  ],
  imports: [
    CommonModule,
    GridModule,
    FormsModule,
    DialogsModule,
    ExcelExportModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    ButtonsModule,
    DropDownsModule,
    IndicatorsModule,
    ListViewModule,
    LayoutModule
  ],
  exports: [
    ResourcePermissionsComponent,
  ]
})
export class ResourcePermissionsModule { }