import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { ListBoxModule } from '@progress/kendo-angular-listbox';
import { InputsModule } from '@progress/kendo-angular-inputs';
 
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FindRecordComponent } from './lib/find-record.component';
import { FindRecordDialogComponent } from './lib/dialog.component';
import { FormsModule } from '@angular/forms';
import { GridModule } from '@progress/kendo-angular-grid';

@NgModule({
  declarations: [
    FindRecordComponent,
    FindRecordDialogComponent
  ],
  imports: [
    CommonModule,
    DialogsModule,
    FormsModule,
    GridModule,
    ContainerDirectivesModule,
    ButtonsModule,
    ListBoxModule,
    InputsModule
  ],
  exports: [
    FindRecordComponent,
    FindRecordDialogComponent
  ]
})
export class FindRecordModule { }