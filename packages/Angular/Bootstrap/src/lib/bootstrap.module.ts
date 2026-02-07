/**
 * MemberJunction 3.0 Bootstrap Module
 *
 * Provides the MJBootstrapComponent and all necessary services for MemberJunction Angular applications.
 * This module encapsulates all the authentication and initialization logic that was previously
 * spread across app.component.ts and app.module.ts.
 *
 * Usage:
 * ```typescript
 * @NgModule({
 *   imports: [
 *     BrowserModule,
 *     BrowserAnimationsModule,
 *     MJBootstrapModule.forRoot(environment),
 *     // ... other MJ modules
 *   ],
 *   bootstrap: [AppComponent]
 * })
 * export class AppModule {}
 * ```
 */

import { NgModule, ModuleWithProviders, APP_INITIALIZER } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJBootstrapComponent } from './bootstrap.component';
import { MJAuthShellComponent } from './components/auth-shell.component';
import { MJInitializationService } from './services/initialization.service';
import { MJEnvironmentConfig, MJ_ENVIRONMENT } from './bootstrap.types';
import { MJAuthBase } from '@memberjunction/ng-auth-services';

/**
 * Initialize auth provider before Angular routing starts
 * This ensures auth providers can process OAuth redirect responses before Angular's router
 * consumes the URL hash
 */
export function initializeAuth(authService: MJAuthBase): () => Promise<void> {
  return () => authService.initialize();
}

@NgModule({
  declarations: [
    MJBootstrapComponent,
    MJAuthShellComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    MJBootstrapComponent,
    MJAuthShellComponent
  ]
})
export class MJBootstrapModule {
  /**
   * Configure the bootstrap module with environment settings
   *
   * @param environment - Environment configuration for the application
   * @returns ModuleWithProviders with environment configuration and all services
   *
   * @example
   * ```typescript
   * import { environment } from '../environments/environment';
   *
   * @NgModule({
   *   imports: [
   *     MJBootstrapModule.forRoot(environment)
   *   ]
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(environment: MJEnvironmentConfig): ModuleWithProviders<MJBootstrapModule> {
    return {
      ngModule: MJBootstrapModule,
      providers: [
        { provide: MJ_ENVIRONMENT, useValue: environment },
        // MJInitializationService uses providedIn: 'root'
        {
          provide: APP_INITIALIZER,
          useFactory: initializeAuth,
          deps: [MJAuthBase],
          multi: true
        }
      ]
    };
  }
}
