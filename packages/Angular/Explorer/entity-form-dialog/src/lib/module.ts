import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 

import { FormsModule } from '@angular/forms';
import { EntityFormDialogComponent } from './entity-form-dialog/entity-form-dialog.component';

@NgModule({
  declarations: [
    EntityFormDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    DialogsModule,
    ButtonsModule,
    DialogsModule,
  ],
  exports: [
    EntityFormDialogComponent
  ]
})
export class EntityFormDialogModule { }