import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AngularSplitModule } from 'angular-split';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { AgentsModule } from '@memberjunction/ng-agents';
import { AgentRequestsModule } from '@memberjunction/ng-agent-requests';
import { NgTreesModule } from '@memberjunction/ng-trees';
import { SharedDashboardWidgetsModule } from './shared/shared-dashboard-widgets.module';
import { SharedPipesModule } from './shared/shared-pipes.module';
import { SearchModule } from '@memberjunction/ng-search';
import { MJComboboxComponent, MJDropdownComponent, MJPageHeaderComponent, MJPageLayoutComponent, MJFilterToggleComponent, MJResultCountComponent, MJFilterPopoverComponent } from '@memberjunction/ng-ui-components';

// AI Components
import { ModelManagementComponent } from './AI/components/models/model-management.component';
import { PromptManagementComponent } from './AI/components/prompts/prompt-management.component';
import { PromptFilterPanelComponent } from './AI/components/prompts/prompt-filter-panel.component';
import { AgentConfigurationComponent } from './AI/components/agents/agent-configuration.component';
import { AgentFilterPanelComponent } from './AI/components/agents/agent-filter-panel.component';
import { AgentEditorComponent } from './AI/components/agents/agent-editor.component';
import { ExecutionMonitoringComponent } from './AI/components/execution-monitoring.component';
import { SystemConfigurationComponent } from './AI/components/system/system-configuration.component';
import { SystemConfigFilterPanelComponent } from './AI/components/system/system-config-filter-panel.component';
import { ModelPromptPriorityMatrixComponent } from './AI/components/prompts/model-prompt-priority-matrix.component';
import { PromptVersionControlComponent } from './AI/components/prompts/prompt-version-control.component';
// AI Instrumentation Widgets (KPICard and TimeSeriesChart are in SharedDashboardWidgetsModule)
import { LiveExecutionWidgetComponent } from './AI/components/widgets/live-execution-widget.component';
import { PerformanceHeatmapComponent } from './AI/components/charts/performance-heatmap.component';
import { AgentRequestsResourceComponent } from './AI/components/requests/agent-requests-resource.component';
import { AutotaggingPipelineResourceComponent } from './AI/components/autotagging/autotagging-pipeline-resource.component';
import { TagsResourceComponent, LoadTagsResource } from './AI/components/tags/tags-resource.component';
import { DuplicateDetectionResourceComponent } from './AI/components/duplicates/duplicate-detection-resource.component';
import { VectorManagementResourceComponent } from './AI/components/vectors/vector-management-resource.component';
import { AIInstrumentationService } from './AI/services/ai-instrumentation.service';
import { AIAnalyticsResourceComponent, LoadAIAnalyticsResource } from './AI/components/analytics/ai-analytics-resource.component';
import { AnalyticsFilterBarComponent } from './AI/components/analytics/analytics-filter-bar.component';
import { AnalyticsExecutiveSummaryComponent, LoadAnalyticsExecutiveSummary } from './AI/components/analytics/executive-summary/executive-summary.component';
import { AnalyticsPromptRunsComponent, LoadAnalyticsPromptRuns } from './AI/components/analytics/prompt-runs/prompt-run-analysis.component';
import { AnalyticsAgentRunsComponent, LoadAnalyticsAgentRuns } from './AI/components/analytics/agent-runs/agent-run-analysis.component';
import { AnalyticsModelPerformanceComponent, LoadAnalyticsModelPerformance } from './AI/components/analytics/model-performance/model-performance.component';
import { AnalyticsCostBudgetComponent, LoadAnalyticsCostBudget } from './AI/components/analytics/cost-budget/cost-budget.component';
import { AnalyticsErrorAnalysisComponent, LoadAnalyticsErrorAnalysis } from './AI/components/analytics/error-analysis/error-analysis.component';
import { AnalyticsUsagePatternsComponent, LoadAnalyticsUsagePatterns } from './AI/components/analytics/usage-patterns/usage-patterns.component';

// AI Overview Hub
import { AIOverviewHubComponent, LoadAIOverviewHub } from './AI/components/overview/ai-overview-hub.component';

// Knowledge Hub components
import {
  KnowledgeConfigResourceComponent,
  LoadKnowledgeConfigResource
} from './KnowledgeHub/components/config/knowledge-config-resource.component';
import { SearchResultDetailComponent } from './KnowledgeHub/components/results-detail/search-result-detail.component';
import {
  ClusterVisualizationResourceComponent,
  LoadClusterVisualizationResource
} from './KnowledgeHub/components/clusters/cluster-visualization-resource.component';
import {
  SchedulingResourceComponent,
  LoadSchedulingResource
} from './KnowledgeHub/components/scheduling/scheduling-resource.component';
import {
  AnalyticsResourceComponent,
  LoadAnalyticsResource
} from './KnowledgeHub/components/analytics/analytics-resource.component';
import { ClusteringModule } from '@memberjunction/ng-clustering';
import { SchedulingModule } from '@memberjunction/ng-scheduling';
import { MJWordCloudComponent } from '@memberjunction/ng-word-cloud';

/**
 * AIDashboardsModule — AI feature area: models, prompts, agents,
 * execution monitoring, system configuration, and instrumentation widgets.
 */
@NgModule({
  declarations: [
    ModelManagementComponent,
    PromptManagementComponent,
    PromptFilterPanelComponent,
    AgentConfigurationComponent,
    AgentFilterPanelComponent,
    AgentEditorComponent,
    ExecutionMonitoringComponent,
    SystemConfigurationComponent,
    SystemConfigFilterPanelComponent,
    ModelPromptPriorityMatrixComponent,
    PromptVersionControlComponent,
    LiveExecutionWidgetComponent,
    PerformanceHeatmapComponent,
    AgentRequestsResourceComponent,
    AutotaggingPipelineResourceComponent,
    TagsResourceComponent,
    DuplicateDetectionResourceComponent,
    VectorManagementResourceComponent,
    KnowledgeConfigResourceComponent,
    SearchResultDetailComponent,
    ClusterVisualizationResourceComponent,
    SchedulingResourceComponent,
    AnalyticsResourceComponent,
    AIAnalyticsResourceComponent,
    AnalyticsFilterBarComponent,
    AnalyticsExecutiveSummaryComponent,
    AnalyticsPromptRunsComponent,
    AnalyticsAgentRunsComponent,
    AnalyticsModelPerformanceComponent,
    AnalyticsCostBudgetComponent,
    AnalyticsErrorAnalysisComponent,
    AnalyticsUsagePatternsComponent,
    AIOverviewHubComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AngularSplitModule,
    ContainerDirectivesModule,
    CodeEditorModule,
    SharedGenericModule,
    AgentsModule,
    AgentRequestsModule,
    NgTreesModule,
    SharedDashboardWidgetsModule,
    SharedPipesModule,
    SearchModule,
    MJComboboxComponent,
    MJDropdownComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJFilterToggleComponent,
    MJResultCountComponent,
    MJFilterPopoverComponent,
    ClusteringModule,
    SchedulingModule,
    MJWordCloudComponent
  ],
  providers: [
    AIInstrumentationService
  ],
  exports: [
    ModelManagementComponent,
    PromptManagementComponent,
    AgentConfigurationComponent,
    ExecutionMonitoringComponent,
    SystemConfigurationComponent,
    LiveExecutionWidgetComponent,
    PerformanceHeatmapComponent,
    AgentRequestsResourceComponent,
    AutotaggingPipelineResourceComponent,
    TagsResourceComponent,
    DuplicateDetectionResourceComponent,
    VectorManagementResourceComponent,
    KnowledgeConfigResourceComponent,
    SearchResultDetailComponent,
    ClusterVisualizationResourceComponent,
    SchedulingResourceComponent,
    AnalyticsResourceComponent,
    AIAnalyticsResourceComponent,
    AnalyticsFilterBarComponent,
    AnalyticsExecutiveSummaryComponent,
    AnalyticsPromptRunsComponent,
    AnalyticsAgentRunsComponent,
    AnalyticsModelPerformanceComponent,
    AnalyticsCostBudgetComponent,
    AnalyticsErrorAnalysisComponent,
    AnalyticsUsagePatternsComponent,
    AIOverviewHubComponent,
    SharedDashboardWidgetsModule
  ]
})
export class AIDashboardsModule {
    constructor() {
        // Ensure tree-shaking prevention loaders are called
        LoadTagsResource();
        LoadClusterVisualizationResource();
        LoadSchedulingResource();
        LoadAnalyticsResource();
        LoadAIAnalyticsResource();
        LoadAnalyticsExecutiveSummary();
        LoadAnalyticsPromptRuns();
        LoadAnalyticsAgentRuns();
        LoadAnalyticsModelPerformance();
        LoadAnalyticsCostBudget();
        LoadAnalyticsErrorAnalysis();
        LoadAnalyticsUsagePatterns();
        LoadAIOverviewHub();
    }
}
