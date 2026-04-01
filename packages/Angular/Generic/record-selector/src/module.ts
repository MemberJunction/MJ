import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// MJ UI Components
import { MjButtonDirective, MjDialogComponent, MjDialogActionsComponent } from '@memberjunction/ng-ui-components';

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
    MjButtonDirective,
    MjDialogComponent,
    MjDialogActionsComponent,
    ContainerDirectivesModule,
  ],
  exports: [
    RecordSelectorComponent,
    RecordSelectorDialogComponent
  ]
})
export class RecordSelectorModule { }
