import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageBodyComponent,
  MJPageSearchComponent,
  MJFilterPopoverComponent,
  MJFilterPanelComponent,
  MJViewToggleComponent,
  MJStatBadgeComponent,
  MJRefreshButtonComponent,
  MJEmptyStateComponent,
  MJAlertComponent
} from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CredentialsModule } from '@memberjunction/ng-credentials';

// Credentials Components
import { CredentialsDashboardComponent } from './Credentials/credentials-dashboard.component';
import { CredentialsOverviewResourceComponent } from './Credentials/components/credentials-overview-resource.component';
import { CredentialsListResourceComponent } from './Credentials/components/credentials-list-resource.component';
import { CredentialsTypesResourceComponent } from './Credentials/components/credentials-types-resource.component';
import { CredentialsCategoriesResourceComponent } from './Credentials/components/credentials-categories-resource.component';
import { CredentialsAuditResourceComponent } from './Credentials/components/credentials-audit-resource.component';
import { GroupByPipe } from './Credentials/pipes/group-by.pipe';

/**
 * CredentialsDashboardsModule — Credentials feature area: dashboard,
 * overview, list, types, categories, and audit views.
 */
@NgModule({
  declarations: [
    CredentialsDashboardComponent,
    CredentialsOverviewResourceComponent,
    CredentialsListResourceComponent,
    CredentialsTypesResourceComponent,
    CredentialsCategoriesResourceComponent,
    CredentialsAuditResourceComponent,
    GroupByPipe
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MJButtonDirective,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageBodyComponent,
    MJPageSearchComponent,
    MJFilterPopoverComponent,
    MJFilterPanelComponent,
    MJViewToggleComponent,
    MJStatBadgeComponent,
    MJRefreshButtonComponent,
    MJEmptyStateComponent,
    MJAlertComponent,
    ContainerDirectivesModule,
    SharedGenericModule,
    CredentialsModule
  ],
  exports: [
    CredentialsDashboardComponent,
    CredentialsOverviewResourceComponent,
    CredentialsListResourceComponent,
    CredentialsTypesResourceComponent,
    CredentialsCategoriesResourceComponent,
    CredentialsAuditResourceComponent,
    GroupByPipe,
    CredentialsModule
  ]
})
export class CredentialsDashboardsModule { }
