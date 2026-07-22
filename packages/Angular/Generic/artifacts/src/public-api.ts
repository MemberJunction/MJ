/*
 * Public API Surface of @memberjunction/ng-artifacts
 */

// Module
export * from './lib/artifacts.module';

// Services
export * from './lib/services/artifact-icon.service';
export * from './lib/services/artifact-file.service';
export * from './lib/services/analyze-artifact.service';
export * from './lib/services/interactive-form-apply.service';
export * from './lib/services/artifact-preview-resolver.service';

// Interfaces
export * from './lib/interfaces/artifact-viewer-plugin.interface';

// Base component
export * from './lib/components/base-artifact-viewer.component';

// Inline preview base + components
export * from './lib/components/previews/base-artifact-preview.component';
export * from './lib/components/previews/image-artifact-preview.component';
export * from './lib/components/previews/video-artifact-preview.component';
export * from './lib/components/previews/audio-artifact-preview.component';

// Snapshot helpers (pure functions for creating DataSnapshots from artifact content)
export * from './lib/snapshot-helpers';

// Artifact type plugin viewer (loads appropriate plugin based on DriverClass)
export * from './lib/components/artifact-type-plugin-viewer.component';

// Artifact viewer UI components
export * from './lib/components/artifact-viewer-panel.component';
export * from './lib/components/artifact-version-history.component';
export * from './lib/components/artifact-message-card.component';

// Plugin components
export * from './lib/components/plugins/json-artifact-viewer.component';
export * from './lib/components/plugins/code-artifact-viewer.component';
export * from './lib/components/plugins/markdown-artifact-viewer.component';
export * from './lib/components/plugins/html-artifact-viewer.component';
export * from './lib/components/plugins/svg-artifact-viewer.component';
export * from './lib/components/plugins/component-artifact-viewer.component';
export * from './lib/components/plugins/data-artifact-viewer.component';
export * from './lib/components/plugins/ml-experiment-results-viewer.component';
export * from './lib/components/plugins/component-feedback-panel/component-feedback-panel.component';

// File viewer toolbar and plugins
export * from './lib/components/file-artifact-toolbar.component';
export * from './lib/components/plugins/pdf-artifact-viewer.component';
export * from './lib/components/plugins/xlsx-artifact-viewer.component';
export * from './lib/components/plugins/docx-artifact-viewer.component';
export * from './lib/components/plugins/image-artifact-viewer.component';
export * from './lib/components/plugins/video-artifact-viewer.component';
export * from './lib/components/plugins/audio-artifact-viewer.component';
