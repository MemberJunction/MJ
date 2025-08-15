import { NgModule } from '@angular/core';
import { CodeEditorComponent } from './ng-code-editor.component';
import { CommonModule } from '@angular/common';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

// Export the toolbar configuration types and helpers
export * from './toolbar-config';
export { CodeEditorComponent } from './ng-code-editor.component';

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