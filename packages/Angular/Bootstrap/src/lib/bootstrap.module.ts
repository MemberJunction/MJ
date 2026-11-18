/**
 * MemberJunction Bootstrap Module
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
import { MJMSALProvider } from '@memberjunction/ng-auth-services/msal';
import { MJAuth0Provider } from '@memberjunction/ng-auth-services/auth0';
import { MJOktaProvider } from '@memberjunction/ng-auth-services/okta';
import { MJCognitoProvider } from '@memberjunction/ng-auth-services/cognito';
import { MJWorkOSProvider } from '@memberjunction/ng-auth-services/workos';
import { MJMagicLinkProvider } from '@memberjunction/ng-auth-services/magic-link';
import { MJLocalDevProvider } from '@memberjunction/ng-auth-services/local-dev';

/**
 * Retains all built-in auth provider classes in non-code-split applications
 * that consume the full `@memberjunction/ng-bootstrap` bundle without calling
 * `PreloadActiveAuthProvider()`.
 */
export const EAGER_AUTH_PROVIDERS = [
  MJMSALProvider,
  MJAuth0Provider,
  MJOktaProvider,
  MJCognitoProvider,
  MJWorkOSProvider,
  MJMagicLinkProvider,
  MJLocalDevProvider,
] as const;

/**
 * Initialize auth provider before Angular routing starts
 * This ensures auth providers can process OAuth redirect responses before Angular's router
 * consumes the URL hash
 */
export function InitializeAuth(authService: MJAuthBase): () => Promise<void> {
  return () => authService.initialize();
}

/** @deprecated Use {@link InitializeAuth}. */
export function initializeAuth(authService: MJAuthBase): () => Promise<void> {
  return InitializeAuth(authService);
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
  static ForRoot(environment: MJEnvironmentConfig): ModuleWithProviders<MJBootstrapModule> {
    return {
      ngModule: MJBootstrapModule,
      providers: [
        { provide: MJ_ENVIRONMENT, useValue: environment },
        // MJInitializationService uses providedIn: 'root'
        {
          provide: APP_INITIALIZER,
          useFactory: InitializeAuth,
          deps: [MJAuthBase],
          multi: true
        }
      ]
    };
  }

  /** @deprecated Use {@link ForRoot}. */
  static forRoot(environment: MJEnvironmentConfig): ModuleWithProviders<MJBootstrapModule> {
    return this.ForRoot(environment);
  }
}
