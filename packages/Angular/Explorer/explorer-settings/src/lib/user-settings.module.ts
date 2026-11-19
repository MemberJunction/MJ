import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJEmptyStateComponent,
  MJAlertComponent
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { UserProfileSettingsComponent } from './user-profile-settings/user-profile-settings.component';
import { UserAppConfigComponent } from './user-app-config/user-app-config.component';
import { UserAppConfigContentComponent } from './user-app-config/user-app-config-content.component';

/**
 * Lightweight module exporting only the end-user profile and app-config components
 * used eagerly by the Explorer shell, profile dialog, and Home dashboard.
 * Admin settings dashboards live in ExplorerSettingsModule so they can lazy-load.
 */
@NgModule({
  declarations: [
    UserProfileSettingsComponent,
    UserAppConfigComponent,
    UserAppConfigContentComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    MJButtonDirective,
    MJEmptyStateComponent,
    MJAlertComponent
  ],
  exports: [
    UserProfileSettingsComponent,
    UserAppConfigComponent,
    UserAppConfigContentComponent
  ]
})
export class UserSettingsModule { }

export { UserProfileSettingsComponent } from './user-profile-settings/user-profile-settings.component';
export { UserAppConfigComponent } from './user-app-config/user-app-config.component';
export { UserAppConfigContentComponent } from './user-app-config/user-app-config-content.component';
