import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { ListBoxModule } from '@progress/kendo-angular-listbox';
 
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { TemplatePreviewComponent } from './lib/template-preview.component';
import { TemplatePreviewDialogComponent } from './lib/dialog.component';

@NgModule({
  declarations: [
    TemplatePreviewComponent,
    TemplatePreviewDialogComponent
  ],
  imports: [
    CommonModule,
    DialogsModule,
    ContainerDirectivesModule,
    ButtonsModule,
    ListBoxModule
  ],
  exports: [
    TemplatePreviewComponent,
    TemplatePreviewDialogComponent
  ]
})
export class TemplatePreviewModule { }