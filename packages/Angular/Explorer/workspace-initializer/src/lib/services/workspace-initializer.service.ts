/**
 * Workspace Initializer Service
 *
 * Extracted from MJExplorer AppComponent to make workspace initialization reusable
 * across all MemberJunction applications. Handles GraphQL setup, user validation,
 * error classification, and auth retry logic.
 */

import { Injectable } from '@angular/core';
import { LogError, LogStatus, Metadata, RunView } from '@memberjunction/core';
import { MJThemeEntity } from '@memberjunction/core-entities';
import { setupGraphQLClient, GraphQLProviderConfigData, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJAuthBase, StandardUserInfo, AuthErrorType } from '@memberjunction/ng-auth-services';
import { SharedService } from '@memberjunction/ng-shared';
import { ThemeService } from '@memberjunction/ng-shared';
import { StartupValidationService } from '@memberjunction/ng-explorer-core';
import { WorkspaceEnvironment, WorkspaceInitResult, WorkspaceInitError } from '../models/workspace-types';
import { lastValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceInitializerService {
  private _sessionExpiredHandled = false;

  constructor(
    private authBase: MJAuthBase,
    private startupValidationService: StartupValidationService,
    private themeService: ThemeService
  ) { }

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
      config.OnAuthenticationError = (error: Error) => this.handleSessionExpired(error);

      await setupGraphQLClient(config);
      const end = Date.now();
      console.log(`[Workspace] GraphQL client setup complete: ${end - start}ms`);

      // Subscribe to cross-server cache invalidation events via GraphQL WebSocket
      // This enables real-time data refresh when other servers modify entities
      if (GraphQLDataProvider.Instance) {
          GraphQLDataProvider.Instance.SubscribeToCacheInvalidation();
          console.log('✓ Cache invalidation subscription active');
      }

      // 2. Load metadata and validate user
      await SharedService.RefreshData(true);
      await this.themeService.Initialize();
      await this.applyDefaultBrandTheme();
      // This service runs the one-time app login flow and is wiring up the global
      // Metadata.Provider via setupGraphQLClient above. There is no per-component
      // provider scope here.
      const md = new Metadata(); // global-provider-ok: bootstrap — wires the app's single global provider

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
      console.error('[Workspace] initializeWorkspace caught error:', err);
      console.error('[Workspace] Error message:', err?.message);
      console.error('[Workspace] Error stack:', err?.stack);
      if (err?.response?.errors) {
        console.error('[Workspace] GraphQL errors:', JSON.stringify(err.response.errors, null, 2));
      }
      const error = this.classifyError(err);
      console.error('[Workspace] Classified as:', error.type, '-', error.message);
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

    // Network / transport errors — see isTransportError for why this is not a
    // two-word substring test any more.
    if (WorkspaceInitializerService.isTransportError(err)) {
      return {
        type: 'network',
        message: err.message || WorkspaceInitializerService.describeTransportError(err),
        userMessage: 'We could not reach the server. Please check your connection and try again.',
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
   * Substrings that identify a failure of the TRANSPORT rather than of the request.
   *
   * Matched case-insensitively against every message we can find on the error (see
   * {@link collectErrorText}). Deliberately includes the gateway/timeout vocabulary: the
   * defect this replaces was a bootstrap that died on a metadata-status query timing out
   * behind a reverse proxy, whose GraphQL error says `504` / `Gateway Timeout` and contains
   * neither of the two words the old check looked for ("network", "fetch"). It was therefore
   * classified `unknown` with `shouldRetry: false` — the least accurate and least actionable
   * verdict available for the most transient class of failure there is.
   */
  private static readonly TRANSPORT_ERROR_SIGNATURES: readonly string[] = [
    'network',
    'fetch',
    'timeout',
    'timed out',
    'gateway',
    'bad gateway',
    'service unavailable',
    'socket hang up',
    'connection closed',
    'connection reset',
    'connection refused',
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'epipe',
    'load failed',           // Safari's opaque fetch failure
    'aborterror',
    'the operation was aborted',
    'err_network',
    'err_connection',
  ];

  /** HTTP statuses that mean "the request never got a real answer" — always retryable. */
  private static readonly TRANSPORT_STATUS_CODES: readonly number[] = [408, 425, 429, 502, 503, 504, 522, 524];

  /**
   * True when the error describes the transport failing rather than the server refusing.
   *
   * Checks three independent places, because a GraphQL client can put the interesting part
   * in any of them: an HTTP status (`err.status` / `err.statusCode` / `err.response.status`),
   * an `AbortError`-style `name`, and the collected message text from the error, its
   * `networkError`, its nested `error`, and every entry of a GraphQL `response.errors[]`.
   *
   * Static and public so the classification can be tested directly and reused without
   * standing up the service's four injected dependencies.
   */
  public static isTransportError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }
    const candidate = err as Record<string, unknown>;

    // 1. An HTTP status, wherever the client hung it.
    const statusCandidates = [
      candidate['status'],
      candidate['statusCode'],
      (candidate['response'] as Record<string, unknown> | undefined)?.['status'],
      (candidate['networkError'] as Record<string, unknown> | undefined)?.['statusCode'],
    ];
    for (const status of statusCandidates) {
      if (typeof status === 'number' && WorkspaceInitializerService.TRANSPORT_STATUS_CODES.includes(status)) {
        return true;
      }
    }

    // 2. A `networkError` property at all means the request did not complete.
    if (candidate['networkError'] != null) {
      return true;
    }

    // 3. The text, from everywhere it might hide.
    const text = WorkspaceInitializerService.collectErrorText(err).toLowerCase();
    if (!text) {
      return false;
    }
    if (WorkspaceInitializerService.TRANSPORT_ERROR_SIGNATURES.some(sig => text.includes(sig))) {
      return true;
    }
    // 4. A status code quoted IN the text. Apollo's standard message for a failed HTTP
    //    round trip is "Response not successful: Received status code 504" — no adjective
    //    anywhere in it, so the substrings above miss the most common shape of all. The
    //    number must sit next to the words "status" or "http" so that a message merely
    //    mentioning 504 for some other reason is not swept in.
    return WorkspaceInitializerService.TRANSPORT_STATUS_IN_TEXT.test(text);
  }

  /**
   * Matches a transport status code quoted inside an error message — "status code 504",
   * "HTTP 503", "status: 429". The `\D{0,12}` gap allows the punctuation and filler these
   * messages put between the label and the number without letting an unrelated number through.
   */
  private static readonly TRANSPORT_STATUS_IN_TEXT =
    /\b(?:status(?:\s*code)?|http)\D{0,12}(?:408|425|429|502|503|504|522|524)\b/i;

  /**
   * Gather every human-readable string attached to an error into one blob for matching.
   *
   * `depth` bounds the walk so a self-referential error object (which GraphQL clients do
   * produce — `err.error === err`) cannot spin here.
   */
  private static collectErrorText(err: unknown, depth = 0): string {
    if (err == null || depth > 3) {
      return '';
    }
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err !== 'object') {
      return '';
    }
    const candidate = err as Record<string, unknown>;
    const parts: string[] = [];

    for (const key of ['message', 'name', 'code', 'reason', 'statusText'] as const) {
      const value = candidate[key];
      if (typeof value === 'string') {
        parts.push(value);
      }
    }

    const response = candidate['response'] as Record<string, unknown> | undefined;
    const graphQLErrors = Array.isArray(candidate['errors'])
      ? candidate['errors']
      : Array.isArray(response?.['errors'])
        ? (response['errors'] as unknown[])
        : [];
    for (const entry of graphQLErrors) {
      parts.push(WorkspaceInitializerService.collectErrorText(entry, depth + 1));
    }

    for (const key of ['networkError', 'error', 'cause'] as const) {
      if (candidate[key] !== err) {
        parts.push(WorkspaceInitializerService.collectErrorText(candidate[key], depth + 1));
      }
    }

    return parts.filter(p => p.length > 0).join(' | ');
  }

  /**
   * A message for a transport error that carries no `message` of its own — a bare
   * `{ response: { status: 504 } }`, for example. Without this the surfaced text would be
   * empty and the banner would show nothing at all.
   */
  private static describeTransportError(err: unknown): string {
    const collected = WorkspaceInitializerService.collectErrorText(err);
    return collected.length > 0 ? collected : 'The server did not respond.';
  }

  /**
   * Org theming bootstrap: after metadata + ThemeService are ready, apply
   * the brand theme the user last chose (a starred theme they swapped to), falling back
   * to the org default. Derives the overlay via the theme engine and applies it always-on
   * (under the user's light/dark choice). Non-fatal — a missing Theme entity (older DBs)
   * or no theme simply leaves the stock MJ theme in place.
   */
  private async applyDefaultBrandTheme(): Promise<void> {
    try {
      const rv = new RunView();
      // Prefer the user's last-applied brand theme; fall back to the org default.
      const selectedId = this.themeService.GetSelectedBrandThemeId();
      let result = await rv.RunView<MJThemeEntity>({
        EntityName: 'MJ: Themes',
        ExtraFilter: selectedId ? `ID = '${selectedId}' AND Status = 'Active'` : "IsDefault = 1 AND Status = 'Active'",
        MaxRows: 1,
        ResultType: 'entity_object',
      });
      let theme = result.Success ? result.Results?.[0] : undefined;
      // User's selection is gone/inactive — fall back to the org default.
      if (!theme && selectedId) {
        result = await rv.RunView<MJThemeEntity>({
          EntityName: 'MJ: Themes',
          ExtraFilter: "IsDefault = 1 AND Status = 'Active'",
          MaxRows: 1,
          ResultType: 'entity_object',
        });
        theme = result.Success ? result.Results?.[0] : undefined;
      }
      if (!theme) {
        return;
      }
      this.themeService.RegisterBrandTheme({
        id: theme.ID,
        name: theme.Name,
        seeds: theme.Seeds,
        description: theme.Description ?? undefined,
        overrides: theme.Overrides ?? undefined,
        customCss: theme.CustomCSS ?? undefined,
        logos: {
          lightMarkURL: theme.LightMarkURL ?? undefined,
          darkMarkURL: theme.DarkMarkURL ?? undefined,
          wordmarkURL: theme.WordmarkURL ?? undefined,
          monochromeURL: theme.MonochromeURL ?? undefined,
        },
      });
      await this.themeService.ApplyBrandOverlay(theme.ID);
    } catch (err) {
      LogStatus(`Org brand theme bootstrap skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
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

      // Check for error message directly on the error object
      if (err.message && typeof err.message === 'string') {
        const message = err.message;
        return message.includes('does not have read permissions on User Roles');
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
   * Called when token refresh fails irrecoverably mid-session.
   * Shows a brief notification overlay, then forces logout to clear caches and redirect to login.
   */
  private handleSessionExpired(error: Error): void {
    // Guard against multiple concurrent calls (e.g., parallel GraphQL requests all failing)
    if (this._sessionExpiredHandled) {
      return;
    }
    this._sessionExpiredHandled = true;

    console.warn('[Workspace] Session expired, forcing re-authentication:', error.message);

    this.showSessionExpiredOverlay();

    // Give the user a moment to read the message, then logout
    setTimeout(async () => {
      try {
        await this.authBase.logout();
      } catch (logoutError) {
        console.error('[Workspace] Error during forced logout:', logoutError);
        // Last resort: reload the page to clear state
        window.location.reload();
      }
    }, 3000);
  }

  /**
   * Creates a simple DOM overlay notifying the user their session has expired.
   * Uses inline styles so it works regardless of Angular component encapsulation.
   */
  private showSessionExpiredOverlay(): void {
    const overlay = document.createElement('div');
    overlay.setAttribute('style', [
      'position: fixed',
      'inset: 0',
      'z-index: 999999',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'background: rgba(0, 0, 0, 0.6)',
      'backdrop-filter: blur(4px)',
    ].join(';'));

    const card = document.createElement('div');
    card.setAttribute('style', [
      'background: var(--mj-bg-surface, #fff)',
      'color: var(--mj-text-primary, #333)',
      'border-radius: 12px',
      'padding: 32px 40px',
      'max-width: 420px',
      'text-align: center',
      'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25)',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    ].join(';'));

    card.innerHTML = `
      <div style="font-size: 40px; margin-bottom: 16px;">
        <i class="fa-solid fa-clock" style="color: var(--mj-status-warning, #ef6c00);"></i>
      </div>
      <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600;">Session Expired</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: var(--mj-text-secondary, #666);">
        Your session has expired. You will be redirected to log in again.
      </p>
      <div style="font-size: 13px; color: var(--mj-text-muted, #999);">Redirecting...</div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
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
