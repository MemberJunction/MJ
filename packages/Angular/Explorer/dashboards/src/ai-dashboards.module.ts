import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { TabStripModule, SplitterModule } from '@progress/kendo-angular-layout';
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { AgentsModule } from '@memberjunction/ng-agents';
import { AgentRequestsModule } from '@memberjunction/ng-agent-requests';
import { NgTreesModule } from '@memberjunction/ng-trees';
import { SharedDashboardWidgetsModule } from './shared/shared-dashboard-widgets.module';
import { SharedPipesModule } from './shared/shared-pipes.module';
import { SearchModule } from '@memberjunction/ng-search';

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
import { DuplicateDetectionResourceComponent } from './AI/components/duplicates/duplicate-detection-resource.component';
import { VectorManagementResourceComponent } from './AI/components/vectors/vector-management-resource.component';
import { AIInstrumentationService } from './AI/services/ai-instrumentation.service';

// Knowledge Hub components
import {
  KnowledgeSearchResourceComponent,
  LoadKnowledgeSearchResource
} from './KnowledgeHub/components/search/knowledge-search-resource.component';
import {
  KnowledgeConfigResourceComponent,
  LoadKnowledgeConfigResource
} from './KnowledgeHub/components/config/knowledge-config-resource.component';
import { SearchResultDetailComponent } from './KnowledgeHub/components/results-detail/search-result-detail.component';
import {
  ClusterVisualizationResourceComponent,
  LoadClusterVisualizationResource
} from './KnowledgeHub/components/clusters/cluster-visualization-resource.component';
import { ClusteringModule } from '@memberjunction/ng-clustering';

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
    DuplicateDetectionResourceComponent,
    VectorManagementResourceComponent,
    KnowledgeSearchResourceComponent,
    KnowledgeConfigResourceComponent,
    SearchResultDetailComponent,
    ClusterVisualizationResourceComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonsModule,
    GridModule,
    DropDownsModule,
    InputsModule,
    IndicatorsModule,
    DialogsModule,
    WindowModule,
    TabStripModule,
    SplitterModule,
    TreeViewModule,
    ContainerDirectivesModule,
    CodeEditorModule,
    SharedGenericModule,
    AgentsModule,
    AgentRequestsModule,
    NgTreesModule,
    SharedDashboardWidgetsModule,
    SharedPipesModule,
    SearchModule,
    ClusteringModule
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
    DuplicateDetectionResourceComponent,
    VectorManagementResourceComponent,
    KnowledgeSearchResourceComponent,
    KnowledgeConfigResourceComponent,
    SearchResultDetailComponent,
    ClusterVisualizationResourceComponent,
    SharedDashboardWidgetsModule
  ]
})
export class AIDashboardsModule {
    constructor() {
        // Ensure tree-shaking prevention loaders are called
        LoadClusterVisualizationResource();
    }
}
