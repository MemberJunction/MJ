import { NgModule } from '@angular/core';
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
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { SingleRoleComponent } from './single-role/single-role.component';
import { SettingsComponent } from './settings/settings.component';
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';
import { TabStripModule } from '@progress/kendo-angular-layout';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { UserRolesGridComponent } from './user-roles-grid/user-roles-grid.component';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { SingleUserComponent } from './single-user/single-user.component';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { SimpleRecordListModule } from '@memberjunction/ng-simple-record-list';
import { SingleApplicationComponent } from './single-application/single-application.component';
import { ApplicationEntitiesGridComponent } from './application-entities-grid/application-entities-grid.component';

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
    TabStripModule,
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