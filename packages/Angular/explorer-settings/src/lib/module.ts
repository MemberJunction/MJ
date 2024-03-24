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
import { RolesListComponent } from './roles-list/roles-list.component';
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';
import { TabStripModule } from '@progress/kendo-angular-layout';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { RecordListComponent } from './record-list/record-list.component';
import { UserRolesGridComponent } from './user-roles-grid/user-roles-grid.component';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { SingleUserComponent } from './single-user/single-user.component';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';

@NgModule({
  declarations: [
    SingleRoleComponent,
    SettingsComponent,
    RolesListComponent,
    RecordListComponent,
    UserRolesGridComponent,
    SingleUserComponent
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
    UserViewGridModule
  ],
  exports: [
    SingleRoleComponent,
    SettingsComponent,
    RolesListComponent,
    RecordListComponent,
    UserRolesGridComponent,
    SingleUserComponent
  ]
})
export class ExplorerSettingsModule { }