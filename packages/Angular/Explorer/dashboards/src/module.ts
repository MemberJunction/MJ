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
import { ERDCompositeComponent } from './EntityAdmin/components/erd-composite.component';
import { EntityFilterPanelComponent } from './EntityAdmin/components/entity-filter-panel.component';
import { EntityDetailsComponent } from './EntityAdmin/components/entity-details.component';
import { ERDDiagramComponent } from './EntityAdmin/components/erd-diagram.component';
import { ModelManagementV2Component } from './AI/components/models/model-management-v2.component';
import { PromptManagementV2Component } from './AI/components/prompts/prompt-management-v2.component';
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
import { GridModule } from '@progress/kendo-angular-grid';
import { MJReactModule } from '@memberjunction/ng-react';
import { SplitterModule } from '@progress/kendo-angular-layout';
// Scheduling Dashboard Components
import { SchedulingDashboardComponent } from './Scheduling/scheduling-dashboard.component';
import { SchedulingMonitoringComponent } from './Scheduling/components/scheduling-monitoring.component';
import { SchedulingJobsComponent } from './Scheduling/components/scheduling-jobs.component';
import { SchedulingHistoryComponent } from './Scheduling/components/scheduling-history.component';
import { SchedulingTypesComponent } from './Scheduling/components/scheduling-types.component';
import { SchedulingHealthComponent } from './Scheduling/components/scheduling-health.component';
import { SchedulingMonitorResourceComponent } from './Scheduling/components/scheduling-monitor-resource.component';
import { SchedulingJobsResourceComponent } from './Scheduling/components/scheduling-jobs-resource.component';
import { SchedulingHistoryResourceComponent } from './Scheduling/components/scheduling-history-resource.component';
import { SchedulingTypesResourceComponent } from './Scheduling/components/scheduling-types-resource.component';
import { SchedulingHealthResourceComponent } from './Scheduling/components/scheduling-health-resource.component';
import { SchedulingInstrumentationService } from './Scheduling/services/scheduling-instrumentation.service';
// Testing Dashboard Components
import { TestingDashboardComponent } from './Testing/testing-dashboard.component';
import { TestingOverviewComponent } from './Testing/components/testing-overview.component';
import { TestingExecutionComponent } from './Testing/components/testing-execution.component';
import { TestingAnalyticsComponent } from './Testing/components/testing-analytics.component';
import { TestingVersionComparisonComponent } from './Testing/components/testing-version-comparison.component';
import { TestingFeedbackComponent } from './Testing/components/testing-feedback.component';
import { TestingOverviewResourceComponent } from './Testing/components/testing-overview-resource.component';
import { TestingExecutionResourceComponent } from './Testing/components/testing-execution-resource.component';
import { TestingAnalyticsResourceComponent } from './Testing/components/testing-analytics-resource.component';
import { TestingVersionResourceComponent } from './Testing/components/testing-version-resource.component';
import { TestingFeedbackResourceComponent } from './Testing/components/testing-feedback-resource.component';
import { SuiteTreeComponent, SuiteTreeNodeComponent } from './Testing/components/widgets/suite-tree.component';
import { OracleBreakdownTableComponent } from './Testing/components/widgets/oracle-breakdown-table.component';
import { TestRunDetailPanelComponent } from './Testing/components/widgets/test-run-detail-panel.component';
import { TestingInstrumentationService } from './Testing/services/testing-instrumentation.service';
import { TestingModule } from '@memberjunction/ng-testing';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
// Data Explorer Dashboard Components
import { DataExplorerDashboardComponent } from './DataExplorer/data-explorer-dashboard.component';
import { NavigationPanelComponent as ExplorerNavigationPanelComponent } from './DataExplorer/components/navigation-panel/navigation-panel.component';
import { ViewSelectorComponent } from './DataExplorer/components/view-selector/view-selector.component';
import { ViewConfigPanelComponent } from './DataExplorer/components/view-config-panel/view-config-panel.component';
import { FilterDialogComponent } from './DataExplorer/components/filter-dialog/filter-dialog.component';
import { ExplorerStateService } from './DataExplorer/services/explorer-state.service';
// Home Dashboard Components
import { HomeDashboardComponent } from './Home/home-dashboard.component';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FilterBuilderModule } from '@memberjunction/ng-filter-builder';
import { CommunicationDashboardComponent } from './Communication/communication-dashboard.component';
import { CommunicationMonitorResourceComponent } from './Communication/communication-monitor-resource.component';
import { CommunicationLogsResourceComponent } from './Communication/communication-logs-resource.component';
import { CommunicationProvidersResourceComponent } from './Communication/communication-providers-resource.component';
import { CommunicationRunsResourceComponent } from './Communication/communication-runs-resource.component';



@NgModule({
  declarations: [
    EntityAdminDashboardComponent,
    ERDCompositeComponent,
    EntityFilterPanelComponent,
    EntityDetailsComponent,
    ERDDiagramComponent,
    ModelManagementV2Component,
    PromptManagementV2Component,
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
    // Scheduling Dashboard Components
    SchedulingDashboardComponent,
    SchedulingMonitoringComponent,
    SchedulingJobsComponent,
    SchedulingHistoryComponent,
    SchedulingTypesComponent,
    SchedulingHealthComponent,
    SchedulingMonitorResourceComponent,
    SchedulingJobsResourceComponent,
    SchedulingHistoryResourceComponent,
    SchedulingTypesResourceComponent,
    SchedulingHealthResourceComponent,
    // Testing Dashboard Components
    TestingDashboardComponent,
    TestingOverviewComponent,
    TestingExecutionComponent,
    TestingAnalyticsComponent,
    TestingVersionComparisonComponent,
    TestingFeedbackComponent,
    TestingOverviewResourceComponent,
    TestingExecutionResourceComponent,
    TestingAnalyticsResourceComponent,
    TestingVersionResourceComponent,
    TestingFeedbackResourceComponent,
    SuiteTreeComponent,
    SuiteTreeNodeComponent,
    OracleBreakdownTableComponent,
    TestRunDetailPanelComponent,
    // Data Explorer Dashboard Components
    DataExplorerDashboardComponent,
    ExplorerNavigationPanelComponent,
    ViewSelectorComponent,
    ViewConfigPanelComponent,
    FilterDialogComponent,
    // Home Dashboard Components
    HomeDashboardComponent,
    // Communication Dashboard Components
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent


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
    FilterBuilderModule
  ],
  providers: [
    AIInstrumentationService,
    SchedulingInstrumentationService,
    TestingInstrumentationService,
    ExplorerStateService
  ],
  exports: [
    EntityAdminDashboardComponent,
    ComponentStudioDashboardComponent,
    SchedulingDashboardComponent,
    TestingDashboardComponent,
    // Export AI components (now BaseResourceComponent-based)
    ExecutionMonitoringComponent,
    PromptManagementV2Component,
    AgentConfigurationComponent,
    ModelManagementV2Component,
    SystemConfigurationComponent,
    // Export Actions components (now BaseResourceComponent-based)
    ActionsOverviewComponent,
    ActionsExecutionMonitoringComponent,
    ScheduledActionsComponent,
    CodeManagementComponent,
    EntityIntegrationComponent,
    SecurityPermissionsComponent,
    // Export Scheduling resource components
    SchedulingMonitorResourceComponent,
    SchedulingJobsResourceComponent,
    SchedulingHistoryResourceComponent,
    SchedulingTypesResourceComponent,
    SchedulingHealthResourceComponent,
    // Export Testing resource components
    TestingOverviewResourceComponent,
    TestingExecutionResourceComponent,
    TestingAnalyticsResourceComponent,
    TestingVersionResourceComponent,
    TestingFeedbackResourceComponent,
    // Export Data Explorer Dashboard
    DataExplorerDashboardComponent,
    // Export Home Dashboard
    HomeDashboardComponent,
    // Export Communication Dashboard
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent


  ]
})
export class DashboardsModule { }