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
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { WorkflowsDashboardComponent } from './Workflows/workflows-dashboard.component';
import { CreateWorkflowComponent } from './Workflows/components/create-workflow.component';
import { WorkflowsResourceComponent } from './Workflows/components/workflows-resource.component';

/**
 * WorkflowsDashboardsModule — the Workflows app: the saved-workflow list and the Create Workflow
 * front door.
 *
 * A separate app rather than a tab inside AI, per D18/D19: the vocabulary rule puts *Workflow* in
 * front of end users, and filing the surface under "AI" would contradict that at the navigation
 * level. See `mockups/workflow-ux/front-door-v1.html` for the locked design.
 */
@NgModule({
    declarations: [
        WorkflowsDashboardComponent,
        CreateWorkflowComponent,
        WorkflowsResourceComponent,
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
        MJRefreshButtonComponent,
        MJStatBadgeComponent,
        ContainerDirectivesModule,
        SharedGenericModule,
    ],
    exports: [
        WorkflowsDashboardComponent,
        CreateWorkflowComponent,
        WorkflowsResourceComponent,
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
    const registrations = [WorkflowsDashboardComponent, WorkflowsResourceComponent];
    if (registrations.length === 0) {
        console.log('LoadWorkflowsDashboards: nothing registered');
    }
}
