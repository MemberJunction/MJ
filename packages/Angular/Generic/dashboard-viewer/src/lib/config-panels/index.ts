// Config Panels - Standalone form components without dialog chrome
// These can be embedded in the add-panel-dialog or wrapped in a dialog for editing

export * from './base-config-panel';
export * from './weburl-config-panel.component';
export * from './view-config-panel.component';
export * from './query-config-panel.component';
export * from './artifact-config-panel.component';

// Tree-shaking prevention functions
export function LoadWebURLConfigPanel() {}
export function LoadViewConfigPanel() {}
export function LoadQueryConfigPanel() {}
export function LoadArtifactConfigPanel() {}
