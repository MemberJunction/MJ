import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

import { UserViewGridComponent } from './lib/ng-user-view-grid.component';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { EntityCommunicationsModule } from '@memberjunction/ng-entity-communications';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ListManagementModule } from '@memberjunction/ng-list-management';

@NgModule({
  declarations: [
    UserViewGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GridModule,
    DialogsModule,
    ExcelExportModule,
    ButtonsModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    LayoutModule,
    InputsModule,
    EntityFormDialogModule,
    IndicatorsModule,
    EntityCommunicationsModule,
    ResourcePermissionsModule,
    SharedGenericModule,
    ListManagementModule
  ],
  exports: [
    UserViewGridComponent
  ]
})
export class UserViewGridModule { }