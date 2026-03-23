import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { ActionGalleryModule } from '@memberjunction/ng-action-gallery';
import { AITestHarnessModule } from '@memberjunction/ng-ai-test-harness';
import { ActionsModule } from '@memberjunction/ng-actions';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Actions Components
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

/**
 * ActionsDashboardsModule — Actions feature area: overview, execution monitoring,
 * code management, entity integration, security permissions, and Action Explorer.
 */
@NgModule({
  declarations: [
    ActionsOverviewComponent,
    ActionsExecutionMonitoringComponent,
    ScheduledActionsComponent,
    CodeManagementComponent,
    EntityIntegrationComponent,
    SecurityPermissionsComponent,
    ActionsListViewComponent,
    ExecutionsListViewComponent,
    CategoriesListViewComponent,
    ActionExplorerComponent,
    ActionTreePanelComponent,
    ActionToolbarComponent,
    ActionBreadcrumbComponent,
    ActionCardComponent,
    ActionListItemComponent,
    NewCategoryPanelComponent,
    NewActionPanelComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonsModule,
    GridModule,
    DropDownsModule,
    InputsModule,
    DialogsModule,
    WindowModule,
    TreeViewModule,
    ContainerDirectivesModule,
    CodeEditorModule,
    ActionGalleryModule,
    AITestHarnessModule,
    ActionsModule,
    SharedGenericModule
  ],
  exports: [
    ActionsOverviewComponent,
    ActionsExecutionMonitoringComponent,
    ScheduledActionsComponent,
    CodeManagementComponent,
    EntityIntegrationComponent,
    SecurityPermissionsComponent,
    ActionExplorerComponent,
    ActionTreePanelComponent,
    ActionToolbarComponent,
    ActionBreadcrumbComponent,
    ActionCardComponent,
    ActionListItemComponent,
    NewCategoryPanelComponent,
    NewActionPanelComponent
  ]
})
export class ActionsDashboardsModule { }
