import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// MJ UI Components
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { RecordSelectorComponent } from './lib/record-selector.component';
import { RecordSelectorDialogComponent } from './lib/dialog.component';

@NgModule({
  declarations: [
    RecordSelectorComponent,
    RecordSelectorDialogComponent
  ],
  imports: [
    CommonModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    ContainerDirectivesModule,
  ],
  exports: [
    RecordSelectorComponent,
    RecordSelectorDialogComponent
  ]
})
export class RecordSelectorModule { }
