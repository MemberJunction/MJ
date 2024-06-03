import { NgModule } from '@angular/core';
import { CodeEditorComponent } from './ng-code-editor.component';
import { CommonModule } from '@angular/common';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
 

@NgModule({
  declarations: [
    CodeEditorComponent
  ],
  imports: [
    CommonModule,
    ContainerDirectivesModule
  ],
  exports: [
    CodeEditorComponent
  ]
})
export class CodeEditorModule { }