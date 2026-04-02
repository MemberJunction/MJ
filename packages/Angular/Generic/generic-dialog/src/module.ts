import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// MJ UI Components
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';

import { GenericDialogComponent } from './lib/dialog.component';

@NgModule({
  declarations: [
    GenericDialogComponent
  ],
  imports: [
    CommonModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
  ],
  exports: [
    GenericDialogComponent
  ]
})
export class GenericDialogModule { }
