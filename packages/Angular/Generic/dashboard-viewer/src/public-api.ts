/*
 * Public API Surface of @memberjunction/ng-dashboard-viewer
 */

// Module
export * from './lib/dashboard-viewer.module';

// Main Component
export * from './lib/dashboard-viewer/dashboard-viewer.component';

// Dialogs
export * from './lib/dialogs/add-panel-dialog/add-panel-dialog.component';

// Config Dialogs
export * from './lib/config-dialogs/base-config-dialog';
export * from './lib/config-dialogs/confirm-dialog.component';
export * from './lib/config-dialogs/weburl-config-dialog.component';
export * from './lib/config-dialogs/view-config-dialog.component';
export * from './lib/config-dialogs/query-config-dialog.component';
export * from './lib/config-dialogs/artifact-config-dialog.component';

// Types and Models
export * from './lib/models/dashboard-types';

// Services
export * from './lib/services/golden-layout-wrapper.service';

// Tree-shaking prevention - call load functions for module
import { LoadDashboardViewerModule } from './lib/dashboard-viewer.module';
import { LoadConfigDialogs } from './lib/config-dialogs';
LoadDashboardViewerModule();
LoadConfigDialogs();
