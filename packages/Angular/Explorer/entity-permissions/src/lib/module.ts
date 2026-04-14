import { NgModule } from '@angular/core';
import { EntityPermissionsGridComponent } from './grid/entity-permissions-grid.component';
import { CommonModule } from '@angular/common';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FormsModule } from '@angular/forms';
import { EntityPermissionsSelectorWithGridComponent } from './entity-selector-with-grid/entity-selector-with-grid.component';
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';

@NgModule({
  declarations: [
    EntityPermissionsGridComponent,
    EntityPermissionsSelectorWithGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    MJButtonDirective,
    MJDropdownComponent
  ],
  exports: [
    EntityPermissionsGridComponent,
    EntityPermissionsSelectorWithGridComponent
  ]
})
export class EntityPermissionsModule { }