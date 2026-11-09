import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    MJAlertComponent,
    MJButtonDirective,
    MJConfirmDialogComponent,
    MJDialogComponent,
    MJEmptyStateComponent,
    MJFilterChipComponent,
    MJPageBodyComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
    MJTabNavComponent,
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { WorkQueueDashboardComponent } from './WorkQueue/work-queue-dashboard.component';
import { WorkQueueOverviewComponent } from './WorkQueue/components/work-queue-overview.component';
import { WorkQueueDeadLettersComponent } from './WorkQueue/components/work-queue-dead-letters.component';
import { WorkQueuePartitionsComponent } from './WorkQueue/components/work-queue-partitions.component';
import { WorkQueueBindingsComponent } from './WorkQueue/components/work-queue-bindings.component';
import { WorkQueueDiscardDialogComponent } from './WorkQueue/components/work-queue-discard-dialog.component';
import { WorkQueueOperatorService } from './WorkQueue/services/work-queue-operator.service';

/**
 * WorkQueueDashboardsModule — the Work Queue operator surface (spec 09b): overview, dead letters, partitions and
 * binding validation over the WorkQueue.* remote operations.
 */
@NgModule({
    declarations: [
        WorkQueueDashboardComponent,
        WorkQueueOverviewComponent,
        WorkQueueDeadLettersComponent,
        WorkQueuePartitionsComponent,
        WorkQueueBindingsComponent,
        WorkQueueDiscardDialogComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        MJAlertComponent,
        MJButtonDirective,
        MJConfirmDialogComponent,
        MJDialogComponent,
        MJEmptyStateComponent,
        MJFilterChipComponent,
        MJPageBodyComponent,
        MJPageHeaderComponent,
        MJPageLayoutComponent,
        MJRefreshButtonComponent,
        MJStatBadgeComponent,
        MJTabNavComponent,
        SharedGenericModule,
    ],
    providers: [WorkQueueOperatorService],
    exports: [WorkQueueDashboardComponent],
})
export class WorkQueueDashboardsModule {}

/** Keeps the @RegisterClass(BaseDashboard, 'WorkQueueDashboard') registration out of tree-shaking. */
export function LoadWorkQueueDashboard(): void {
    // No-op — referencing the class is enough for the bundler.
}
