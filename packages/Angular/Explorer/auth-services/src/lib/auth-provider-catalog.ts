/**
 * @fileoverview Pre-authentication provider catalog.
 *
 * The browser needs to know which identity providers exist BEFORE anyone is signed in,
 * so this module deliberately contains no Angular DI and no MJ data access — it runs
 * before `bootstrapModule()`, using only `fetch` and web storage.
 *
 * @module @memberjunction/ng-auth-services
 */

import { LogError, LogStatus, type PublicAuthProviderCatalog, type PublicAuthProviderInfo } from '@memberjunction/core';

/**
 * Storage key holding the provider the user last chose from the login picker.
 *
 * **Why web storage and not `UserInfoEngine`** (which is the rule for user preferences):
 * this value is read and written while the user is ANONYMOUS. There is no `UserInfo`, no
 * provider, and no API session to persist a preference into — resolving the provider is
 * precisely what has to happen before any of those exist. This is the same documented
 * exception the auth SDKs already rely on for their own session storage.
 */
const SELECTED_PROVIDER_KEY = 'mj_auth_selected_provider';

/**
 * Storage key set when a picker choice requires a page reload, so the reloaded app knows
 * to go straight into the provider's login flow instead of showing the picker again.
 */
const PENDING_LOGIN_KEY = 'mj_auth_pending_login';

/** How long to wait for the catalog before falling back to the compiled configuration. */
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

/**
 * How the app should bootstrap authentication, derived from the catalog plus any prior
 * user selection.
 */
export interface AuthProviderResolution {
  /**
   * The provider to wire into Angular DI for this page load. Null when the catalog is
   * empty, in which case the caller falls back to `environment.AUTH_TYPE`.
   */
  active: PublicAuthProviderInfo | null;

  /**
   * Every provider the user may choose from. Empty or single-entry lists mean the picker
   * should not render — one provider is not a choice.
   */
  choices: PublicAuthProviderInfo[];

  /** True when the picker should be shown (2+ providers available). */
  showPicker: boolean;

  /**
   * True when the previous page load persisted a selection and asked for the login flow to
   * start immediately. The surface should consume this once and call `login()`.
   */
  autoLogin: boolean;
}

/**
 * Fetches, caches, and resolves the public authentication-provider catalog.
 *
 * All members are static: this runs before the Angular injector exists.
 */
export class AuthProviderCatalog {
  /**
   * Catalog fetched during app startup, before the Angular module graph is evaluated.
   *
   * A holder is needed because `AuthServicesModule.forRoot(...)` runs at module-DEFINITION time
   * — while the `@NgModule` decorator's `imports` array is being built — which is far too early
   * to await anything. The app fetches the catalog first (see {@link Preload}) and the module
   * reads the result synchronously.
   */
  private static _preloaded: PublicAuthProviderInfo[] = [];

  /**
   * Fetches the catalog and stores it for {@link GetPreloaded}. Call this from the app's
   * bootstrap entry point BEFORE the root module is imported.
   */
  public static async Preload(graphqlUri: string, timeoutMs?: number): Promise<PublicAuthProviderInfo[]> {
    this._preloaded = await this.Fetch(graphqlUri, timeoutMs);
    return this._preloaded;
  }

  /** The catalog stored by {@link Preload}; empty when preloading never ran or found nothing. */
  public static GetPreloaded(): PublicAuthProviderInfo[] {
    return this._preloaded;
  }

  /**
   * Builds the catalog URL from the app's GraphQL endpoint. The catalog is served by the
   * same MJServer instance, mounted ahead of the auth middleware.
   */
  public static BuildCatalogUrl(graphqlUri: string): string {
    return new URL('/auth/providers', graphqlUri).toString();
  }

  /**
   * Fetches the public provider catalog.
   *
   * Never throws and never rejects: a deployment whose server predates this endpoint, or
   * whose network is briefly unavailable, must still reach its login screen through the
   * compiled `AUTH_TYPE` path. Failure is reported as an empty list.
   */
  public static async Fetch(graphqlUri: string, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS): Promise<PublicAuthProviderInfo[]> {
    const url = this.BuildCatalogUrl(graphqlUri);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { method: 'GET', signal: controller.signal, credentials: 'omit' });
      if (!response.ok) {
        // A 404 is the expected, benign answer from a server older than this feature.
        if (response.status !== 404) {
          LogError(`[Auth] Provider catalog request to ${url} failed with HTTP ${response.status}; falling back to configured AUTH_TYPE.`);
        }
        return [];
      }

      const body = (await response.json()) as PublicAuthProviderCatalog;
      return Array.isArray(body?.providers) ? body.providers : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`[Auth] Could not load the provider catalog from ${url} (${message}); falling back to configured AUTH_TYPE.`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Decides which provider this page load should bootstrap with.
   *
   * Precedence: the user's persisted choice, then the row flagged `IsDefault`, then the
   * first by sequence. A persisted choice that no longer exists in the catalog (the admin
   * disabled it) is discarded rather than honoured, so a removed provider cannot strand a
   * returning user on a login screen that can never succeed.
   */
  public static Resolve(catalog: PublicAuthProviderInfo[]): AuthProviderResolution {
    const choices = [...catalog].sort((a, b) => a.sequence - b.sequence || a.displayName.localeCompare(b.displayName));

    if (choices.length === 0) {
      return { active: null, choices: [], showPicker: false, autoLogin: false };
    }

    const selectedName = this.GetSelectedProviderName();
    const selected = selectedName ? choices.find((p) => p.name === selectedName) : undefined;
    if (selectedName && !selected) {
      LogStatus(`[Auth] Previously selected provider '${selectedName}' is no longer available; falling back to the default.`);
      this.ClearSelection();
    }

    const active = selected ?? choices.find((p) => p.isDefault) ?? choices[0];

    return {
      active,
      choices,
      showPicker: choices.length > 1,
      autoLogin: Boolean(selected) && this.consumePendingLogin()
    };
  }

  /**
   * Records the user's picker choice and reports whether the page must reload to apply it.
   *
   * A reload is required whenever the chosen provider differs from the one already wired
   * into DI: each browser SDK contributes Angular providers (interceptors, guards, config
   * tokens) at module-definition time, so switching providers cannot be done in a live
   * injector. Choosing the provider that is already active needs no reload — the caller
   * simply calls `login()`.
   */
  public static Select(provider: PublicAuthProviderInfo, activeProviderName: string | null): { requiresReload: boolean } {
    this.writeStorage(SELECTED_PROVIDER_KEY, provider.name);

    if (activeProviderName && provider.name === activeProviderName) {
      return { requiresReload: false };
    }

    this.writeStorage(PENDING_LOGIN_KEY, '1');
    return { requiresReload: true };
  }

  /** The provider name persisted by a previous picker choice, if any. */
  public static GetSelectedProviderName(): string | null {
    return this.readStorage(SELECTED_PROVIDER_KEY);
  }

  /** Forgets the persisted choice so the next load resolves the default again. */
  public static ClearSelection(): void {
    this.removeStorage(SELECTED_PROVIDER_KEY);
    this.removeStorage(PENDING_LOGIN_KEY);
  }

  /**
   * Reads and clears the "start login immediately" flag. Clearing on read is what keeps a
   * failed or cancelled login from re-triggering the redirect on every subsequent load.
   */
  private static consumePendingLogin(): boolean {
    const pending = this.readStorage(PENDING_LOGIN_KEY) === '1';
    if (pending) {
      this.removeStorage(PENDING_LOGIN_KEY);
    }
    return pending;
  }

  // ── Storage access ────────────────────────────────────────────────────────
  // Wrapped because localStorage throws on access in some privacy modes and in
  // sandboxed iframes. Auth must degrade to "ask every time", never crash.

  private static readStorage(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private static writeStorage(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Non-fatal: the choice simply won't survive this page load. */
    }
  }

  private static removeStorage(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Non-fatal. */
    }
  }
}
