import { InjectionToken } from '@angular/core';

/**
 * Injection token for MJ Environment Configuration
 */
export const MJ_ENVIRONMENT = new InjectionToken<MJEnvironmentConfig>('MJ_ENVIRONMENT');

/**
 * Injection token for optional startup validation service
 */
export const MJ_STARTUP_VALIDATION = new InjectionToken<MJStartupValidationService | null>('MJ_STARTUP_VALIDATION', {
  providedIn: 'root',
  factory: () => null // Default to null if not provided
});

/**
 * Optional interface for startup validation services
 * Applications can provide their own implementation to handle startup validation
 */
export interface MJStartupValidationService {
  /**
   * Runs validation checks during application startup
   */
  validateSystemSetup(): void;

  /**
   * Adds a validation issue for missing user roles
   */
  addNoRolesValidationIssue(): void;
}

/**
 * Environment configuration interface for MemberJunction Angular applications
 */
export interface MJEnvironmentConfig {
  /**
   * Whether the app is running in production mode
   */
  production: boolean;

  /**
   * GraphQL HTTP endpoint URL
   * @example 'http://localhost:4000/graphql'
   */
  GRAPHQL_URI: string;

  /**
   * GraphQL WebSocket endpoint URL for subscriptions
   * @example 'ws://localhost:4000/graphql'
   */
  GRAPHQL_WS_URI: string;

  /**
   * Authentication provider type — matches the key a provider registers with via
   * `@RegisterClass(MJAuthBase, '<type>')`. Built-in providers are listed for
   * autocomplete, but any string is valid so third parties can plug in their own
   * provider without editing this union. Resolved at runtime by string key through
   * `ClassFactory.GetRegistration(MJAuthBase, authType)`.
   */
  AUTH_TYPE: 'msal' | 'auth0' | 'okta' | 'cognito' | 'workos' | 'magic-link' | (string & {});

  /**
   * MemberJunction core schema name in the database
   * @default '__mj'
   */
  MJ_CORE_SCHEMA_NAME: string;

  /**
   * Microsoft Azure AD/Entra Client ID (for MSAL auth)
   */
  CLIENT_ID?: string;

  /**
   * Microsoft Azure AD/Entra Tenant ID (for MSAL auth)
   */
  TENANT_ID?: string;

  /**
   * Auth0 domain (for Auth0 auth)
   * @example 'myapp.us.auth0.com'
   */
  AUTH0_DOMAIN?: string;

  /**
   * Auth0 client ID (for Auth0 auth)
   */
  AUTH0_CLIENTID?: string;

  /**
   * WorkOS AuthKit client ID (for WorkOS auth)
   * @example 'client_01HABCDEF...'
   */
  WORKOS_CLIENTID?: string;

  /**
   * WorkOS OAuth redirect URI (for WorkOS auth). Must be registered in the WorkOS dashboard.
   * Defaults to `window.location.origin` when omitted.
   */
  WORKOS_REDIRECT_URI?: string;

  /**
   * WorkOS API hostname override (for WorkOS auth). Rarely needed — only for custom
   * domains or a proxy in front of the WorkOS API.
   */
  WORKOS_API_HOSTNAME?: string;

  /**
   * Enables WorkOS AuthKit dev mode (localStorage-backed session, tolerant of missing
   * third-party cookies). Use only in local development.
   */
  WORKOS_DEV_MODE?: boolean;

  /**
   * Master kill switch for the Angular service worker app-shell pre-cache.
   * Only effective when `production` is also true. When false (default),
   * `MJExplorerAppModule.forRoot()` does not register the service worker
   * and the update-notification toast is inert.
   *
   * Set to `true` only after you've also added the `serviceWorker` entry
   * to your `angular.json` build configuration so a real `ngsw-worker.js`
   * is generated. See `@memberjunction/ng-explorer-service-worker` README.
   */
  enableServiceWorker?: boolean;

  /**
   * Additional custom environment properties
   */
  [key: string]: any;
}
