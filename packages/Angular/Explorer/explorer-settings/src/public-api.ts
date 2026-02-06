/*
 * Public API Surface
 */

// Module
export * from './lib/module';

// Main dashboard components
export * from './lib/settings/settings.component';
export * from './lib/sql-logging/sql-logging.component';
export * from './lib/user-management/user-management.component';
export * from './lib/role-management/role-management.component';
export * from './lib/application-management/application-management.component';
export * from './lib/entity-permissions/entity-permissions.component';
export * from './lib/user-profile-settings/user-profile-settings.component';
export * from './lib/notification-preferences/notification-preferences.component';

// Settings sub-pages
export * from './lib/general-settings/general-settings.component';
export * from './lib/account-info/account-info.component';
export * from './lib/appearance-settings/appearance-settings.component';
export * from './lib/application-settings/application-settings.component';
export * from './lib/shared/settings-card.component';

// Dialog components
export * from './lib/role-management/role-dialog/role-dialog.component';
export * from './lib/user-management/user-dialog/user-dialog.component';
export * from './lib/entity-permissions/permission-dialog/permission-dialog.component';
export * from './lib/application-management/application-dialog/application-dialog.component';
export * from './lib/user-app-config/user-app-config.component';

// Tree-shaking prevention - import and call these functions to ensure components are registered
import { RoleManagementComponent } from './lib/role-management/role-management.component';
import { UserManagementComponent } from './lib/user-management/user-management.component';
import { EntityPermissionsComponent } from './lib/entity-permissions/entity-permissions.component';
import { ApplicationManagementComponent } from './lib/application-management/application-management.component';
import { SqlLoggingComponent } from './lib/sql-logging/sql-logging.component';
import { SettingsComponent } from './lib/settings/settings.component';

export function LoadRoleManagementDashboard() {
  // Prevents tree-shaking of RoleManagementComponent
  return RoleManagementComponent;
}

export function LoadUserManagementDashboard() {
  // Prevents tree-shaking of UserManagementComponent
  return UserManagementComponent;
}

export function LoadEntityPermissionsDashboard() {
  // Prevents tree-shaking of EntityPermissionsComponent
  return EntityPermissionsComponent;
}

export function LoadApplicationManagementDashboard() {
  // Prevents tree-shaking of ApplicationManagementComponent
  return ApplicationManagementComponent;
}

export function LoadSqlLoggingDashboard() {
  // Prevents tree-shaking of SqlLoggingComponent
  return SqlLoggingComponent;
}

export function LoadSettingsComponent() {
  // Prevents tree-shaking of SettingsComponent
  return SettingsComponent;
}

// Call all loader functions to register dashboard components
LoadRoleManagementDashboard();
LoadUserManagementDashboard();
LoadEntityPermissionsDashboard();
LoadApplicationManagementDashboard();
LoadSqlLoggingDashboard();
LoadSettingsComponent();
