import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MJButtonDirective, MJDialogComponent, MJDialogTitlebarComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { MJReactModule } from '@memberjunction/ng-react';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MarkdownModule } from '@memberjunction/ng-markdown';
// BaseFormsModule supplies <mj-interactive-form> for the Form Builder
// cockpit's Preview tab. The cockpit binds a working spec + a real Top-1
// record into it so the user sees the form rendering live as they edit.
import { BaseFormsModule } from '@memberjunction/ng-base-forms';

// Component Studio Components
import { ComponentStudioDashboardComponent } from './ComponentStudio/component-studio-dashboard.component';
import { ComponentStudioResourceComponent } from './ComponentStudio/component-studio-resource.component';
import { TextImportDialogComponent } from './ComponentStudio/components/text-import-dialog.component';
import { ArtifactSelectionDialogComponent } from './ComponentStudio/components/artifact-selection-dialog.component';
import { ArtifactLoadDialogComponent } from './ComponentStudio/components/artifact-load-dialog.component';
import { ComponentBrowserComponent } from './ComponentStudio/components/browser/component-browser.component';
import { ComponentPreviewComponent } from './ComponentStudio/components/workspace/component-preview.component';
import { EditorTabsComponent } from './ComponentStudio/components/workspace/editor-tabs.component';
import { SpecEditorComponent } from './ComponentStudio/components/editors/spec-editor.component';
import { CodeEditorPanelComponent } from './ComponentStudio/components/editors/code-editor-panel.component';
import { RequirementsEditorComponent } from './ComponentStudio/components/editors/requirements-editor.component';
import { DataRequirementsEditorComponent } from './ComponentStudio/components/editors/data-requirements-editor.component';
import { AIAssistantPanelComponent } from './ComponentStudio/components/ai-assistant/ai-assistant-panel.component';
import { NewComponentDialogComponent } from './ComponentStudio/components/new-component-dialog/new-component-dialog.component';
import { SaveVersionDialogComponent } from './ComponentStudio/components/save-version-dialog/save-version-dialog.component';
import { FormOverrideDialogComponent } from './ComponentStudio/components/form-override-dialog.component';

// Form Builder (lives inside Component Studio as a conditional tab + right-panel).
import { FormBuilderTabComponent } from './ComponentStudio/components/form-builder/form-builder-tab.component';
import { FormBuilderCanvasComponent } from './ComponentStudio/components/form-builder/form-builder-canvas.component';
import { FormBuilderRightPanelComponent } from './ComponentStudio/components/form-builder/form-builder-right-panel.component';

// Form Builder Resource — standalone "Form Studio" application entry point
// reached from the top-left Application rail. Reuses the same canvas + right
// panel components used by the Component Studio tab.
import { FormBuilderResourceComponent } from './FormBuilder/form-builder-resource.component';

/**
 * ComponentStudioDashboardsModule — Component Studio feature area:
 * component browser, editors, preview, and AI assistant.
 */
@NgModule({
  declarations: [
    ComponentStudioDashboardComponent,
    ComponentStudioResourceComponent,
    TextImportDialogComponent,
    ArtifactSelectionDialogComponent,
    ArtifactLoadDialogComponent,
    ComponentBrowserComponent,
    ComponentPreviewComponent,
    EditorTabsComponent,
    SpecEditorComponent,
    CodeEditorPanelComponent,
    RequirementsEditorComponent,
    DataRequirementsEditorComponent,
    AIAssistantPanelComponent,
    NewComponentDialogComponent,
    SaveVersionDialogComponent,
    FormBuilderTabComponent,
    FormBuilderCanvasComponent,
    FormBuilderRightPanelComponent,
    FormBuilderResourceComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    ContainerDirectivesModule,
    CodeEditorModule,
    MJReactModule,
    SharedGenericModule,
    MarkdownModule,
    BaseFormsModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogTitlebarComponent,
    MJDialogActionsComponent,
    FormOverrideDialogComponent
  ],
  exports: [
    ComponentStudioDashboardComponent,
    ComponentStudioResourceComponent,
    FormBuilderResourceComponent
  ]
})
export class ComponentStudioDashboardsModule { }

// JS-level re-export so that public-api.ts line 187 (`export * from
// './component-studio-dashboards.module'`) exposes the dashboard component
// class through a path that includes ɵɵsetComponentScope.  Without this,
// the only export path is the ComponentStudio/index.ts barrel which
// imports the bare component file — creating a second ESBuild copy that
// lacks child-component scope metadata.
export { ComponentStudioDashboardComponent } from './ComponentStudio/component-studio-dashboard.component';
export { ComponentStudioResourceComponent, LoadComponentStudioResourceComponent } from './ComponentStudio/component-studio-resource.component';
export { FormBuilderResourceComponent, LoadFormBuilderResourceComponent } from './FormBuilder/form-builder-resource.component';
