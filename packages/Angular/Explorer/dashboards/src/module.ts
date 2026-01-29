import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { LayoutModule, TabStripModule, PanelBarModule } from '@progress/kendo-angular-layout';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { EntityAdminDashboardComponent } from './EntityAdmin/entity-admin-dashboard.component';
// ERDCompositeComponent, EntityFilterPanelComponent, EntityDetailsComponent are now in
// @memberjunction/ng-entity-relationship-diagram and imported via EntityRelationshipDiagramModule
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
import { ModelManagementComponent } from './AI/components/models/model-management.component';
import { PromptManagementComponent } from './AI/components/prompts/prompt-management.component';
import { PromptFilterPanelComponent } from './AI/components/prompts/prompt-filter-panel.component';
import { AgentConfigurationComponent } from './AI/components/agents/agent-configuration.component';
import { AgentFilterPanelComponent } from './AI/components/agents/agent-filter-panel.component';
import { AgentEditorComponent } from './AI/components/agents/agent-editor.component';
import { ExecutionMonitoringComponent } from './AI/components/execution-monitoring.component';
import { SystemConfigurationComponent } from './AI/components/system/system-configuration.component';
import { SystemConfigFilterPanelComponent } from './AI/components/system/system-config-filter-panel.component';
import { ActionsOverviewComponent } from './Actions/components/actions-overview.component';
import { ExecutionMonitoringComponent as ActionsExecutionMonitoringComponent } from './Actions/components/execution-monitoring.component';
import { ScheduledActionsComponent } from './Actions/components/scheduled-actions.component';
import { CodeManagementComponent } from './Actions/components/code-management.component';
import { EntityIntegrationComponent } from './Actions/components/entity-integration.component';
import { SecurityPermissionsComponent } from './Actions/components/security-permissions.component';
import { ActionsListViewComponent } from './Actions/components/actions-list-view.component';
import { ExecutionsListViewComponent } from './Actions/components/executions-list-view.component';
import { CategoriesListViewComponent } from './Actions/components/categories-list-view.component';
// Action Explorer Components
import {
  ActionExplorerComponent,
  ActionTreePanelComponent,
  ActionToolbarComponent,
  ActionBreadcrumbComponent,
  ActionCardComponent,
  ActionListItemComponent,
  NewCategoryPanelComponent,
  NewActionPanelComponent
} from './Actions/components/explorer';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { NavigationModule } from '@progress/kendo-angular-navigation';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { ModelPromptPriorityMatrixComponent } from './AI/components/prompts/model-prompt-priority-matrix.component';
import { PromptVersionControlComponent } from './AI/components/prompts/prompt-version-control.component';
import { ActionGalleryModule } from '@memberjunction/ng-action-gallery';
import { AITestHarnessModule } from '@memberjunction/ng-ai-test-harness';
import { MemberJunctionCoreEntityFormsModule } from '@memberjunction/ng-core-entity-forms';
import { MJNotificationsModule } from '@memberjunction/ng-notifications';
// AI Instrumentation Components
import { KPICardComponent } from './AI/components/widgets/kpi-card.component';
import { LiveExecutionWidgetComponent } from './AI/components/widgets/live-execution-widget.component';
import { TimeSeriesChartComponent } from './AI/components/charts/time-series-chart.component';
import { PerformanceHeatmapComponent } from './AI/components/charts/performance-heatmap.component';
import { AIInstrumentationService } from './AI/services/ai-instrumentation.service';
// Component Studio Components
import { ComponentStudioDashboardComponent } from './ComponentStudio/component-studio-dashboard.component';
import { TextImportDialogComponent } from './ComponentStudio/components/text-import-dialog.component';
import { ArtifactSelectionDialogComponent } from './ComponentStudio/components/artifact-selection-dialog.component';
import { ArtifactLoadDialogComponent } from './ComponentStudio/components/artifact-load-dialog.component';
import { ComponentBrowserComponent } from './ComponentStudio/components/browser/component-browser.component';
import { ComponentPreviewComponent } from './ComponentStudio/components/workspace/component-preview.component';
import { EditorTabsComponent } from './ComponentStudio/components/workspace/editor-tabs.component';
import { SpecEditorComponent } from './ComponentStudio/components/editors/spec-editor.component';
import { CodeEditorPanelComponent } from './ComponentStudio/components/editors/code-editor-panel.component';
import { RequirementsEditorComponent } from './ComponentStudio/components/editors/requirements-editor.component';
import { DataRequirementsEditorComponent } from './ComponentStudio/components/editors/data-requirements-editor.component';
import { AIAssistantPanelComponent } from './ComponentStudio/components/ai-assistant/ai-assistant-panel.component';
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { MJReactModule } from '@memberjunction/ng-react';
import { SplitterModule } from '@progress/kendo-angular-layout';
// Scheduling Dashboard Components
import { SchedulingDashboardComponent } from './Scheduling/scheduling-dashboard.component';
import { SchedulingOverviewComponent } from './Scheduling/components/scheduling-overview.component';
import { SchedulingJobsComponent } from './Scheduling/components/scheduling-jobs.component';
import { SchedulingActivityComponent } from './Scheduling/components/scheduling-activity.component';
import { JobSlideoutComponent } from './Scheduling/components/job-slideout.component';
import { SchedulingOverviewResourceComponent } from './Scheduling/components/scheduling-overview-resource.component';
import { SchedulingJobsResourceComponent } from './Scheduling/components/scheduling-jobs-resource.component';
import { SchedulingActivityResourceComponent } from './Scheduling/components/scheduling-activity-resource.component';
import { SchedulingInstrumentationService } from './Scheduling/services/scheduling-instrumentation.service';
// Testing Dashboard Components
import { TestingDashboardComponent } from './Testing/testing-dashboard.component';
import { TestingDashboardTabComponent } from './Testing/components/testing-dashboard-tab.component';
import { TestingRunsComponent } from './Testing/components/testing-runs.component';
import { TestingAnalyticsComponent } from './Testing/components/testing-analytics.component';
import { TestingReviewComponent } from './Testing/components/testing-review.component';
import { TestingDashboardTabResourceComponent } from './Testing/components/testing-dashboard-tab-resource.component';
import { TestingRunsResourceComponent } from './Testing/components/testing-runs-resource.component';
import { TestingAnalyticsResourceComponent } from './Testing/components/testing-analytics-resource.component';
import { TestingReviewResourceComponent } from './Testing/components/testing-review-resource.component';
import { TestingExplorerComponent } from './Testing/components/testing-explorer.component';
import { TestingExplorerResourceComponent } from './Testing/components/testing-explorer-resource.component';
import { SuiteTreeComponent, SuiteTreeNodeComponent } from './Testing/components/widgets/suite-tree.component';
import { OracleBreakdownTableComponent } from './Testing/components/widgets/oracle-breakdown-table.component';
import { TestRunDetailPanelComponent } from './Testing/components/widgets/test-run-detail-panel.component';
import { TestingInstrumentationService } from './Testing/services/testing-instrumentation.service';
import { TestingModule } from '@memberjunction/ng-testing';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
// Data Explorer Dashboard Components
import { DataExplorerDashboardComponent } from './DataExplorer/data-explorer-dashboard.component';
import { DataExplorerResourceComponent } from './DataExplorer/data-explorer-resource.component';
import { NavigationPanelComponent as ExplorerNavigationPanelComponent } from './DataExplorer/components/navigation-panel/navigation-panel.component';
import { ViewSelectorComponent } from './DataExplorer/components/view-selector/view-selector.component';
// ViewConfigPanelComponent now imported from @memberjunction/ng-entity-viewer via EntityViewerModule
import { FilterDialogComponent } from './DataExplorer/components/filter-dialog/filter-dialog.component';
import { ExplorerStateService } from './DataExplorer/services/explorer-state.service';
// Home Dashboard Components
import { HomeDashboardComponent } from './Home/home-dashboard.component';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FilterBuilderModule } from '@memberjunction/ng-filter-builder';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { CommunicationDashboardComponent } from './Communication/communication-dashboard.component';
import { CommunicationMonitorResourceComponent } from './Communication/communication-monitor-resource.component';
import { CommunicationLogsResourceComponent } from './Communication/communication-logs-resource.component';
import { CommunicationProvidersResourceComponent } from './Communication/communication-providers-resource.component';
import { CommunicationRunsResourceComponent } from './Communication/communication-runs-resource.component';
// Credentials Dashboard Components
import { CredentialsDashboardComponent } from './Credentials/credentials-dashboard.component';
import { CredentialsOverviewResourceComponent } from './Credentials/components/credentials-overview-resource.component';
import { CredentialsListResourceComponent } from './Credentials/components/credentials-list-resource.component';
import { CredentialsTypesResourceComponent } from './Credentials/components/credentials-types-resource.component';
import { CredentialsCategoriesResourceComponent } from './Credentials/components/credentials-categories-resource.component';
import { CredentialsAuditResourceComponent } from './Credentials/components/credentials-audit-resource.component';
import { GroupByPipe } from './Credentials/pipes/group-by.pipe';
// Credentials Module from generic package (panels and dialogs)
import { CredentialsModule } from '@memberjunction/ng-credentials';
// System Diagnostics Components
import { SystemDiagnosticsComponent } from './SystemDiagnostics/system-diagnostics.component';
// Lists Dashboard Components
import { ListsMyListsResource } from './Lists/components/lists-my-lists-resource.component';
import { ListsBrowseResource } from './Lists/components/lists-browse-resource.component';
import { ListsCategoriesResource } from './Lists/components/lists-categories-resource.component';
import { ListsOperationsResource } from './Lists/components/lists-operations-resource.component';
import { VennDiagramComponent } from './Lists/components/venn-diagram/venn-diagram.component';
import { ListSetOperationsService } from './Lists/services/list-set-operations.service';
// Query Browser Components
import { QueryBrowserResourceComponent } from './QueryBrowser/query-browser-resource.component';
// Dashboard Browser Components (Coming Soon Placeholder)
import { DashboardBrowserResourceComponent } from './DashboardBrowser/dashboard-browser-resource.component';
import { DashboardShareDialogComponent } from './DashboardBrowser/dashboard-share-dialog.component';
// Query Viewer Module
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
// Dashboard Viewer Module
import { DashboardViewerModule } from '@memberjunction/ng-dashboard-viewer';
// API Keys Dashboard Components
import { APIKeysResourceComponent } from './APIKeys/api-keys-resource.component';
import { APIKeyCreateDialogComponent } from './APIKeys/api-key-create-dialog.component';
import { APIKeyEditPanelComponent } from './APIKeys/api-key-edit-panel.component';
import { APIKeyListComponent } from './APIKeys/api-key-list.component';
import { APIApplicationsPanelComponent } from './APIKeys/api-applications-panel.component';
import { APIScopesPanelComponent } from './APIKeys/api-scopes-panel.component';
import { APIUsagePanelComponent } from './APIKeys/api-usage-panel.component';
// Shared Pipes Module
import { SharedPipesModule } from './shared/shared-pipes.module';
// MCP Dashboard Module
import { MCPModule } from './MCP';
// Actions Module (test harness, dialogs)
import { ActionsModule } from '@memberjunction/ng-actions';



@NgModule({
  declarations: [
    EntityAdminDashboardComponent,
    // ERDCompositeComponent, EntityFilterPanelComponent, EntityDetailsComponent now in Generic package
    ModelManagementComponent,
    PromptManagementComponent,
    PromptFilterPanelComponent,
    AgentConfigurationComponent,
    AgentFilterPanelComponent,
    AgentEditorComponent,
    ExecutionMonitoringComponent,
    SystemConfigurationComponent,
    SystemConfigFilterPanelComponent,
    ActionsOverviewComponent,
    ActionsExecutionMonitoringComponent,
    ScheduledActionsComponent,
    CodeManagementComponent,
    EntityIntegrationComponent,
    SecurityPermissionsComponent,
    ActionsListViewComponent,
    ExecutionsListViewComponent,
    CategoriesListViewComponent,
    // Action Explorer Components
    ActionExplorerComponent,
    ActionTreePanelComponent,
    ActionToolbarComponent,
    ActionBreadcrumbComponent,
    ActionCardComponent,
    ActionListItemComponent,
    NewCategoryPanelComponent,
    NewActionPanelComponent,
    ModelPromptPriorityMatrixComponent,
    PromptVersionControlComponent,
    // AI Instrumentation Components
    KPICardComponent,
    LiveExecutionWidgetComponent,
    TimeSeriesChartComponent,
    PerformanceHeatmapComponent,
    // Component Studio Components
    ComponentStudioDashboardComponent,
    TextImportDialogComponent,
    ArtifactSelectionDialogComponent,
    ArtifactLoadDialogComponent,
    ComponentBrowserComponent,
    ComponentPreviewComponent,
    EditorTabsComponent,
    SpecEditorComponent,
    CodeEditorPanelComponent,
    RequirementsEditorComponent,
    DataRequirementsEditorComponent,
    AIAssistantPanelComponent,
    // Scheduling Dashboard Components
    SchedulingDashboardComponent,
    SchedulingOverviewComponent,
    SchedulingJobsComponent,
    SchedulingActivityComponent,
    JobSlideoutComponent,
    SchedulingOverviewResourceComponent,
    SchedulingJobsResourceComponent,
    SchedulingActivityResourceComponent,
    // Testing Dashboard Components
    TestingDashboardComponent,
    TestingDashboardTabComponent,
    TestingRunsComponent,
    TestingAnalyticsComponent,
    TestingReviewComponent,
    TestingDashboardTabResourceComponent,
    TestingRunsResourceComponent,
    TestingAnalyticsResourceComponent,
    TestingReviewResourceComponent,
    TestingExplorerComponent,
    TestingExplorerResourceComponent,
    SuiteTreeComponent,
    SuiteTreeNodeComponent,
    OracleBreakdownTableComponent,
    TestRunDetailPanelComponent,
    // Data Explorer Dashboard Components
    DataExplorerDashboardComponent,
    DataExplorerResourceComponent,
    ExplorerNavigationPanelComponent,
    ViewSelectorComponent,
    // ViewConfigPanelComponent now comes from EntityViewerModule
    FilterDialogComponent,
    // Home Dashboard Components
    HomeDashboardComponent,
    // Communication Dashboard Components
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent,
    // Credentials Dashboard Components (panels now come from CredentialsModule)
    CredentialsDashboardComponent,
    CredentialsOverviewResourceComponent,
    CredentialsListResourceComponent,
    CredentialsTypesResourceComponent,
    CredentialsCategoriesResourceComponent,
    CredentialsAuditResourceComponent,
    GroupByPipe,
    // System Diagnostics Components
    SystemDiagnosticsComponent,
    // Lists Dashboard Components
    ListsMyListsResource,
    ListsBrowseResource,
    ListsCategoriesResource,
    ListsOperationsResource,
    VennDiagramComponent,
    // Query Browser Components
    QueryBrowserResourceComponent,
    // Dashboard Browser Components
    DashboardBrowserResourceComponent,
    DashboardShareDialogComponent,
    // API Keys Dashboard Components
    APIKeysResourceComponent,
    APIKeyCreateDialogComponent,
    APIKeyEditPanelComponent,
    APIKeyListComponent,
    APIApplicationsPanelComponent,
    APIScopesPanelComponent,
    APIUsagePanelComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    IndicatorsModule,
    DropDownsModule,
    InputsModule,
    DateInputsModule,
    LayoutModule,
    DialogsModule,
    WindowModule,
    ContainerDirectivesModule,
    NavigationModule,
    CodeEditorModule,
    TreeViewModule,
    ButtonsModule,
    ActionGalleryModule,
    AITestHarnessModule,
    MemberJunctionCoreEntityFormsModule,
    GridModule,
    ExcelExportModule,
    MJReactModule,
    SplitterModule,
    TabStripModule,
    PanelBarModule,
    MJNotificationsModule,
    TestingModule,
    UserViewGridModule,
    EntityViewerModule,
    ExplorerSettingsModule,
    SharedGenericModule,
    FilterBuilderModule,
    EntityRelationshipDiagramModule,
    ListManagementModule,
    ExportServiceModule,
    QueryViewerModule,
    DashboardViewerModule,
    MCPModule,
    CredentialsModule,
    SharedPipesModule,
    ActionsModule
  ],
  providers: [
    AIInstrumentationService,
    SchedulingInstrumentationService,
    TestingInstrumentationService,
    ExplorerStateService,
    ListSetOperationsService
  ],
  exports: [
    EntityAdminDashboardComponent,
    ComponentStudioDashboardComponent,
    SchedulingDashboardComponent,
    TestingDashboardComponent,
    // Export AI components (now BaseResourceComponent-based)
    ExecutionMonitoringComponent,
    PromptManagementComponent,
    AgentConfigurationComponent,
    ModelManagementComponent,
    SystemConfigurationComponent,
    // Export Actions components (now BaseResourceComponent-based)
    ActionsOverviewComponent,
    ActionsExecutionMonitoringComponent,
    ScheduledActionsComponent,
    CodeManagementComponent,
    EntityIntegrationComponent,
    SecurityPermissionsComponent,
    // Export Action Explorer components
    ActionExplorerComponent,
    ActionTreePanelComponent,
    ActionToolbarComponent,
    ActionBreadcrumbComponent,
    ActionCardComponent,
    ActionListItemComponent,
    NewCategoryPanelComponent,
    NewActionPanelComponent,
    // Export Scheduling resource components
    SchedulingOverviewResourceComponent,
    SchedulingJobsResourceComponent,
    SchedulingActivityResourceComponent,
    // Export Testing resource components
    TestingDashboardTabResourceComponent,
    TestingRunsResourceComponent,
    TestingAnalyticsResourceComponent,
    TestingReviewResourceComponent,
    TestingExplorerComponent,
    TestingExplorerResourceComponent,
    // Export Data Explorer Dashboard and Resource
    DataExplorerDashboardComponent,
    DataExplorerResourceComponent,
    // Export Home Dashboard
    HomeDashboardComponent,
    // Export Communication Dashboard
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent,
    // Export Credentials Dashboard (panels re-exported via CredentialsModule)
    CredentialsDashboardComponent,
    CredentialsOverviewResourceComponent,
    CredentialsListResourceComponent,
    CredentialsTypesResourceComponent,
    CredentialsCategoriesResourceComponent,
    CredentialsAuditResourceComponent,
    GroupByPipe,
    SharedPipesModule,
    CredentialsModule,
    // System Diagnostics Components
    SystemDiagnosticsComponent,
    // Lists Dashboard Components
    ListsMyListsResource,
    ListsBrowseResource,
    ListsCategoriesResource,
    ListsOperationsResource,
    VennDiagramComponent,
    // Query Browser Components
    QueryBrowserResourceComponent,
    // Dashboard Browser Components
    DashboardBrowserResourceComponent,
    DashboardShareDialogComponent,
    // API Keys Dashboard Components
    APIKeysResourceComponent,
    APIKeyCreateDialogComponent,
    APIKeyEditPanelComponent,
    APIKeyListComponent,
    APIApplicationsPanelComponent,
    APIScopesPanelComponent,
    APIUsagePanelComponent,
    // MCP Dashboard Module (re-exports its components)
    MCPModule
  ]
})
export class DashboardsModule { }