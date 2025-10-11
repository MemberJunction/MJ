import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownModule } from 'ngx-markdown';

// Import MJ modules
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { MJReactModule } from '@memberjunction/ng-react';

// Import plugin components (note: base component is abstract and NOT declared)
import { JsonArtifactViewerComponent } from './components/plugins/json-artifact-viewer.component';
import { CodeArtifactViewerComponent } from './components/plugins/code-artifact-viewer.component';
import { MarkdownArtifactViewerComponent } from './components/plugins/markdown-artifact-viewer.component';
import { HtmlArtifactViewerComponent } from './components/plugins/html-artifact-viewer.component';
import { SvgArtifactViewerComponent } from './components/plugins/svg-artifact-viewer.component';
import { ComponentArtifactViewerComponent } from './components/plugins/component-artifact-viewer.component';

// Import dynamic viewer component
import { ArtifactViewerDynamicComponent } from './components/artifact-viewer-dynamic.component';

/**
 * Module for artifact viewer plugin system.
 * Provides components for viewing different types of artifacts (JSON, Code, Markdown, HTML, SVG, Components).
 *
 * Plugins are automatically registered via @RegisterClass decorator and can be instantiated
 * using MJGlobal.Instance.ClassFactory.CreateInstance('PluginClassName').
 */
@NgModule({
  declarations: [
    // Dynamic viewer
    ArtifactViewerDynamicComponent,

    // Plugin components
    JsonArtifactViewerComponent,
    CodeArtifactViewerComponent,
    MarkdownArtifactViewerComponent,
    HtmlArtifactViewerComponent,
    SvgArtifactViewerComponent,
    ComponentArtifactViewerComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MarkdownModule.forChild(),
    CodeEditorModule,
    MJReactModule
  ],
  exports: [
    // Export dynamic viewer (main entry point)
    ArtifactViewerDynamicComponent,

    // Export plugin components
    JsonArtifactViewerComponent,
    CodeArtifactViewerComponent,
    MarkdownArtifactViewerComponent,
    HtmlArtifactViewerComponent,
    SvgArtifactViewerComponent,
    ComponentArtifactViewerComponent
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
      ComponentArtifactViewerComponent
    ];
  }
}
