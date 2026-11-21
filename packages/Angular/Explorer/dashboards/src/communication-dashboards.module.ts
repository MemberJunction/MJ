import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { MJButtonDirective, MJPageHeaderComponent, MJPageLayoutComponent, MJPageBodyComponent, MJPageSearchComponent, MJFilterChipComponent, MJFilterPopoverComponent, MJFilterPanelComponent, MJRefreshButtonComponent, MJEmptyStateComponent, MJLeftNavComponent, MJLeftNavContentComponent } from '@memberjunction/ng-ui-components';
import { SharedDashboardWidgetsModule } from './shared/shared-dashboard-widgets.module';

// Communication Components
import { CommunicationDashboardComponent } from './Communication/communication-dashboard.component';
import { CommunicationMonitorResourceComponent } from './Communication/communication-monitor-resource.component';
import { CommunicationLogsResourceComponent } from './Communication/communication-logs-resource.component';
import { CommunicationProvidersResourceComponent } from './Communication/communication-providers-resource.component';
import { CommunicationRunsResourceComponent } from './Communication/communication-runs-resource.component';
import { CommunicationTemplatesResourceComponent } from './Communication/communication-templates-resource.component';
import { CommunicationsNewMessageResource } from './Communication/communication-new-message-resource.component';
import { CommunicationsAdminDashboardComponent } from './Communications/communications-admin-dashboard.component';
import { CommunicationComplianceAdminResourceComponent } from './Communications/communication-compliance-admin-resource.component';
import { CommsGateSimulatorTabComponent } from './Communications/comms-gate-simulator-tab.component';
import { CommsSendersPermissionsTabComponent } from './Communications/comms-senders-permissions-tab.component';
import { CommsRegimesJurisdictionsTabComponent } from './Communications/comms-regimes-jurisdictions-tab.component';
import { CommsEndpointsSuppressionsTabComponent } from './Communications/comms-endpoints-suppressions-tab.component';
import { CommsPoliciesPrincipalsTabComponent } from './Communications/comms-policies-principals-tab.component';
import { CommsSendingDomainsTabComponent } from './Communications/comms-sending-domains-tab.component';

/**
 * CommunicationDashboardsModule — Communication feature area: dashboard,
 * monitor, logs, providers, runs, templates, and V2 Compliance Admin.
 */
@NgModule({
  declarations: [
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent,
    CommunicationTemplatesResourceComponent,
    CommunicationsNewMessageResource,
    CommunicationsAdminDashboardComponent,
    CommunicationComplianceAdminResourceComponent
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
    MJRefreshButtonComponent,
    MJLeftNavComponent,
    MJLeftNavContentComponent,
    CommsGateSimulatorTabComponent,
    CommsSendersPermissionsTabComponent,
    CommsRegimesJurisdictionsTabComponent,
    CommsEndpointsSuppressionsTabComponent,
    CommsPoliciesPrincipalsTabComponent,
    CommsSendingDomainsTabComponent
  ],
  exports: [
    CommunicationDashboardComponent,
    CommunicationMonitorResourceComponent,
    CommunicationLogsResourceComponent,
    CommunicationProvidersResourceComponent,
    CommunicationRunsResourceComponent,
    CommunicationTemplatesResourceComponent,
    CommunicationsNewMessageResource,
    CommunicationsAdminDashboardComponent,
    CommunicationComplianceAdminResourceComponent
  ]
})
export class CommunicationDashboardsModule { }
