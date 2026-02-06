/*
 * Public API Surface of dashboards
 */

import { LoadEntityAdminDashboard } from './EntityAdmin/entity-admin-dashboard.component';
import { LoadComponentStudioDashboard } from './ComponentStudio/component-studio-dashboard.component';
import { LoadSchedulingDashboard } from './Scheduling/scheduling-dashboard.component';
import { LoadTestingDashboard } from './Testing/testing-dashboard.component';
import { LoadDataExplorerDashboard } from './DataExplorer/data-explorer-dashboard.component';
import { LoadDataExplorerResource } from './DataExplorer/data-explorer-resource.component';
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
// Query Browser
import { LoadQueryBrowserResource } from './QueryBrowser/query-browser-resource.component';
// Dashboard Browser
import { LoadDashboardBrowserResource } from './DashboardBrowser/dashboard-browser-resource.component';
// Home Application and Dashboard
import { LoadHomeApplication } from './Home/home-application';
import { LoadHomeDashboard } from './Home/home-dashboard.component';
// API Keys
import { LoadAPIKeysResource } from './APIKeys/api-keys-resource.component';
// MCP
import { LoadMCPModule } from './MCP';
// Version History
import {
  LoadVersionHistoryLabelsResource,
  LoadVersionHistoryDiffResource,
  LoadVersionHistoryRestoreResource,
  LoadVersionHistoryGraphResource
} from './VersionHistory';

import {
  LoadActionsOverviewResource,
  LoadActionsMonitorResource,
  LoadActionsScheduleResource,
  LoadActionsCodeResource,
  LoadActionsEntitiesResource,
  LoadActionsSecurityResource,
  LoadActionExplorerResource,
  LoadActionExplorerComponents
} from './Actions';
import { LoadCommunicationMonitorResource } from './Communication/communication-monitor-resource.component';
import { LoadCommunicationLogsResource } from './Communication/communication-logs-resource.component';
import { LoadCommunicationProvidersResource } from './Communication/communication-providers-resource.component';
import { LoadCommunicationRunsResource } from './Communication/communication-runs-resource.component';
import { LoadCommunicationTemplatesResource } from './Communication/communication-templates-resource.component';


import {
  LoadSchedulingDashboardResource,
  LoadSchedulingJobsResource,
  LoadSchedulingActivityResource
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
  LoadActionsSecurityResource,
  // Action Explorer components
  ActionExplorerComponent,
  ActionTreePanelComponent,
  ActionToolbarComponent,
  ActionBreadcrumbComponent,
  ActionCardComponent,
  ActionListItemComponent,
  NewCategoryPanelComponent,
  NewActionPanelComponent,
  LoadActionExplorerResource,
  LoadActionExplorerComponents,
  // State service
  ActionExplorerStateService
} from './Actions';

// Re-export Actions ExecutionMonitoringComponent with alias to avoid conflict with AI version
export { ExecutionMonitoringComponent as ActionsExecutionMonitoringComponent } from './Actions/components/execution-monitoring.component';

// Export Scheduling components as resources (BaseResourceComponent-based)
export {
  SchedulingOverviewResourceComponent,
  LoadSchedulingDashboardResource,
  SchedulingJobsResourceComponent,
  LoadSchedulingJobsResource,
  SchedulingActivityResourceComponent,
  LoadSchedulingActivityResource
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
export {
  CommunicationTemplatesResourceComponent,
  LoadCommunicationTemplatesResource
} from './Communication/communication-templates-resource.component';


// Export Testing components as resources (BaseResourceComponent-based)
export {
  TestingDashboardTabResourceComponent,
  TestingRunsResourceComponent,
  TestingAnalyticsResourceComponent,
  TestingReviewResourceComponent,
  TestingExplorerResourceComponent
} from './Testing/components';

// Query Browser
export {
  QueryBrowserResourceComponent,
  LoadQueryBrowserResource
} from './QueryBrowser/query-browser-resource.component';

// Dashboard Browser
export {
  DashboardBrowserResourceComponent,
  LoadDashboardBrowserResource
} from './DashboardBrowser/dashboard-browser-resource.component';
export {
  DashboardShareDialogComponent,
  UserSharePermission,
  ShareDialogResult
} from './DashboardBrowser/dashboard-share-dialog.component';

// Home Application and Dashboard
export { HomeApplication, LoadHomeApplication } from './Home/home-application';
export { HomeDashboardComponent, LoadHomeDashboard } from './Home/home-dashboard.component';

// API Keys
export { APIKeysResourceComponent, LoadAPIKeysResource } from './APIKeys/api-keys-resource.component';
export { APIKeyCreateDialogComponent, LoadAPIKeyCreateDialog, APIKeyCreateResult } from './APIKeys/api-key-create-dialog.component';
export { APIKeyEditPanelComponent, LoadAPIKeyEditPanel } from './APIKeys/api-key-edit-panel.component';
export { APIKeyListComponent, LoadAPIKeyList, APIKeyFilter } from './APIKeys/api-key-list.component';
export { APIApplicationsPanelComponent, LoadAPIApplicationsPanel } from './APIKeys/api-applications-panel.component';
export { APIScopesPanelComponent, LoadAPIScopesPanel } from './APIKeys/api-scopes-panel.component';
export { APIUsagePanelComponent, LoadAPIUsagePanel } from './APIKeys/api-usage-panel.component';

// MCP (Model Context Protocol)
export * from './MCP';

// Version History Dashboard Components
export {
  VersionHistoryLabelsResourceComponent,
  LoadVersionHistoryLabelsResource,
  VersionHistoryDiffResourceComponent,
  LoadVersionHistoryDiffResource,
  VersionHistoryRestoreResourceComponent,
  LoadVersionHistoryRestoreResource,
  VersionHistoryGraphResourceComponent,
  LoadVersionHistoryGraphResource
} from './VersionHistory';

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
// Action Explorer loaders
LoadActionExplorerResource();
LoadActionExplorerComponents();

// Scheduling resource loaders
LoadSchedulingDashboardResource();
LoadSchedulingJobsResource();
LoadSchedulingActivityResource();

// Data Explorer Dashboard and Resource loaders
LoadDataExplorerDashboard();
LoadDataExplorerResource();

// Communication Dashboard loader
LoadCommunicationDashboard();

// Communication resource loaders
LoadCommunicationMonitorResource();
LoadCommunicationLogsResource();
LoadCommunicationProvidersResource();
LoadCommunicationRunsResource();
LoadCommunicationTemplatesResource();

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

// Query Browser resource loader
LoadQueryBrowserResource();

// Dashboard Browser resource loader
LoadDashboardBrowserResource();

// Home Application and Dashboard loader
LoadHomeApplication();
LoadHomeDashboard();

// API Keys resource loaders
LoadAPIKeysResource();
import { LoadAPIKeyCreateDialog } from './APIKeys/api-key-create-dialog.component';
import { LoadAPIKeyEditPanel } from './APIKeys/api-key-edit-panel.component';
import { LoadAPIKeyList } from './APIKeys/api-key-list.component';
import { LoadAPIApplicationsPanel } from './APIKeys/api-applications-panel.component';
import { LoadAPIScopesPanel } from './APIKeys/api-scopes-panel.component';
import { LoadAPIUsagePanel } from './APIKeys/api-usage-panel.component';
LoadAPIKeyCreateDialog();
LoadAPIKeyEditPanel();
LoadAPIKeyList();
LoadAPIApplicationsPanel();
LoadAPIScopesPanel();
LoadAPIUsagePanel();

// MCP module loader
LoadMCPModule();

// Version History resource loaders
LoadVersionHistoryLabelsResource();
LoadVersionHistoryDiffResource();
LoadVersionHistoryRestoreResource();
LoadVersionHistoryGraphResource();