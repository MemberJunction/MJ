import { NgModule } from '@angular/core';
import { EntityPermissionsGridComponent } from './grid/entity-permissions-grid.component';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports (grid only — other Kendo components have been migrated)
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FormsModule } from '@angular/forms';
import { EntityPermissionsSelectorWithGridComponent } from './entity-selector-with-grid/entity-selector-with-grid.component';
import { MjButtonDirective, MjDropdownComponent } from '@memberjunction/ng-ui-components';

@NgModule({
  declarations: [
    EntityPermissionsGridComponent,
    EntityPermissionsSelectorWithGridComponent
  ],
  imports: [
    CommonModule,
    GridModule,
    FormsModule,
    ExcelExportModule,
    ContainerDirectivesModule,
    IndicatorsModule,
    SharedGenericModule,
    MjButtonDirective,
    MjDropdownComponent
  ],
  exports: [
    EntityPermissionsGridComponent,
    EntityPermissionsSelectorWithGridComponent
  ]
})
export class EntityPermissionsModule { }