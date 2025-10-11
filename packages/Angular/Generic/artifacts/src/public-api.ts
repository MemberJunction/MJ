/*
 * Public API Surface of @memberjunction/ng-artifacts
 */

// Module
export * from './lib/artifacts.module';

// Interfaces
export * from './lib/interfaces/artifact-viewer-plugin.interface';

// Base component
export * from './lib/components/base-artifact-viewer.component';

// Dynamic viewer component (main entry point)
export * from './lib/components/artifact-viewer-dynamic.component';

// Plugin components
export * from './lib/components/plugins/json-artifact-viewer.component';
export * from './lib/components/plugins/code-artifact-viewer.component';
export * from './lib/components/plugins/markdown-artifact-viewer.component';
export * from './lib/components/plugins/html-artifact-viewer.component';
export * from './lib/components/plugins/svg-artifact-viewer.component';
export * from './lib/components/plugins/component-artifact-viewer.component';
