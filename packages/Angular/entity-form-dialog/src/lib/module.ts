import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { IconsModule } from '@progress/kendo-angular-icons';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FormsModule } from '@angular/forms';
import { EntityFormDialog } from './entity-form-dialog/entity-form-dialog.component';

@NgModule({
  declarations: [
    EntityFormDialog
  ],
  imports: [
    CommonModule,
    FormsModule,
    DialogsModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    ButtonsModule,
    IconsModule,
    DialogsModule,
  ],
  exports: [
    EntityFormDialog
  ]
})
export class EntityFormDialogModule { }