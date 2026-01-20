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
   * Authentication provider type
   */
  AUTH_TYPE: 'msal' | 'auth0';

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
   * Additional custom environment properties
   */
  [key: string]: any;
}
