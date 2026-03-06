import { NgModule } from '@angular/core';
import { ResourcePermissionsComponent } from './lib/resource-permissions.component';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { LayoutModule } from '@progress/kendo-angular-layout';

import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FormsModule } from '@angular/forms';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { AvailableResourcesComponent } from './lib/available-resources.component';
import { GenericDialogModule } from '@memberjunction/ng-generic-dialog';
import { RequestResourceAccessComponent } from './lib/request-access.component';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

@NgModule({
  declarations: [
    ResourcePermissionsComponent,
    AvailableResourcesComponent,
    RequestResourceAccessComponent
  ],
  imports: [
    CommonModule,
    GridModule,
    FormsModule,
    DialogsModule,
    ExcelExportModule,
    ContainerDirectivesModule,
    ButtonsModule,
    DropDownsModule,
    IndicatorsModule,
    ListViewModule,
    LayoutModule,
    GenericDialogModule,
    SharedGenericModule
  ],
  exports: [
    ResourcePermissionsComponent,
    AvailableResourcesComponent,
    RequestResourceAccessComponent
  ]
})
export class ResourcePermissionsModule { }