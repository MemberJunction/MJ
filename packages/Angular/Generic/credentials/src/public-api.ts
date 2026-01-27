/**
 * Public API Surface for @memberjunction/ng-credentials
 *
 * This package provides reusable Angular components for credential management:
 * - Panel components for embedding in existing UIs
 * - Dialog components for modal credential editing
 * - Service for programmatic dialog access
 */

// Module
export * from './lib/credentials.module';

// Panel components
export * from './lib/panels/credential-edit-panel/credential-edit-panel.component';
export * from './lib/panels/credential-type-edit-panel/credential-type-edit-panel.component';
export * from './lib/panels/credential-category-edit-panel/credential-category-edit-panel.component';

// Dialog components
export * from './lib/dialogs/credential-dialog.component';

// Services
export * from './lib/services/credential-dialog.service';
