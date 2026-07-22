import { NgModule, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { AgGridModule } from 'ag-grid-angular';

// Import MJ modules
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { MJReactModule, AngularAdapterService } from '@memberjunction/ng-react';
import { MJNotificationsModule } from '@memberjunction/ng-notifications';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { NgTreesModule } from '@memberjunction/ng-trees';
// BaseFormsModule supplies `<mj-interactive-form>` for the form-aware
// component-artifact viewer branch (componentRole === 'form').
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
// Generic media player — embedded by the audio/video artifact viewer plugins (standalone component).
import { MJMediaPlayerComponent } from '@memberjunction/ng-media-player';
import { MJEmptyStateComponent, MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

// Import plugin components (note: base component is abstract and NOT declared)
import { JsonArtifactViewerComponent } from './components/plugins/json-artifact-viewer.component';
import { CodeArtifactViewerComponent } from './components/plugins/code-artifact-viewer.component';
import { MarkdownArtifactViewerComponent } from './components/plugins/markdown-artifact-viewer.component';
import { HtmlArtifactViewerComponent } from './components/plugins/html-artifact-viewer.component';
import { SvgArtifactViewerComponent } from './components/plugins/svg-artifact-viewer.component';
import { ComponentArtifactViewerComponent } from './components/plugins/component-artifact-viewer.component';
import { DataArtifactViewerComponent } from './components/plugins/data-artifact-viewer.component';
import { MLExperimentResultsViewerComponent } from './components/plugins/ml-experiment-results-viewer.component';
import { SaveQueryPanelComponent } from './components/plugins/save-query-dialog.component';
import { DataRequirementsViewerComponent } from './components/plugins/data-requirements-viewer/data-requirements-viewer.component';
import { ComponentFeedbackPanelComponent } from './components/plugins/component-feedback-panel/component-feedback-panel.component';

// File viewer plugins
import { FileArtifactToolbarComponent } from './components/file-artifact-toolbar.component';
import { PdfArtifactViewerComponent } from './components/plugins/pdf-artifact-viewer.component';
import { XlsxArtifactViewerComponent } from './components/plugins/xlsx-artifact-viewer.component';
import { DocxArtifactViewerComponent } from './components/plugins/docx-artifact-viewer.component';
import { ImageArtifactViewerComponent } from './components/plugins/image-artifact-viewer.component';
import { VideoArtifactViewerComponent } from './components/plugins/video-artifact-viewer.component';
import { AudioArtifactViewerComponent } from './components/plugins/audio-artifact-viewer.component';

// Inline preview components (lightweight, rendered inside conversation message cards)
import { ImageArtifactPreviewComponent } from './components/previews/image-artifact-preview.component';
import { VideoArtifactPreviewComponent } from './components/previews/video-artifact-preview.component';
import { AudioArtifactPreviewComponent } from './components/previews/audio-artifact-preview.component';
import { MJGlobal } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from './components/base-artifact-viewer.component';
import { IArtifactViewerPluginPreviewStatics } from './interfaces/artifact-viewer-plugin.interface';

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
    MLExperimentResultsViewerComponent,
    SaveQueryPanelComponent,

    // Custom tab components (used by plugins via dynamic component tabs)
    DataRequirementsViewerComponent,

    // File viewer toolbar and plugins
    FileArtifactToolbarComponent,
    PdfArtifactViewerComponent,
    XlsxArtifactViewerComponent,
    DocxArtifactViewerComponent,
    ImageArtifactViewerComponent,
    VideoArtifactViewerComponent,
    AudioArtifactViewerComponent,

    // Inline preview components
    ImageArtifactPreviewComponent,
    VideoArtifactPreviewComponent,
    AudioArtifactPreviewComponent,
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
    NgTreesModule,
    BaseFormsModule,
    ComponentFeedbackPanelComponent,
    MJMediaPlayerComponent,
    AgGridModule,
    MJEmptyStateComponent,
    MJAlertComponent,
    MJButtonDirective,
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
    DataArtifactViewerComponent,
    MLExperimentResultsViewerComponent,

    // File viewer toolbar and plugins
    FileArtifactToolbarComponent,
    PdfArtifactViewerComponent,
    XlsxArtifactViewerComponent,
    DocxArtifactViewerComponent,
    ImageArtifactViewerComponent,
    VideoArtifactViewerComponent,
    AudioArtifactViewerComponent,

    // Inline preview components
    ImageArtifactPreviewComponent,
    VideoArtifactPreviewComponent,
    AudioArtifactPreviewComponent,
  ],
  providers: [
    // Plugins are registered via @RegisterClass decorator on component classes, no providers needed
  ]
})
export class ArtifactsModule {
  constructor(private adapter: AngularAdapterService) {
    // Ensure plugin components are registered on module load by referencing their classes
    // The @RegisterClass decorator on each component handles the actual registration with MJGlobal
    [
      JsonArtifactViewerComponent,
      CodeArtifactViewerComponent,
      MarkdownArtifactViewerComponent,
      HtmlArtifactViewerComponent,
      SvgArtifactViewerComponent,
      ComponentArtifactViewerComponent,
      DataArtifactViewerComponent,
      MLExperimentResultsViewerComponent,
      PdfArtifactViewerComponent,
      XlsxArtifactViewerComponent,
      DocxArtifactViewerComponent,
      ImageArtifactViewerComponent,
      VideoArtifactViewerComponent,
      AudioArtifactViewerComponent,
      // Preview components are referenced via plugins' previewComponentType — list them here too
      // so the bundler can't tree-shake the dynamically-rendered preview classes.
      ImageArtifactPreviewComponent,
      VideoArtifactPreviewComponent,
      AudioArtifactPreviewComponent,
    ];

    // Registration-time guard: every registered artifact-viewer plugin must expose at least one of
    // componentType / previewComponentType. `componentType` is required by the interface (so this is
    // trivially satisfied today); the guard protects against future loosening of that invariant.
    ArtifactsModule.warnOnPluginsWithoutRenderTarget();

    // PERF: Eagerly start downloading React, ReactDOM, and Babel from CDN in the background.
    // By the time a user opens an interactive component artifact, the scripts will already
    // be cached. The adapter.preload() is non-blocking and deduplicates with initialize().
    this.adapter.preload();
  }

  /**
   * Logs a warning for any registered artifact-viewer plugin that has NO render target at all —
   * i.e. neither an implicit full viewer (the registered SubClass itself, which is the
   * `componentType`) nor an explicit `previewComponentType`. Today every registration is an
   * Angular component class, so the SubClass is always present and this never fires; the guard
   * exists to catch regressions if the render-target invariant is ever loosened.
   */
  private static warnOnPluginsWithoutRenderTarget(): void {
    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseArtifactViewerPluginComponent);
    for (const reg of registrations) {
      const subClass = reg.SubClass as
        | (Type<BaseArtifactViewerPluginComponent> & IArtifactViewerPluginPreviewStatics)
        | undefined;
      const hasFullViewer = !!subClass; // the registered class IS the componentType
      // Read the STATIC preview contract off the constructor — never instantiate (these are Angular
      // components with DI constructors; a bare `new` outside an injection context throws).
      const hasPreview = !!subClass?.PreviewComponentType;
      if (!hasFullViewer && !hasPreview) {
        console.warn(
          `ArtifactsModule: viewer plugin "${reg.Key}" has neither a componentType nor a previewComponentType — it can render nothing.`,
        );
      }
    }
  }
}
