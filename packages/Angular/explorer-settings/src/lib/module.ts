import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { IconsModule } from '@progress/kendo-angular-icons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { SimpleRecordListModule } from '@memberjunction/ng-simple-record-list';

import { SingleRoleComponent } from './single-role/single-role.component';
import { SettingsComponent } from './settings/settings.component';
import { UserRolesGridComponent } from './user-roles-grid/user-roles-grid.component';
import { SingleUserComponent } from './single-user/single-user.component';
import { SingleApplicationComponent } from './single-application/single-application.component';
import { ApplicationEntitiesGridComponent } from './application-entities-grid/application-entities-grid.component';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';

@NgModule({
  declarations: [
    SingleRoleComponent,
    SettingsComponent,
    UserRolesGridComponent,
    SingleUserComponent,
    SingleApplicationComponent,
    ApplicationEntitiesGridComponent
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
    EntityPermissionsModule,
    MJTabStripModule,
    DialogsModule,
    EntityFormDialogModule,
    IndicatorsModule,
    UserViewGridModule,
    SimpleRecordListModule
  ],
  exports: [
    SingleRoleComponent,
    SettingsComponent,
    UserRolesGridComponent,
    SingleUserComponent,
    SingleApplicationComponent,
    ApplicationEntitiesGridComponent
  ]
})
export class ExplorerSettingsModule { }