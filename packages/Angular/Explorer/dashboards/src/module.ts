import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { HelloDashboardComponent } from './demo/hello-dashboard.component';
import { EntityAdminDashboardComponent } from './EntityAdmin/entity-admin-dashboard.component';
import { ERDCompositeComponent } from './EntityAdmin/components/erd-composite.component';
import { EntityFilterPanelComponent } from './EntityAdmin/components/entity-filter-panel.component';
import { EntityDetailsComponent } from './EntityAdmin/components/entity-details.component';
import { ERDDiagramComponent } from './EntityAdmin/components/erd-diagram.component';
import { AIDashboardComponent } from './AI/ai-dashboard.component';
import { ModelManagementComponent } from './AI/components/model-management.component';
import { PromptManagementComponent } from './AI/components/prompt-management.component';
import { AgentConfigurationComponent } from './AI/components/agent-configuration.component';
import { ExecutionMonitoringComponent } from './AI/components/execution-monitoring.component';
import { SystemConfigurationComponent } from './AI/components/system-configuration.component';
import { ActionsManagementDashboardComponent } from './Actions/actions-management-dashboard.component';
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
@NgModule({
  declarations: [
    HelloDashboardComponent,
    EntityAdminDashboardComponent,
    ERDCompositeComponent,
    EntityFilterPanelComponent,
    EntityDetailsComponent,
    ERDDiagramComponent,
    AIDashboardComponent,
    ModelManagementComponent,
    PromptManagementComponent,
    AgentConfigurationComponent,
    ExecutionMonitoringComponent,
    SystemConfigurationComponent,
    ActionsManagementDashboardComponent,
    ActionsOverviewComponent,
    ActionsExecutionMonitoringComponent,
    ScheduledActionsComponent,
    CodeManagementComponent,
    EntityIntegrationComponent,
    SecurityPermissionsComponent,
    ActionsListViewComponent,
    ExecutionsListViewComponent,
    CategoriesListViewComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    IndicatorsModule,
    DropDownsModule,
    InputsModule,
    LayoutModule,
    ContainerDirectivesModule,
    NavigationModule,
    CodeEditorModule,
    TreeViewModule,
    ButtonsModule
  ],
  exports: [
    HelloDashboardComponent,
    EntityAdminDashboardComponent,
    AIDashboardComponent,
    ActionsManagementDashboardComponent
  ]
})
export class DashboardsModule { }