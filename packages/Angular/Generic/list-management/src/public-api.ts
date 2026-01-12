/*
 * Public API Surface for @memberjunction/ng-list-management
 */

// Module
export * from './lib/module';

// Components
export * from './lib/components/list-management-dialog/list-management-dialog.component';

// Services
export * from './lib/services/list-management.service';

// Models
export * from './lib/models/list-management.models';

/**
 * Tree-shaking prevention function.
 * Call this from the consuming module to ensure the components are included.
 */
export function LoadListManagement(): void {
  // This function exists solely to prevent tree-shaking
  // of the list management components
}
