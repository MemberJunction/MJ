import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJFilterPanelComponent,
  MJFilterPopoverComponent,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageSearchComponent,
  MJRefreshButtonComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { UserRoutinesModule } from '@memberjunction/ng-user-routines';

import { UserRoutinesResourceComponent } from './UserRoutines/user-routines-resource.component';

/**
 * RoutinesDashboardsModule — the Routines app: schedule AI agents to run on a
 * cron cadence with notifications. Thin Explorer chrome around the generic
 * `@memberjunction/ng-user-routines` command center.
 */
@NgModule({
  declarations: [
    UserRoutinesResourceComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJPageSearchComponent,
    MJFilterPopoverComponent,
    MJFilterPanelComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
    UserRoutinesModule,
  ],
  exports: [
    UserRoutinesResourceComponent,
  ],
})
export class RoutinesDashboardsModule { }
