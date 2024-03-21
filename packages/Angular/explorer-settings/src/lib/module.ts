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

@NgModule({
  declarations: [
    SingleRoleComponent,
    SettingsComponent,
    RolesListComponent
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
    EntityPermissionsModule
  ],
  exports: [
    SingleRoleComponent,
    SettingsComponent,
    RolesListComponent
  ]
})
export class ExplorerSettingsModule { }