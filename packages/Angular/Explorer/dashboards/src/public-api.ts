/*
 * Public API Surface of dashboards
 */

import { LoadEntityAdminDashboard } from './EntityAdmin/entity-admin-dashboard.component';
import { LoadComponentStudioDashboard } from './ComponentStudio/component-studio-dashboard.component';
import { LoadSchedulingDashboard } from './Scheduling/scheduling-dashboard.component';
import { LoadTestingDashboard } from './Testing/testing-dashboard.component';
import { LoadDataExplorerDashboard } from './DataExplorer/data-explorer-dashboard.component';
import { LoadCommunicationDashboard } from './Communication/communication-dashboard.component';
import { LoadCredentialsDashboard } from './Credentials/credentials-dashboard.component';
import { LoadCredentialsOverviewResource } from './Credentials/components/credentials-overview-resource.component';
import { LoadCredentialsListResource } from './Credentials/components/credentials-list-resource.component';
import { LoadCredentialsTypesResource } from './Credentials/components/credentials-types-resource.component';
import { LoadCredentialsCategoriesResource } from './Credentials/components/credentials-categories-resource.component';
import { LoadCredentialsAuditResource } from './Credentials/components/credentials-audit-resource.component';
// System Diagnostics
import { LoadSystemDiagnosticsResource } from './SystemDiagnostics/system-diagnostics.component';
// Lists Dashboard
import { LoadListsResources } from './Lists';

import {
  LoadActionsOverviewResource,
  LoadActionsMonitorResource,
  LoadActionsScheduleResource,
  LoadActionsCodeResource,
  LoadActionsEntitiesResource,
  LoadActionsSecurityResource
} from './Actions';
import { LoadCommunicationMonitorResource } from './Communication/communication-monitor-resource.component';
import { LoadCommunicationLogsResource } from './Communication/communication-logs-resource.component';
import { LoadCommunicationProvidersResource } from './Communication/communication-providers-resource.component';
import { LoadCommunicationRunsResource } from './Communication/communication-runs-resource.component';

import {
  LoadTestingOverviewResource,
  LoadTestingExecutionResource,
  LoadTestingAnalyticsResource,
  LoadTestingVersionResource,
  LoadTestingFeedbackResource
} from './Testing/components';
import {
  LoadSchedulingMonitorResource,
  LoadSchedulingJobsResource,
  LoadSchedulingHistoryResource,
  LoadSchedulingTypesResource,
  LoadSchedulingHealthResource
} from './Scheduling/components';

// Dashboards
export * from './EntityAdmin/entity-admin-dashboard.component';
export * from './ComponentStudio';
export * from './Scheduling/scheduling-dashboard.component';
export * from './Testing/testing-dashboard.component';
export * from './DataExplorer';
export * from './Communication/communication-dashboard.component';
export * from './Credentials';
export * from './SystemDiagnostics';
export * from './Lists';

// Export AI components as resources (BaseResourceComponent-based)
export {
  ExecutionMonitoringComponent,
  LoadAIMonitorResource,
  PromptManagementComponent,
  LoadAIPromptsResource,
  AgentConfigurationComponent,
  LoadAIAgentsResource,
  ModelManagementComponent,
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

// Export Scheduling components as resources (BaseResourceComponent-based)
export {
  SchedulingMonitorResourceComponent,
  LoadSchedulingMonitorResource,
  SchedulingJobsResourceComponent,
  LoadSchedulingJobsResource,
  SchedulingHistoryResourceComponent,
  LoadSchedulingHistoryResource,
  SchedulingTypesResourceComponent,
  LoadSchedulingTypesResource,
  SchedulingHealthResourceComponent,
  LoadSchedulingHealthResource
} from './Scheduling/components';

// Export Communication components as resources
export {
  CommunicationMonitorResourceComponent,
  LoadCommunicationMonitorResource
} from './Communication/communication-monitor-resource.component';
export {
  CommunicationLogsResourceComponent,
  LoadCommunicationLogsResource
} from './Communication/communication-logs-resource.component';
export {
  CommunicationProvidersResourceComponent,
  LoadCommunicationProvidersResource
} from './Communication/communication-providers-resource.component';
export {
  CommunicationRunsResourceComponent,
  LoadCommunicationRunsResource
} from './Communication/communication-runs-resource.component';


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

// Scheduling resource loaders
LoadSchedulingMonitorResource();
LoadSchedulingJobsResource();
LoadSchedulingHistoryResource();
LoadSchedulingTypesResource();
LoadSchedulingHealthResource();

// Testing resource loaders
LoadTestingOverviewResource();
LoadTestingExecutionResource();
LoadTestingAnalyticsResource();
LoadTestingVersionResource();
LoadTestingFeedbackResource();

// Data Explorer Dashboard loader
LoadDataExplorerDashboard();

// Communication Dashboard loader
LoadCommunicationDashboard();

// Communication resource loaders
LoadCommunicationMonitorResource();
LoadCommunicationLogsResource();
LoadCommunicationProvidersResource();
LoadCommunicationRunsResource();

// Credentials Dashboard loader
LoadCredentialsDashboard();

// Credentials resource loaders
LoadCredentialsOverviewResource();
LoadCredentialsListResource();
LoadCredentialsTypesResource();
LoadCredentialsCategoriesResource();
LoadCredentialsAuditResource();

// System Diagnostics resource loader
LoadSystemDiagnosticsResource();

// Lists Dashboard resource loaders
LoadListsResources();