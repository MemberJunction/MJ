/**
 * @fileoverview Fetches the published sign-in page design before anyone signs in.
 *
 * @module @memberjunction/ng-auth-services
 */

import { LogError, ResolveMJAPIURL } from '@memberjunction/core';
import { SanitizePublicLoginScreen, type PublicLoginScreen } from '@memberjunction/theme-engine';

/** Same bound as the provider catalog: a slow server delays the login screen briefly, never blocks it. */
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the default theme's published sign-in page (`GET /auth/login-screen`) once per page load.
 * Static, like {@link AuthProviderCatalog}, because it runs before the Angular injector exists. Never
 * rejects: an older server (404), a network failure or a bad body resolve to `null`, the stock page.
 */
export class LoginScreenLoader {
  private static _pending: Promise<PublicLoginScreen | null> | null = null;

  /** Starts the fetch, or returns the one already started (the bootstrap preload and the login screen share it). */
  public static Load(graphqlUri: string, timeoutMs?: number, mjapiUri?: string): Promise<PublicLoginScreen | null> {
    if (!this._pending) {
      this._pending = this.Fetch(graphqlUri, timeoutMs, mjapiUri);
    }
    return this._pending;
  }

  /**
   * The route is served by the same MJServer as GraphQL, mounted ahead of the auth middleware. With a
   * configured MJAPI URL (`MJAPI_URI`, MJ #5674) it is `<MJAPI URL>/auth/login-screen`; without one, the
   * pre-#5674 origin-relative URL.
   */
  public static BuildURL(graphqlUri: string, mjapiUri?: string): string {
    const mjapiUrl = ResolveMJAPIURL(mjapiUri);
    return mjapiUrl ? `${mjapiUrl}/auth/login-screen` : new URL('/auth/login-screen', graphqlUri).toString();
  }

  /** Fetches without caching, and sanitizes the answer again: this is what reaches the page. */
  public static async Fetch(graphqlUri: string, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS, mjapiUri?: string): Promise<PublicLoginScreen | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = this.BuildURL(graphqlUri, mjapiUri);
      const response = await fetch(url, { method: 'GET', signal: controller.signal, credentials: 'omit' });
      if (!response.ok) {
        // 404 is the expected answer from a server older than this feature.
        if (response.status !== 404) {
          LogError(`[Auth] Login screen request to ${url} failed with HTTP ${response.status}; using the stock login screen.`);
        }
        return null;
      }
      const body: unknown = await response.json();
      return body && typeof body === 'object' ? SanitizePublicLoginScreen(body) : null;
    } catch (error) {
      LogError(`[Auth] Could not load the login screen design (${error instanceof Error ? error.message : String(error)}); using the stock login screen.`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Forgets the started fetch. For tests. */
  public static Reset(): void {
    this._pending = null;
  }
}
