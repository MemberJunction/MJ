import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { WindowModule } from '@progress/kendo-angular-dialog';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { SimpleRecordListModule } from '@memberjunction/ng-simple-record-list';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { JoinGridModule } from '@memberjunction/ng-join-grid';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Shared module
import { SharedSettingsModule } from './shared/shared-settings.module';

// Main settings container
import { SettingsComponent } from './settings/settings.component';

// User-facing components
import { UserProfileSettingsComponent } from './user-profile-settings/user-profile-settings.component';
import { UserAppConfigComponent } from './user-app-config/user-app-config.component';
import { NotificationPreferencesComponent } from './notification-preferences/notification-preferences.component';

// New user settings components
import { GeneralSettingsComponent } from './general-settings/general-settings.component';
import { AccountInfoComponent } from './account-info/account-info.component';
import { ApplicationSettingsComponent } from './application-settings/application-settings.component';
import { AppearanceSettingsComponent } from './appearance-settings/appearance-settings.component';

// Admin components (used by Admin app dashboards)
import { SqlLoggingComponent } from './sql-logging/sql-logging.component';
import { UserManagementComponent } from './user-management/user-management.component';
import { RoleManagementComponent } from './role-management/role-management.component';
import { ApplicationManagementComponent } from './application-management/application-management.component';
import { EntityPermissionsComponent } from './entity-permissions/entity-permissions.component';

// Admin dialog components
import { RoleDialogComponent } from './role-management/role-dialog/role-dialog.component';
import { UserDialogComponent } from './user-management/user-dialog/user-dialog.component';
import { PermissionDialogComponent } from './entity-permissions/permission-dialog/permission-dialog.component';
import { ApplicationDialogComponent } from './application-management/application-dialog/application-dialog.component';

@NgModule({
  declarations: [
    // Main settings container
    SettingsComponent,
    // User-facing components
    UserProfileSettingsComponent,
    UserAppConfigComponent,
    NotificationPreferencesComponent,
    // New user settings components
    GeneralSettingsComponent,
    AccountInfoComponent,
    ApplicationSettingsComponent,
    AppearanceSettingsComponent,
    // Admin components (used by Admin app dashboards)
    SqlLoggingComponent,
    UserManagementComponent,
    RoleManagementComponent,
    ApplicationManagementComponent,
    EntityPermissionsComponent,
    // Admin dialog components
    RoleDialogComponent,
    UserDialogComponent,
    PermissionDialogComponent,
    ApplicationDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    EntityPermissionsModule,
    MJTabStripModule,
    EntityFormDialogModule,
    SimpleRecordListModule,
    JoinGridModule,
    CodeEditorModule,
    SharedSettingsModule,
    SharedGenericModule,
    WindowModule
  ],
  exports: [
    // Main settings container
    SettingsComponent,
    // User-facing components
    UserProfileSettingsComponent,
    UserAppConfigComponent,
    NotificationPreferencesComponent,
    // New user settings components
    GeneralSettingsComponent,
    AccountInfoComponent,
    ApplicationSettingsComponent,
    AppearanceSettingsComponent,
    // Admin components (used by Admin app dashboards)
    SqlLoggingComponent,
    UserManagementComponent,
    RoleManagementComponent,
    ApplicationManagementComponent,
    EntityPermissionsComponent,
    // Admin dialog components
    RoleDialogComponent,
    UserDialogComponent,
    PermissionDialogComponent,
    ApplicationDialogComponent
  ]
})
export class ExplorerSettingsModule { }
