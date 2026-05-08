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
export * from './DevTools';
export * from './Admin';
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
  PerformanceHeatmapComponent,
  AgentRequestsResourceComponent,
  AutotaggingPipelineResourceComponent,
  TagsResourceComponent,
  LoadTagsResource,
  VectorManagementResourceComponent,
  DuplicateDetectionResourceComponent,
  AIAnalyticsResourceComponent,
  LoadAIAnalyticsResource,
  AnalyticsFilterBarComponent,
  AIOverviewHubComponent,
  LoadAIOverviewHub,
  AnalyticsExecutiveSummaryComponent,
  LoadAnalyticsExecutiveSummary,
  AnalyticsPromptRunsComponent,
  LoadAnalyticsPromptRuns,
  AnalyticsAgentRunsComponent,
  LoadAnalyticsAgentRuns,
  AnalyticsModelPerformanceComponent,
  LoadAnalyticsModelPerformance,
  AnalyticsCostBudgetComponent,
  LoadAnalyticsCostBudget,
  AnalyticsErrorAnalysisComponent,
  LoadAnalyticsErrorAnalysis,
  AnalyticsUsagePatternsComponent,
  LoadAnalyticsUsagePatterns
} from './AI/index';

// Knowledge Hub components
export {
  KnowledgeConfigResourceComponent,
  LoadKnowledgeConfigResource
} from './KnowledgeHub/components/config/knowledge-config-resource.component';
export { SearchResultDetailComponent } from './KnowledgeHub/components/results-detail/search-result-detail.component';
export {
  ClusterVisualizationResourceComponent,
  LoadClusterVisualizationResource
} from './KnowledgeHub/components/clusters/cluster-visualization-resource.component';
export {
  AnalyticsResourceComponent,
  LoadAnalyticsResource
} from './KnowledgeHub/components/analytics/analytics-resource.component';

// Archiving components
export {
  ArchiveConfigResourceComponent,
  LoadArchiveConfigResource
} from './Archiving/components/archive-config-resource.component';
export {
  ArchiveRunsResourceComponent,
  LoadArchiveRunsResource
} from './Archiving/components/archive-runs-resource.component';

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
  ShareDialogResult
} from './DashboardBrowser/dashboard-share-dialog.component';

// Home Application and Dashboard
export { HomeApplication } from './Home/home-application';
export { HomeDashboardComponent } from './Home/home-dashboard.component';

// Application Roles
export { ApplicationRolesResourceComponent, LoadApplicationRolesResource } from './ApplicationRoles/application-roles-resource.component';

// Permissions admin — three independent resource tabs (Phase 2a/b/c — unified permissions)
export {
    PermissionsUserAccessResourceComponent,
    LoadPermissionsUserAccessResource,
} from './Permissions/user-access-resource.component';
export {
    PermissionsResourceAccessResourceComponent,
    LoadPermissionsResourceAccessResource,
} from './Permissions/resource-access-resource.component';
export {
    PermissionsAuditLogResourceComponent,
    LoadPermissionsAuditLogResource,
} from './Permissions/audit-log-resource.component';

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
export * from './VersionHistory';

// Integration Dashboard
export * from './Integration';

// NOTE: DashboardsModule (backward-compatible wrapper that imports ALL feature modules) is
// intentionally not re-exported from the barrel to enable ESBuild code splitting.
// Consumers who need it: import { DashboardsModule } from '@memberjunction/ng-dashboards/module'

// Feature modules for lazy loading
export * from './core-dashboards.module';
export * from './ai-dashboards.module';
export * from './actions-dashboards.module';
export * from './testing-dashboards.module';
export * from './scheduling-dashboards.module';
export * from './communication-dashboards.module';
export * from './credentials-dashboards.module';
export * from './data-explorer-dashboards.module';
export * from './lists-dashboards.module';
export * from './component-studio-dashboards.module';
export * from './DatabaseDesigner/database-designer-dashboards.module';
export { DatabaseDesignerDashboardComponent, LoadDatabaseDesignerDashboard } from './DatabaseDesigner/components/database-designer-dashboard.component';
export * from './shared/shared-dashboard-widgets.module';
export * from './archiving-dashboards.module';
