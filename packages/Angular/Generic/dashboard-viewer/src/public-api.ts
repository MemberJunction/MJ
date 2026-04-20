/*
 * Public API Surface of @memberjunction/ng-dashboard-viewer
 */

// Module
export * from './lib/dashboard-viewer.module';

// Main Component
export * from './lib/dashboard-viewer/dashboard-viewer.component';

// Dashboard Browser Component
export * from './lib/dashboard-browser/dashboard-browser.component';

// Breadcrumb Component
export * from './lib/breadcrumb/dashboard-breadcrumb.component';

// Generic Dialogs
export * from './lib/dialogs/add-panel-dialog/add-panel-dialog.component';
export * from './lib/dialogs/edit-part-dialog/edit-part-dialog.component';
export * from './lib/config-dialogs/confirm-dialog.component';

// Base Classes for Extensibility
export * from './lib/config-panels/base-config-panel';
export * from './lib/parts/base-dashboard-part';

// Config Panels (pluggable form components loaded via ClassFactory)
export * from './lib/config-panels/weburl-config-panel.component';
export * from './lib/config-panels/view-config-panel.component';
export * from './lib/config-panels/query-config-panel.component';
export * from './lib/config-panels/artifact-config-panel.component';

// Runtime Part Components (pluggable renderers loaded via ClassFactory)
export * from './lib/parts/weburl-part.component';
export * from './lib/parts/view-part.component';
export * from './lib/parts/query-part.component';
export * from './lib/parts/artifact-part.component';

// Types and Models
export * from './lib/models/dashboard-types';

// Services
export * from './lib/services/golden-layout-wrapper.service';
