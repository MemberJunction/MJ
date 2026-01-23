import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { WindowModule } from '@progress/kendo-angular-dialog';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { SimpleRecordListModule } from '@memberjunction/ng-simple-record-list';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { JoinGridModule } from '@memberjunction/ng-join-grid';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Shared module
import { SharedSettingsModule } from './shared/shared-settings.module';

// Main components
import { SettingsComponent } from './settings/settings.component';
import { SqlLoggingComponent } from './sql-logging/sql-logging.component';
import { UserManagementComponent } from './user-management/user-management.component';
import { RoleManagementComponent } from './role-management/role-management.component';
import { ApplicationManagementComponent } from './application-management/application-management.component';
import { EntityPermissionsComponent } from './entity-permissions/entity-permissions.component';
import { UserProfileSettingsComponent } from './user-profile-settings/user-profile-settings.component';

// Dialog components
import { RoleDialogComponent } from './role-management/role-dialog/role-dialog.component';
import { UserDialogComponent } from './user-management/user-dialog/user-dialog.component';
import { PermissionDialogComponent } from './entity-permissions/permission-dialog/permission-dialog.component';
import { ApplicationDialogComponent } from './application-management/application-dialog/application-dialog.component';
import { UserAppConfigComponent } from './user-app-config/user-app-config.component';
import { NotificationPreferencesComponent } from './notification-preferences/notification-preferences.component';

@NgModule({
  declarations: [
    // Main dashboard components
    SettingsComponent,
    SqlLoggingComponent,
    UserManagementComponent,
    RoleManagementComponent,
    ApplicationManagementComponent,
    EntityPermissionsComponent,
    UserProfileSettingsComponent,
    // Dialog components
    RoleDialogComponent,
    UserDialogComponent,
    PermissionDialogComponent,
    ApplicationDialogComponent,
    UserAppConfigComponent,
    NotificationPreferencesComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    EntityPermissionsModule,
    MJTabStripModule,
    EntityFormDialogModule,
    UserViewGridModule,
    SimpleRecordListModule,
    JoinGridModule,
    CodeEditorModule,
    SharedSettingsModule,
    SharedGenericModule,
    WindowModule
  ],
  exports: [
    // Main dashboard components
    SettingsComponent,
    SqlLoggingComponent,
    UserManagementComponent,
    RoleManagementComponent,
    ApplicationManagementComponent,
    EntityPermissionsComponent,
    UserProfileSettingsComponent,
    // Dialog components
    RoleDialogComponent,
    UserDialogComponent,
    PermissionDialogComponent,
    ApplicationDialogComponent,
    UserAppConfigComponent,
    NotificationPreferencesComponent
  ]
})
export class ExplorerSettingsModule { }
