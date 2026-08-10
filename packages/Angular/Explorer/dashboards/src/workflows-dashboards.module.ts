import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    MJAlertComponent,
    MJButtonDirective,
    MJEmptyStateComponent,
    MJPageBodyComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageSearchComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { TaskGraphEditorModule } from '@memberjunction/ng-task-graph-editor';

import { WorkflowsDashboardComponent } from './Workflows/workflows-dashboard.component';
import { CreateWorkflowComponent } from './Workflows/components/create-workflow.component';
import { WorkflowsResourceComponent } from './Workflows/components/workflows-resource.component';
import { WorkflowRunsResourceComponent } from './Workflows/components/workflow-runs-resource.component';

/**
 * WorkflowsDashboardsModule — the Workflows app: the saved-workflow list, the Create Workflow front
 * door, and the run history.
 *
 * A separate app rather than a tab inside AI, per D18/D19: the vocabulary rule puts *Workflow* in
 * front of end users, and filing the surface under "AI" would contradict that at the navigation
 * level. See `mockups/workflow-ux/front-door-v1.html` for the locked design.
 *
 * **The app owns runs, not editing.** There is exactly one workflow editor — the AI Agents form —
 * and the front door hands off to it after `Workflow.Save` rather than opening a second canvas. What
 * this app adds that exists nowhere else is the **Runs** surface: a task graph outlives the run that
 * submitted it, so a scheduled or MCP-triggered workflow has no owning conversation to be found
 * from. Runs are listed here by what a person remembers — what ran, when, and how it ended.
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
        MJPageBodyComponent,
        MJPageHeaderComponent,
        MJPageLayoutComponent,
        MJPageSearchComponent,
        MJRefreshButtonComponent,
        MJStatBadgeComponent,
        ContainerDirectivesModule,
        SharedGenericModule,
        TaskGraphEditorModule,
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
 *
 * Referencing the classes is what the bundler needs; without this a production build drops the
 * decorators and the app's nav item resolves to nothing at runtime — a failure that only appears
 * in a built bundle, never in dev.
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
