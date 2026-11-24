import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    MJAlertComponent,
    MJButtonDirective,
    MJEmptyStateComponent,
    MJFilterPanelComponent,
    MJFilterPopoverComponent,
    MJPageBodyComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageSearchComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
    MJViewToggleComponent,
} from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FlowEditorModule } from '@memberjunction/ng-flow-editor';
import { AgentsModule } from '@memberjunction/ng-agents';
import { AITestHarnessModule } from '@memberjunction/ng-ai-test-harness';
import { TaskGraphEditorModule } from '@memberjunction/ng-task-graph-editor';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { AngularSplitModule } from 'angular-split';

import { WorkflowsDashboardComponent } from './Workflows/workflows-dashboard.component';
import { CreateWorkflowComponent } from './Workflows/components/create-workflow.component';
import { WorkflowsResourceComponent } from './Workflows/components/workflows-resource.component';
import { WorkflowRunsResourceComponent } from './Workflows/components/workflow-runs-resource.component';

/**
 * WorkflowsDashboardsModule — the Workflows app: Blueprints & Ops Table catalog,
 * Split-Compiler Create Front Door, In-App Studio (reusing `<mj-flow-agent-editor>` +
 * `<mj-agent-invocations>` 100% DRY), and the Runs Flight Deck & Execution Waterfall.
 */
@NgModule({
    declarations: [
        WorkflowsDashboardComponent,
        CreateWorkflowComponent,
        WorkflowsResourceComponent,
        WorkflowRunsResourceComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        MJAlertComponent,
        MJButtonDirective,
        MJEmptyStateComponent,
        MJFilterPanelComponent,
        MJFilterPopoverComponent,
        MJPageBodyComponent,
        MJPageHeaderComponent,
        MJPageLayoutComponent,
        MJPageSearchComponent,
        MJRefreshButtonComponent,
        MJStatBadgeComponent,
        MJViewToggleComponent,
        ContainerDirectivesModule,
        SharedGenericModule,
        FlowEditorModule,
        AgentsModule,
        AITestHarnessModule,
        TaskGraphEditorModule,
        CodeEditorModule,
        AngularSplitModule,
    ],
    exports: [
        WorkflowsDashboardComponent,
        CreateWorkflowComponent,
        WorkflowsResourceComponent,
        WorkflowRunsResourceComponent,
    ],
})
export class WorkflowsDashboardsModule {}

/**
 * Keeps the `@RegisterClass` registrations from being tree-shaken.
 */
export function LoadWorkflowsDashboards(): void {
    const registrations = [
        WorkflowsDashboardComponent,
        WorkflowsResourceComponent,
        WorkflowRunsResourceComponent,
    ];
    if (registrations.length === 0) {
        console.log('LoadWorkflowsDashboards: nothing registered');
    }
}
