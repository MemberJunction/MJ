/*
 * Public API Surface of dashboards
 */

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
  PromptManagementComponent,
  AgentConfigurationComponent,
  ModelManagementComponent,
  SystemConfigurationComponent,
  KPICardComponent,
  LiveExecutionWidgetComponent,
  TimeSeriesChartComponent,
  PerformanceHeatmapComponent
} from './AI/index';

// Export Actions components as resources (BaseResourceComponent-based)
export {
  ActionsOverviewComponent,
  ScheduledActionsComponent,
  CodeManagementComponent,
  EntityIntegrationComponent,
  SecurityPermissionsComponent,
  // Action Explorer components
  ActionExplorerComponent,
  ActionTreePanelComponent,
  ActionToolbarComponent,
  ActionBreadcrumbComponent,
  ActionCardComponent,
  ActionListItemComponent,
  NewCategoryPanelComponent,
  NewActionPanelComponent,
  // State service
  ActionExplorerStateService
} from './Actions';

// Re-export Actions ExecutionMonitoringComponent with alias to avoid conflict with AI version
export { ExecutionMonitoringComponent as ActionsExecutionMonitoringComponent } from './Actions/components/execution-monitoring.component';

// Export Scheduling components as resources (BaseResourceComponent-based)
export {
  SchedulingOverviewResourceComponent,
  SchedulingJobsResourceComponent,
  SchedulingActivityResourceComponent
} from './Scheduling/components';

// Export Communication components as resources
export {
  CommunicationMonitorResourceComponent
} from './Communication/communication-monitor-resource.component';
export {
  CommunicationLogsResourceComponent
} from './Communication/communication-logs-resource.component';
export {
  CommunicationProvidersResourceComponent
} from './Communication/communication-providers-resource.component';
export {
  CommunicationRunsResourceComponent
} from './Communication/communication-runs-resource.component';
export {
  CommunicationTemplatesResourceComponent
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
  QueryBrowserResourceComponent
} from './QueryBrowser/query-browser-resource.component';

// Dashboard Browser
export {
  DashboardBrowserResourceComponent
} from './DashboardBrowser/dashboard-browser-resource.component';
export {
  DashboardShareDialogComponent,
  UserSharePermission,
  ShareDialogResult
} from './DashboardBrowser/dashboard-share-dialog.component';

// Home Application and Dashboard
export { HomeApplication } from './Home/home-application';
export { HomeDashboardComponent } from './Home/home-dashboard.component';

// API Keys
export { APIKeysResourceComponent } from './APIKeys/api-keys-resource.component';
export { APIKeyCreateDialogComponent, APIKeyCreateResult } from './APIKeys/api-key-create-dialog.component';
export { APIKeyEditPanelComponent } from './APIKeys/api-key-edit-panel.component';
export { APIKeyListComponent, APIKeyFilter } from './APIKeys/api-key-list.component';
export { APIApplicationsPanelComponent } from './APIKeys/api-applications-panel.component';
export { APIScopesPanelComponent } from './APIKeys/api-scopes-panel.component';
export { APIUsagePanelComponent } from './APIKeys/api-usage-panel.component';

// MCP (Model Context Protocol)
export * from './MCP';

// Version History Dashboard Components
export {
  VersionHistoryLabelsResourceComponent,
  VersionHistoryDiffResourceComponent,
  VersionHistoryRestoreResourceComponent,
  VersionHistoryGraphResourceComponent
} from './VersionHistory';

// Module
export * from './module';
