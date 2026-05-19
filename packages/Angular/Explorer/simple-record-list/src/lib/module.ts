import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

// MJ UI Components
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// LOCAL
import { SimpleRecordListComponent } from './simple-record-list/simple-record-list.component';

@NgModule({
  declarations: [
    SimpleRecordListComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ContainerDirectivesModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    EntityFormDialogModule,
    SharedGenericModule
  ],
  exports: [
    SimpleRecordListComponent
  ]
})
export class SimpleRecordListModule { }