import { NgModule } from '@angular/core';
import { ResourcePermissionsComponent } from './lib/resource-permissions.component';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports (grid only — other Kendo components have been migrated)
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FormsModule } from '@angular/forms';
import { AvailableResourcesComponent } from './lib/available-resources.component';
import { GenericDialogModule } from '@memberjunction/ng-generic-dialog';
import { RequestResourceAccessComponent } from './lib/request-access.component';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MjButtonDirective, MjDropdownComponent } from '@memberjunction/ng-ui-components';

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
    ExcelExportModule,
    ContainerDirectivesModule,
    IndicatorsModule,
    GenericDialogModule,
    SharedGenericModule,
    MjButtonDirective,
    MjDropdownComponent
  ],
  exports: [
    ResourcePermissionsComponent,
    AvailableResourcesComponent,
    RequestResourceAccessComponent
  ]
})
export class ResourcePermissionsModule { }