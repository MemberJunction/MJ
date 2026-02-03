/*
 * Public API Surface 
 */

export * from './lib/generic/form-toolbar';
export * from './lib/generic/resource-container-component';

export * from './lib/resource-wrappers/dashboard-resource.component'
export * from './lib/dashboard-preferences-dialog/dashboard-preferences-dialog.component'
export * from './lib/resource-wrappers/record-resource.component'
export * from './lib/resource-wrappers/resource-wrappers-loader'
export * from './lib/resource-wrappers/search-results-resource.component'
export * from './lib/resource-wrappers/view-resource.component'
export * from './lib/resource-wrappers/list-detail-resource.component'
export * from './lib/resource-wrappers/chat-conversations-resource.component'
export * from './lib/resource-wrappers/artifact-resource.component'

// Command Palette (only component and service, no module)
export * from './lib/command-palette/command-palette.component';
export * from './lib/command-palette/command-palette.service';

// New Shell Module (New Explorer UX)
export * from './lib/shell/shell.module'
export * from './lib/shell/shell.component'
export * from './lib/single-record/single-record.component'
export * from './lib/single-search-result/single-search-result.component'
export * from './lib/single-dashboard/single-dashboard.component'
export * from './lib/single-dashboard/Components/add-item/add-item.component'
export * from './lib/single-dashboard/Components/edit-dashboard/edit-dashboard.component'
export * from './lib/single-list-detail/single-list-detail.component'
export * from './lib/user-profile/user-profile.component'
export * from './lib/user-notifications/user-notifications.component';
export * from './lib/guards/auth-guard.service';
export * from './lib/guards/entities.guard';

export * from './lib/single-query/single-query.component'
export * from './lib/resource-wrappers/query-resource.component'

// Validation services
export * from './lib/services/system-validation.service'
export * from './lib/services/startup-validation.service'
export * from './lib/system-validation/system-validation-banner.component'

// User Menu Plugin System
export * from './lib/user-menu'

export * from './module';