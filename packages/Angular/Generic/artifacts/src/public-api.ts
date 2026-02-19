/*
 * Public API Surface of @memberjunction/ng-artifacts
 */

// Module
export * from './lib/artifacts.module';

// Services
export * from './lib/services/artifact-icon.service';

// Interfaces
export * from './lib/interfaces/artifact-viewer-plugin.interface';

// Base component
export * from './lib/components/base-artifact-viewer.component';

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
