import { NgModule } from '@angular/core';
import { ResourcePermissionsComponent } from './lib/resource-permissions.component';
import { CommonModule } from '@angular/common';

import { AgGridModule } from 'ag-grid-angular';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FormsModule } from '@angular/forms';
import { AvailableResourcesComponent } from './lib/available-resources.component';
import { GenericDialogModule } from '@memberjunction/ng-generic-dialog';
import { RequestResourceAccessComponent } from './lib/request-access.component';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';

@NgModule({
  declarations: [
    ResourcePermissionsComponent,
    AvailableResourcesComponent,
    RequestResourceAccessComponent
  ],
  imports: [
    CommonModule,
    AgGridModule,
    FormsModule,
    ContainerDirectivesModule,
    GenericDialogModule,
    SharedGenericModule,
    MJButtonDirective,
    MJDropdownComponent
  ],
  exports: [
    ResourcePermissionsComponent,
    AvailableResourcesComponent,
    RequestResourceAccessComponent
  ]
})
export class ResourcePermissionsModule { }
