// Base class and types
export * from './base-config-dialog';

// Config dialogs
export * from './weburl-config-dialog.component';
export * from './view-config-dialog.component';
export * from './query-config-dialog.component';
export * from './artifact-config-dialog.component';

// Utility dialogs
export * from './confirm-dialog.component';

// Load function to prevent tree-shaking
export function LoadConfigDialogs(): void {
    // This function ensures all config dialogs are included in the bundle
    // and their @RegisterClass decorators are executed
}
