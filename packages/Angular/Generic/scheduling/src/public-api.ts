/**
 * Public API Surface for @memberjunction/ng-scheduling
 *
 * Reusable Angular components for viewing and editing MemberJunction Scheduled Jobs.
 * - Plain editor component for embedding in any layout
 * - Slide-in panel for side-panel editing
 * - Dialog component for modal editing
 * - Summary component for compact status display
 * - Service for data loading and caching
 */

// Module
export * from './lib/scheduling.module';

// Panel components (embeddable)
export * from './lib/panels/scheduled-job-editor/scheduled-job-editor.component';
export * from './lib/panels/scheduled-job-summary/scheduled-job-summary.component';

// Slide-in panel
export * from './lib/slide-panel/scheduled-job-slide-panel.component';

// Dialog
export * from './lib/dialogs/scheduled-job-dialog.component';

// Services
export * from './lib/services/scheduled-job.service';
