import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { SimpleRecordListModule } from '@memberjunction/ng-simple-record-list';

import { SettingsComponent } from './settings/settings.component';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { JoinGridModule } from '@memberjunction/ng-join-grid';
import { SqlLoggingComponent } from './sql-logging/sql-logging.component';

@NgModule({
  declarations: [],
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
    EntityPermissionsModule,
    MJTabStripModule,
    DialogsModule,
    EntityFormDialogModule,
    IndicatorsModule,
    UserViewGridModule,
    SimpleRecordListModule,
    JoinGridModule,
    SettingsComponent,
    SqlLoggingComponent
  ],
  exports: [
    SettingsComponent,
    SqlLoggingComponent
  ]
})
export class ExplorerSettingsModule { }