import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// MJ UI Components
import { MjButtonDirective, MjDialogComponent, MjDialogActionsComponent } from '@memberjunction/ng-ui-components';

import { GenericDialogComponent } from './lib/dialog.component';

@NgModule({
  declarations: [
    GenericDialogComponent
  ],
  imports: [
    CommonModule,
    MjButtonDirective,
    MjDialogComponent,
    MjDialogActionsComponent,
  ],
  exports: [
    GenericDialogComponent
  ]
})
export class GenericDialogModule { }
