import { NgModule } from '@angular/core';
import { EntityPermissionsGridComponent } from './grid/entity-permissions-grid.component';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { IconsModule } from '@progress/kendo-angular-icons';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FormsModule } from '@angular/forms';
import { EntityPermissionsSelectorWithGridComponent } from './entity-selector-with-grid/entity-selector-with-grid.component';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

@NgModule({
  declarations: [
    EntityPermissionsGridComponent,
    EntityPermissionsSelectorWithGridComponent
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
    IconsModule,
    DropDownsModule,
    IndicatorsModule
  ],
  exports: [
    EntityPermissionsGridComponent,
    EntityPermissionsSelectorWithGridComponent
  ]
})
export class EntityPermissionsModule { }