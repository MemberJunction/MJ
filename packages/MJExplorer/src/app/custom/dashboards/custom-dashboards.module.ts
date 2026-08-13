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
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { AngularSplitModule } from 'angular-split';
import { BoardGameNightDashboardComponent } from './board-game-night-dashboard.component';

/**
 * Hand-written dashboards for this app.
 *
 * The MJ UI components are **standalone**, so they are imported individually — there is no
 * `UIComponentsModule` barrel to pull in. `SharedGenericModule` supplies `mj-loading`. `CommonModule`
 * is here for the `number` pipe; the control-flow blocks (`@if` / `@for`) are built into the compiler
 * and need no import.
 */
@NgModule({
    declarations: [BoardGameNightDashboardComponent],
    imports: [
        CommonModule,
        FormsModule, // ngModel on the session search box
        SharedGenericModule,
        ConversationsModule, // <mj-conversation-chat-area> — the inline Scorekeeper panel
        AngularSplitModule, // <as-split> — the resizable panel layout
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJRefreshButtonComponent,
        MJStatBadgeComponent,
        MJAlertComponent,
        MJEmptyStateComponent,
        MJButtonDirective,
    ],
    exports: [BoardGameNightDashboardComponent],
})
export class CustomDashboardsModule {}

/**
 * Tree-shaking guard. `BaseDashboard` subclasses are resolved through `ClassFactory` by driver-class
 * name, so nothing references this component statically — without a live call the module is dropped
 * and the dashboard silently fails to resolve at runtime.
 */
export function LoadCustomDashboards(): void {
    // intentionally empty — importing this module is the point
}
