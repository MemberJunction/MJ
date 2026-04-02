import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MJ UI Components
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';

import { EntityFormDialogComponent } from './entity-form-dialog/entity-form-dialog.component';

@NgModule({
  declarations: [
    EntityFormDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
  ],
  exports: [
    EntityFormDialogComponent
  ]
})
export class EntityFormDialogModule { }
