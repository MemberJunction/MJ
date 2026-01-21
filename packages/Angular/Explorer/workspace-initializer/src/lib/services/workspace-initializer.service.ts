/**
 * Workspace Initializer Service
 *
 * Extracted from MJExplorer AppComponent to make workspace initialization reusable
 * across all MemberJunction applications. Handles GraphQL setup, user validation,
 * error classification, and auth retry logic.
 */

import { Injectable } from '@angular/core';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { setupGraphQLClient, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { MJAuthBase, StandardUserInfo, AuthErrorType } from '@memberjunction/ng-auth-services';
import { SharedService } from '@memberjunction/ng-shared';
import { StartupValidationService } from '@memberjunction/ng-explorer-core';
import { WorkspaceEnvironment, WorkspaceInitResult, WorkspaceInitError } from '../models/workspace-types';
import { lastValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceInitializerService {
  constructor(
    private authBase: MJAuthBase,
    private startupValidationService: StartupValidationService
  ) {}

  /**
   * Initialize workspace with authenticated user
   * Replaces all the logic from AppComponent.handleLogin()
   */
  async initializeWorkspace(
    token: string,
    userInfo: StandardUserInfo,
    environment: WorkspaceEnvironment
  ): Promise<WorkspaceInitResult> {
    if (!token) {
      return {
        success: false,
        error: {
          type: 'unknown',
          message: 'No token provided',
          userMessage: 'Authentication token is missing. Please log in again.',
          shouldRetry: false
        }
      };
    }

    try {
      const start = Date.now();

      // 1. Setup GraphQL client with token refresh callback
      const config = new GraphQLProviderConfigData(
        token,
        environment.GRAPHQL_URI,
        environment.GRAPHQL_WS_URI,
        async () => {
          // v3.0 API - clean abstraction, no provider-specific logic!
          const token = await this.authBase.refreshToken();
          return token.idToken;
        },
        environment.MJ_CORE_SCHEMA_NAME
      );

      await setupGraphQLClient(config);
      const end = Date.now();
      console.log(`[Workspace] GraphQL client setup complete: ${end - start}ms`);

      // 2. Load metadata and validate user
      await SharedService.RefreshData(true);
      const md = new Metadata();

      if (!md.CurrentUser) {
        return {
          success: false,
          error: {
            type: 'no_access',
            message: "User doesn't have access to the application",
            userMessage: "You don't have access to the application, contact your system administrator.",
            shouldRetry: false
          }
        };
      }

      // 3. Run startup validation checks (with small delay for initialization)
      setTimeout(() => {
        this.startupValidationService.validateSystemSetup();
      }, 500);

      // Clear any JWT retry timestamps on successful login
      localStorage.removeItem('jwt-retry-ts');

      return {
        success: true
      };
    } catch (err: any) {
      const error = this.classifyError(err);
      return {
        success: false,
        error
      };
    }
  }

  /**
   * Classify errors into actionable types
   * Replaces AppComponent error handling logic
   */
  classifyError(err: any): WorkspaceInitError {
    // Check for no-roles error first (highest priority)
    if (this.isNoUserRolesError(err)) {
      // Add the validation issue through the service
      this.startupValidationService.addNoRolesValidationIssue();

      return {
        type: 'no_roles',
        message: err.message || 'No user roles assigned',
        userMessage: 'Your account does not have any roles assigned. Please contact your administrator.',
        shouldRetry: false
      };
    }

    // Check for access denied
    if (err.message?.includes("don't have access")) {
      return {
        type: 'no_access',
        message: err.message,
        userMessage: err.message,
        shouldRetry: false
      };
    }

    // Check for token expiration
    const authError = this.authBase.classifyError(err);
    if (authError.type === AuthErrorType.TOKEN_EXPIRED) {
      return {
        type: 'token_expired',
        message: authError.message,
        userMessage: authError.userMessage || 'Your session has expired. Please log in again.',
        shouldRetry: true
      };
    }

    // Network errors
    if (err.message?.includes('network') || err.message?.includes('fetch')) {
      return {
        type: 'network',
        message: err.message,
        userMessage: 'Network error. Please check your connection and try again.',
        shouldRetry: true
      };
    }

    // Unknown error
    return {
      type: 'unknown',
      message: err.message || 'Unknown error',
      userMessage: 'An unexpected error occurred. Please try again.',
      shouldRetry: false
    };
  }

  /**
   * Helper function to safely check if an error is related to missing user roles
   * Extracted from AppComponent.isNoUserRolesError()
   */
  private isNoUserRolesError(err: any): boolean {
    try {
      // Check if error has response with errors array
      if (!err || typeof err !== 'object') return false;

      // Check for GraphQL-style errors
      if (err.response && Array.isArray(err.response.errors)) {
        return err.response.errors.some((e: any) =>
          e && e.message && typeof e.message === 'string' &&
          e.message.includes('does not have read permissions on User Roles')
        );
      }

      // Check for specific "ResourceTypes" error which happens when user has no roles
      if (err.toString && typeof err.toString === 'function') {
        const errorString = err.toString();

        // This is the specific error we're seeing that indicates no roles
        if (errorString.includes("Cannot read properties of undefined (reading 'ResourceTypes')")) {
          return true;
        }
      }

      // Check for error message directly on the error object
      if (err.message && typeof err.message === 'string') {
        const message = err.message;
        return message.includes('does not have read permissions on User Roles') ||
               message.includes("Cannot read properties of undefined (reading 'ResourceTypes')");
      }

      // Check for nested error object
      if (err.error && typeof err.error === 'object') {
        return this.isNoUserRolesError(err.error);
      }

      return false;
    } catch (e) {
      console.error('Error while checking for user roles error:', e);
      return false;
    }
  }

  /**
   * Handle authentication retry with backoff
   * Replaces AppComponent.handleAuthRetry() logic
   */
  async handleAuthRetry(error: WorkspaceInitError, currentPath: string): Promise<boolean> {
    if (!error.shouldRetry) {
      return false;
    }

    const retryKey = 'auth-retry-dt';
    const lastRetryDateTime = localStorage.getItem(retryKey);
    const yesterday = +new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const retriedRecently = lastRetryDateTime && +new Date(lastRetryDateTime) > yesterday;

    if (!retriedRecently && error.type === 'token_expired') {
      LogStatus('JWT Expired, retrying once: ' + error.message);
      localStorage.setItem(retryKey, new Date().toISOString());

      const login$ = this.authBase.login({ appState: { target: currentPath } });
      await lastValueFrom(login$);

      return true;
    }

    return false;
  }
}
