import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo (ListBox remains — migrated in Phase 2.3)
import { ListBoxModule } from '@progress/kendo-angular-listbox';

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
    ListBoxModule
  ],
  exports: [
    RecordSelectorComponent,
    RecordSelectorDialogComponent
  ]
})
export class RecordSelectorModule { }
