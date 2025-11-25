/*
 * Public API Surface of dashboards
 */

import { LoadEntityAdminDashboard } from './EntityAdmin/entity-admin-dashboard.component';
import { LoadComponentStudioDashboard } from './ComponentStudio/component-studio-dashboard.component';
import { LoadSchedulingDashboard } from './Scheduling/scheduling-dashboard.component';
import { LoadTestingDashboard } from './Testing/testing-dashboard.component';
import {
  LoadActionsOverviewResource,
  LoadActionsMonitorResource,
  LoadActionsScheduleResource,
  LoadActionsCodeResource,
  LoadActionsEntitiesResource,
  LoadActionsSecurityResource
} from './Actions';
import {
  LoadTestingOverviewResource,
  LoadTestingExecutionResource,
  LoadTestingAnalyticsResource,
  LoadTestingVersionResource,
  LoadTestingFeedbackResource
} from './Testing/components';

// Base Dashboard
export * from './generic/base-dashboard';

// Dashboards
export * from './EntityAdmin/entity-admin-dashboard.component';
export * from './ComponentStudio';
export * from './Scheduling/scheduling-dashboard.component';
export * from './Testing/testing-dashboard.component';

// Export AI components as resources (BaseResourceComponent-based)
export {
  ExecutionMonitoringComponent,
  LoadAIMonitorResource,
  PromptManagementV2Component,
  LoadAIPromptsResource,
  AgentConfigurationComponent,
  LoadAIAgentsResource,
  ModelManagementV2Component,
  LoadAIModelsResource,
  SystemConfigurationComponent,
  LoadAIConfigResource,
  KPICardComponent,
  LiveExecutionWidgetComponent,
  TimeSeriesChartComponent,
  PerformanceHeatmapComponent
} from './AI/index';

// Export Actions components as resources (BaseResourceComponent-based)
export {
  ActionsOverviewComponent,
  LoadActionsOverviewResource,
  LoadActionsMonitorResource,
  ScheduledActionsComponent,
  LoadActionsScheduleResource,
  CodeManagementComponent,
  LoadActionsCodeResource,
  EntityIntegrationComponent,
  LoadActionsEntitiesResource,
  SecurityPermissionsComponent,
  LoadActionsSecurityResource
} from './Actions';

// Re-export Actions ExecutionMonitoringComponent with alias to avoid conflict with AI version
export { ExecutionMonitoringComponent as ActionsExecutionMonitoringComponent } from './Actions/components/execution-monitoring.component';

// Export Testing components as resources (BaseResourceComponent-based)
export {
  TestingOverviewResourceComponent,
  LoadTestingOverviewResource,
  TestingExecutionResourceComponent,
  LoadTestingExecutionResource,
  TestingAnalyticsResourceComponent,
  LoadTestingAnalyticsResource,
  TestingVersionResourceComponent,
  LoadTestingVersionResource,
  TestingFeedbackResourceComponent,
  LoadTestingFeedbackResource
} from './Testing/components';

// Module
export * from './module';

// Call tree shaking functions to prevent tree shaking
LoadEntityAdminDashboard();
LoadComponentStudioDashboard();
LoadSchedulingDashboard();
LoadTestingDashboard();

// Actions resource loaders
LoadActionsOverviewResource();
LoadActionsMonitorResource();
LoadActionsScheduleResource();
LoadActionsCodeResource();
LoadActionsEntitiesResource();
LoadActionsSecurityResource();

// Testing resource loaders
LoadTestingOverviewResource();
LoadTestingExecutionResource();
LoadTestingAnalyticsResource();
LoadTestingVersionResource();
LoadTestingFeedbackResource();