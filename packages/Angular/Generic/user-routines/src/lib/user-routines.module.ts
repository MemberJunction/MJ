import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
    MJAlertComponent,
    MJButtonDirective,
    MJComboboxComponent,
    MJDropdownComponent,
    MJEmptyStateComponent,
    MJNumericInputComponent,
    MJPageSearchComponent,
    MJRefreshButtonComponent,
    MJSwitchComponent,
    MjSlidePanelComponent,
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { NgTreesModule } from '@memberjunction/ng-trees';

import { MyRoutinesListComponent } from './my-routines-list.component';
import { NewRoutineComponent } from './new-routine.component';
import { RoutineHistoryComponent } from './routine-history.component';
import { UserRoutinesCommandCenterComponent } from './user-routines-command-center.component';
import { UserRoutinesSlideInComponent } from './user-routines-slide-in.component';

/**
 * Module providing the reusable User Routines UI components.
 *
 * Components:
 * - `<mj-user-routines-command-center>` — Composite surface (list / new / history) most hosts embed
 * - `<mj-user-routines-slide-in>` — The command center in the standard right-edge slide-in panel
 * - `<mj-my-routines-list>` — Card list of the current user's routines with quick actions
 * - `<mj-new-routine>` — Create/edit form (agent tree picker, schedule, notifications, recipients)
 * - `<mj-user-routine-history>` — Run history for one routine with links to execution records
 *
 * Usage:
 * ```typescript
 * import { UserRoutinesModule } from '@memberjunction/ng-user-routines';
 *
 * @NgModule({ imports: [UserRoutinesModule] })
 * export class MyModule {}
 * ```
 */
@NgModule({
    declarations: [
        MyRoutinesListComponent,
        NewRoutineComponent,
        RoutineHistoryComponent,
        UserRoutinesCommandCenterComponent,
        UserRoutinesSlideInComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        MJAlertComponent,
        MJButtonDirective,
        MJComboboxComponent,
        MJDropdownComponent,
        MJEmptyStateComponent,
        MJNumericInputComponent,
        MJPageSearchComponent,
        MJRefreshButtonComponent,
        MJSwitchComponent,
        MjSlidePanelComponent,
        SharedGenericModule,
        CodeEditorModule,
        NgTreesModule,
    ],
    exports: [
        MyRoutinesListComponent,
        NewRoutineComponent,
        RoutineHistoryComponent,
        UserRoutinesCommandCenterComponent,
        UserRoutinesSlideInComponent,
    ],
})
export class UserRoutinesModule {}
