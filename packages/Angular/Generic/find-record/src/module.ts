import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AgGridModule } from 'ag-grid-angular';

// MJ UI Components
import { MjButtonDirective, MjDialogComponent, MjDialogActionsComponent } from '@memberjunction/ng-ui-components';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FindRecordComponent } from './lib/find-record.component';
import { FindRecordDialogComponent } from './lib/dialog.component';

@NgModule({
  declarations: [
    FindRecordComponent,
    FindRecordDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    ContainerDirectivesModule,
    MjButtonDirective,
    MjDialogComponent,
    MjDialogActionsComponent
  ],
  exports: [
    FindRecordComponent,
    FindRecordDialogComponent
  ]
})
export class FindRecordModule { }
