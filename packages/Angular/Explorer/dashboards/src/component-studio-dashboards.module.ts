import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { TabStripModule, SplitterModule } from '@progress/kendo-angular-layout';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { MJReactModule } from '@memberjunction/ng-react';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MarkdownModule } from '@memberjunction/ng-markdown';

// Component Studio Components
import { ComponentStudioDashboardComponent } from './ComponentStudio/component-studio-dashboard.component';
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

/**
 * ComponentStudioDashboardsModule — Component Studio feature area:
 * component browser, editors, preview, and AI assistant.
 */
@NgModule({
  declarations: [
    ComponentStudioDashboardComponent,
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
    SaveVersionDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonsModule,
    GridModule,
    InputsModule,
    DialogsModule,
    WindowModule,
    TabStripModule,
    SplitterModule,
    ContainerDirectivesModule,
    CodeEditorModule,
    MJReactModule,
    SharedGenericModule,
    MarkdownModule
  ],
  exports: [
    ComponentStudioDashboardComponent
  ]
})
export class ComponentStudioDashboardsModule { }
