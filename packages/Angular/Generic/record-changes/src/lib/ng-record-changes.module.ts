import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { RecordChangesComponent } from './ng-record-changes.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { VersionsModule } from '@memberjunction/ng-versions';

@NgModule({
  declarations: [
    RecordChangesComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    VersionsModule
  ],
  exports: [
    RecordChangesComponent
  ]
})
export class RecordChangesModule {}
