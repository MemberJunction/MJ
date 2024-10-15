import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 

import { GenericDialogComponent } from './lib/dialog.component';
 
@NgModule({
  declarations: [
    GenericDialogComponent
  ],
  imports: [
    CommonModule,
    DialogsModule,
    ButtonsModule,
  ],
  exports: [
    GenericDialogComponent
  ]
})
export class GenericDialogModule { }