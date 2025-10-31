/*
 * Public API Surface of @memberjunction/ng-event-abstract-submission
 */

// Module
export * from './module';

// Dashboards - temporarily disabled due to Kendo dependencies
// export * from './dashboards/event-management/event-management-dashboard.component';
// export * from './dashboards/abstract-submission/abstract-submission-dashboard.component';

// Forms
export * from './forms/event-form/event-form.component';
export * from './forms/submission-form/submission-form.component';
export * from './forms/speaker-form/speaker-form.component';

// Shared Components - temporarily disabled due to Kendo dependencies
// export * from './dashboards/components/kpi-card.component';
// export * from './dashboards/components/status-badge.component';
// export * from './dashboards/components/submission-list.component';
// export * from './dashboards/components/speaker-list.component';

// Services
export * from './services/event.service';
export * from './services/submission.service';
export * from './services/speaker.service';

// Tree shaking prevention functions
// export { LoadEventManagementDashboardComponent } from './dashboards/event-management/event-management-dashboard.component';
// export { LoadAbstractSubmissionDashboardComponent } from './dashboards/abstract-submission/abstract-submission-dashboard.component';
export { LoadEventFormComponent } from './forms/event-form/event-form.component';
export { LoadSubmissionFormComponent } from './forms/submission-form/submission-form.component';
export { LoadSpeakerFormComponent } from './forms/speaker-form/speaker-form.component';

// Shorter aliases for tree shaking functions
// export { LoadEventManagementDashboardComponent as LoadEventManagementDashboard } from './dashboards/event-management/event-management-dashboard.component';
// export { LoadAbstractSubmissionDashboardComponent as LoadAbstractSubmissionDashboard } from './dashboards/abstract-submission/abstract-submission-dashboard.component';
