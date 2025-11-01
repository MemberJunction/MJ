/*
 * Public API Surface of @memberjunction/ng-event-abstract-submission
 */

// Module
export * from './module';

// Dashboards
export * from './dashboards/events-dashboard/events-dashboard.component';

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
export { LoadEventsDashboardComponent } from './dashboards/events-dashboard/events-dashboard.component';
export { LoadEventFormComponent } from './forms/event-form/event-form.component';
export { LoadSubmissionFormComponent } from './forms/submission-form/submission-form.component';
export { LoadSpeakerFormComponent } from './forms/speaker-form/speaker-form.component';
