/*
 * Public API Surface of @memberjunction/ng-event-abstract-submission
 */

// Forms
export * from './forms/event-form/event-form.component';
export * from './forms/submission-form/submission-form.component';
export * from './forms/speaker-form/speaker-form.component';

// Dashboards
export * from './dashboards/event-management-dashboard/event-management-dashboard.component';
export * from './dashboards/abstract-submission-dashboard/abstract-submission-dashboard.component';

// Workflow Components
export * from './workflows/submission-pipeline/submission-pipeline.component';
export * from './workflows/review-process/review-process.component';

// Services
export * from './services/event.service';
export * from './services/submission.service';
export * from './services/speaker.service';

// Module
export * from './module';

// Tree shaking prevention functions
export { LoadEventManagementDashboard } from './dashboards/event-management-dashboard/event-management-dashboard.component';
export { LoadAbstractSubmissionDashboard } from './dashboards/abstract-submission-dashboard/abstract-submission-dashboard.component';
