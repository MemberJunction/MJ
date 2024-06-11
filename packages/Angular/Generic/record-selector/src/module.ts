import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { ListBoxModule } from '@progress/kendo-angular-listbox';
 
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
    DialogsModule,
    ContainerDirectivesModule,
    ButtonsModule,
    ListBoxModule
  ],
  exports: [
    RecordSelectorComponent,
    RecordSelectorDialogComponent
  ]
})
export class RecordSelectorModule { }