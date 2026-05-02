/**
 * MemberJunction Explorer Application Module
 *
 * Provides the complete branded Explorer application shell.
 * Use forRoot() to configure with environment settings.
 *
 * Example:
 *   imports: [
 *     MJExplorerAppModule.forRoot(environment)
 *   ]
 */

import { NgModule, ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MJExplorerAppComponent } from './explorer-app.component';
import { MJEnvironmentConfig, MJ_ENVIRONMENT, MJ_STARTUP_VALIDATION } from '@memberjunction/ng-bootstrap';
import { ShellModule, StartupValidationService, SystemValidationBannerComponent, ServerConnectivityBannerComponent } from '@memberjunction/ng-explorer-core';
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { FeedbackModule } from '@memberjunction/ng-feedback';
import { MJServiceWorkerModule, UpdateNotificationComponent } from '@memberjunction/ng-explorer-service-worker';

@NgModule({
  declarations: [
    MJExplorerAppComponent
  ],
  imports: [
    CommonModule,
    RouterModule,
    ShellModule,
    SystemValidationBannerComponent,  // Standalone component
    ServerConnectivityBannerComponent,  // Standalone component
    ConversationsModule,
    UpdateNotificationComponent,  // Standalone — bottom-right "Update available" toast (no-op when SW disabled)
    FeedbackModule.forRoot({
      appName: 'MemberJunction Explorer',
      title: 'Report an Issue',
      subtitle: 'Help us improve MemberJunction Explorer',
      fields: {
        showSeverity: true,
        showEnvironment: true,
        affectedAreas: [
          'Entities',
          'Views',
          'Queries',
          'Reports',
          'Dashboards',
          'User Management',
          'Admin Settings',
          'Navigation',
          'Search',
          'Other'
        ]
      }
    })
  ],
  exports: [
    MJExplorerAppComponent
  ]
})
export class MJExplorerAppModule {
  /**
   * Configure the Explorer App module with environment settings.
   * Should be called once in the root application module.
   */
  static forRoot(environment: MJEnvironmentConfig): ModuleWithProviders<MJExplorerAppModule> {
    // Pull in the SW providers conditionally based on the environment kill
    // switch. The module is always loaded (so the toast component injection
    // works), but `enabled: false` means no actual worker is registered and
    // SwUpdate.isEnabled returns false.
    const swModule = MJServiceWorkerModule.forRoot({
      enabled: !!(environment.production && environment.enableServiceWorker)
    });

    return {
      ngModule: MJExplorerAppModule,
      providers: [
        {
          provide: MJ_ENVIRONMENT,
          useValue: environment
        },
        {
          provide: MJ_STARTUP_VALIDATION,
          useClass: StartupValidationService
        },
        ...(swModule.providers ?? [])
      ]
    };
  }
}
