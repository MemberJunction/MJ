import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownModule } from '@memberjunction/ng-markdown';

// Import MJ modules
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { MJReactModule } from '@memberjunction/ng-react';
import { MJNotificationsModule } from '@memberjunction/ng-notifications';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { NgTreesModule } from '@memberjunction/ng-trees';

// Import plugin components (note: base component is abstract and NOT declared)
import { JsonArtifactViewerComponent } from './components/plugins/json-artifact-viewer.component';
import { CodeArtifactViewerComponent } from './components/plugins/code-artifact-viewer.component';
import { MarkdownArtifactViewerComponent } from './components/plugins/markdown-artifact-viewer.component';
import { HtmlArtifactViewerComponent } from './components/plugins/html-artifact-viewer.component';
import { SvgArtifactViewerComponent } from './components/plugins/svg-artifact-viewer.component';
import { ComponentArtifactViewerComponent } from './components/plugins/component-artifact-viewer.component';
import { DataArtifactViewerComponent } from './components/plugins/data-artifact-viewer.component';
import { SaveQueryPanelComponent } from './components/plugins/save-query-dialog.component';
import { DataRequirementsViewerComponent } from './components/plugins/data-requirements-viewer/data-requirements-viewer.component';

// Import artifact type plugin viewer component
import { ArtifactTypePluginViewerComponent } from './components/artifact-type-plugin-viewer.component';
import { ArtifactVersionHistoryComponent } from './components/artifact-version-history.component';
import { ArtifactViewerPanelComponent } from './components/artifact-viewer-panel.component';
import { ArtifactMessageCardComponent } from './components/artifact-message-card.component';

/**
 * Module for artifact viewer plugin system.
 * Provides components for viewing different types of artifacts (JSON, Code, Markdown, HTML, SVG, Components).
 *
 * Plugins are automatically registered via @RegisterClass decorator and can be instantiated
 * using MJGlobal.Instance.ClassFactory.CreateInstance('PluginClassName').
 */
@NgModule({
  declarations: [
    // Artifact type plugin viewer (loads appropriate plugin based on DriverClass)
    ArtifactTypePluginViewerComponent,

    // Artifact viewer UI components
    ArtifactViewerPanelComponent,
    ArtifactVersionHistoryComponent,
    ArtifactMessageCardComponent,

    // Plugin components
    JsonArtifactViewerComponent,
    CodeArtifactViewerComponent,
    MarkdownArtifactViewerComponent,
    HtmlArtifactViewerComponent,
    SvgArtifactViewerComponent,
    ComponentArtifactViewerComponent,
    DataArtifactViewerComponent,
    SaveQueryPanelComponent,

    // Custom tab components (used by plugins via dynamic component tabs)
    DataRequirementsViewerComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MarkdownModule,
    CodeEditorModule,
    MJReactModule,
    MJNotificationsModule,
    QueryViewerModule,
    SharedGenericModule,
    NgTreesModule
  ],
  exports: [
    // Export artifact type plugin viewer
    ArtifactTypePluginViewerComponent,

    // Export artifact viewer UI components
    ArtifactViewerPanelComponent,
    ArtifactVersionHistoryComponent,
    ArtifactMessageCardComponent,

    // Export plugin components
    JsonArtifactViewerComponent,
    CodeArtifactViewerComponent,
    MarkdownArtifactViewerComponent,
    HtmlArtifactViewerComponent,
    SvgArtifactViewerComponent,
    ComponentArtifactViewerComponent,
    DataArtifactViewerComponent
  ],
  providers: [
    // Plugins are registered via @RegisterClass decorator on component classes, no providers needed
  ]
})
export class ArtifactsModule {
  constructor() {
    // Ensure plugin components are registered on module load by referencing their classes
    // The @RegisterClass decorator on each component handles the actual registration with MJGlobal
    [
      JsonArtifactViewerComponent,
      CodeArtifactViewerComponent,
      MarkdownArtifactViewerComponent,
      HtmlArtifactViewerComponent,
      SvgArtifactViewerComponent,
      ComponentArtifactViewerComponent,
      DataArtifactViewerComponent
    ];
  }
}
