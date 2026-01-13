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
import { ShellModule, StartupValidationService, SystemValidationBannerComponent } from '@memberjunction/ng-explorer-core';

@NgModule({
  declarations: [
    MJExplorerAppComponent
  ],
  imports: [
    CommonModule,
    RouterModule,
    ShellModule,
    SystemValidationBannerComponent  // Standalone component
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
        }
      ]
    };
  }
}
