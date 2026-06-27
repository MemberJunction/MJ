import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJComboboxComponent,
  MJDropdownComponent,
  MJSwitchComponent,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageBodyComponent,
  MJPageSearchComponent,
  MJFilterChipComponent,
  MJFilterPopoverComponent,
  MJFilterPanelComponent,
  MJStatBadgeComponent,
  MJRefreshButtonComponent,
  MJEmptyStateComponent
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CredentialsModule } from '@memberjunction/ng-credentials';
import { NgTreesModule } from '@memberjunction/ng-trees';
import { SchedulingModule } from '@memberjunction/ng-scheduling';

import { OverviewComponent } from './components/overview/overview.component';
import { PipelinesComponent } from './components/pipelines/pipelines.component';
import { ConnectionsComponent } from './components/connections/connections.component';
import { MappingWorkspaceComponent } from './components/mapping-workspace/mapping-workspace.component';
import { ActivityComponent } from './components/activity/activity.component';
import { SchedulesComponent } from './components/schedules/schedules.component';
import { IntegrationCardComponent } from './components/widgets/integration-card.component';
import { RunHistoryPanelComponent } from './components/widgets/run-history-panel.component';
import { VisualFieldEditorComponent } from './components/visual-editor/visual-editor.component';
import { IntegrationDataService } from './services/integration-data.service';

@NgModule({
  declarations: [
    OverviewComponent,
    PipelinesComponent,
    ConnectionsComponent,
    MappingWorkspaceComponent,
    ActivityComponent,
    SchedulesComponent,
    IntegrationCardComponent,
    RunHistoryPanelComponent,
    VisualFieldEditorComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJComboboxComponent,
    MJDropdownComponent,
    MJSwitchComponent,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJPageSearchComponent,
    MJFilterChipComponent,
    MJFilterPopoverComponent,
    MJFilterPanelComponent,
    MJStatBadgeComponent,
    MJRefreshButtonComponent,
    MJEmptyStateComponent,
    SharedGenericModule,
    CredentialsModule,
    NgTreesModule,
    SchedulingModule
  ],
  providers: [
    IntegrationDataService
  ],
  exports: [
    OverviewComponent,
    PipelinesComponent,
    ConnectionsComponent,
    MappingWorkspaceComponent,
    ActivityComponent,
    SchedulesComponent,
    IntegrationCardComponent,
    RunHistoryPanelComponent,
    VisualFieldEditorComponent
  ]
})
export class IntegrationModule { }
