import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { MJButtonDirective, MJPageHeaderComponent, MJPageLayoutComponent, MJPageBodyComponent, MJPageSearchComponent, MJFilterChipComponent, MJFilterPopoverComponent, MJFilterPanelComponent, MJRefreshButtonComponent, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { SharedDashboardWidgetsModule } from './shared/shared-dashboard-widgets.module';

// Communication Components
import { CommunicationDashboardComponent } from './Communication/communication-dashboard.component';
import { CommunicationMonitorResourceComponent } from './Communication/communication-monitor-resource.component';
import { CommunicationLogsResourceComponent } from './Communication/communication-logs-resource.component';
import { CommunicationProvidersResourceComponent } from './Communication/communication-providers-resource.component';
import { CommunicationRunsResourceComponent } from './Communication/communication-runs-resource.component';
import { CommunicationTemplatesResourceComponent } from './Communication/communication-templates-resource.component';
import { CommunicationsNewMessageResource } from './Communication/communication-new-message-resource.component';

/**
 * CommunicationDashboardsModule — Communication feature area: dashboard,
 * monitor, logs, providers, runs, and templates.
 */
@NgModule({
  declarations: [
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent,
    CommunicationTemplatesResourceComponent,
    CommunicationsNewMessageResource
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    SharedDashboardWidgetsModule,
    ListManagementModule,
    MJButtonDirective,
    MJEmptyStateComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageBodyComponent,
    MJPageSearchComponent,
    MJFilterChipComponent,
    MJFilterPopoverComponent,
    MJFilterPanelComponent,
    MJRefreshButtonComponent
  ],
  exports: [
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent,
    CommunicationTemplatesResourceComponent,
    CommunicationsNewMessageResource
  ]
})
export class CommunicationDashboardsModule { }
