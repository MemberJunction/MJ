/**
 * Manages per-domain authentication during browser navigation.
 *
 * Auth is applied lazily: on first navigation to each domain.
 * The AuthHandler matches the current navigation target against
 * configured bindings and applies the correct auth method.
 *
 * Lifecycle:
 * 1. Engine calls ApplyGlobalCallback() once after browser launch (for SSO/MFA)
 * 2. Before each navigation, engine calls ApplyAuthForDomain(domain, adapter)
 * 3. AuthHandler checks if auth was already applied for this domain
 * 4. If not, finds the first matching binding and applies its method
 * 5. On 401/403 errors, engine calls ResetDomain() to allow re-auth
 *
 * The FormLogin strategy is special: applyMethod() is a no-op for it.
 * Instead, the engine calls GetFormLoginCredentials() and injects
 * the credentials into the controller LLM's prompt context.
 */

import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import { NavigationGuard } from '../browser/NavigationGuard.js';
import {
    ComputerUseAuthConfig,
    DomainAuthBinding,
    AuthMethod,
    AuthCallbackContext,
    OAuthClientCredentialsAuthMethod,
} from '../types/auth.js';
import { FormLoginCredentials } from '../types/controller.js';

export class AuthHandler {
    private bindings: DomainAuthBinding[];
    private globalCallback?: (context: AuthCallbackContext) => Promise<void>;

    /** Tracks which domains have had auth applied (prevents re-application) */
    private appliedDomains: Set<string> = new Set();

    /** Cached OAuth tokens keyed by TokenUrl (not domain — multiple domains may share a provider) */
    private oauthTokenCache: Map<string, OAuthTokenCacheEntry> = new Map();

    constructor(authConfig: ComputerUseAuthConfig) {
        this.bindings = authConfig.Bindings;
        this.globalCallback = authConfig.GlobalCallback;
    }

    // ─── Primary API ───────────────────────────────────────

    /**
     * Apply auth for a domain if not already applied.
     * Called by the engine before each navigation.
     *
     * Finds the first matching binding (array order, first match wins)
     * and applies its auth method to the browser adapter.
     */
    public async ApplyAuthForDomain(
        domain: string,
        adapter: BaseBrowserAdapter
    ): Promise<void> {
        if (this.appliedDomains.has(domain)) return;

        const binding = this.findMatchingBinding(domain);
        if (!binding) return;

        await this.applyMethod(binding.Method, domain, adapter);
        this.appliedDomains.add(domain);
    }

    /**
     * Run the global auth callback once after browser launch.
     * Handles SSO/MFA flows that span multiple domains.
     * Runs IN ADDITION to per-domain bindings, not instead of them.
     */
    public async ApplyGlobalCallback(adapter: BaseBrowserAdapter): Promise<void> {
        if (!this.globalCallback) return;

        const context = new AuthCallbackContext(adapter, 'global');
        await this.globalCallback(context);
    }

    /**
     * Get FormLogin credentials for a domain, if configured.
     *
     * Called by the engine when building the controller prompt.
     * Returns credentials so the LLM can type them into a login form.
     * Returns undefined if no FormLogin binding matches this domain.
     */
    public GetFormLoginCredentials(domain: string): FormLoginCredentials | undefined {
        const binding = this.findMatchingBinding(domain);
        if (!binding) return undefined;

        const method = binding.Method;
        if (method.Type !== 'Basic' || method.Strategy !== 'FormLogin') return undefined;

        const credentials = new FormLoginCredentials();
        credentials.Username = method.Username;
        credentials.Password = method.Password;
        credentials.Domain = domain;
        return credentials;
    }

    /**
     * Extract LocalStorage auth entries for a domain, if configured.
     *
     * Returns the entries map and marks the domain as applied so that
     * ApplyAuthForDomain() won't try to apply it again. The engine uses
     * this to defer localStorage injection until AFTER navigating to the
     * domain (so the browser is on the correct origin for localStorage
     * scoping) and then reload.
     *
     * Returns undefined if no LocalStorage binding matches this domain.
     */
    public ExtractLocalStorageAuth(domain: string): Record<string, string> | undefined {
        const binding = this.findMatchingBinding(domain);
        if (!binding || binding.Method.Type !== 'LocalStorage') return undefined;

        // Mark as applied so ApplyAuthForDomain skips it
        this.appliedDomains.add(domain);
        return binding.Method.Entries;
    }

    /**
     * Extract all LocalStorage auth bindings for pre-population at browser launch.
     *
     * Returns an array of { Domains, Entries } for every binding whose method
     * is LocalStorage. The engine uses this to build BrowserConfig.InitialLocalStorage
     * so entries are injected via Playwright's storageState BEFORE any page loads,
     * avoiding race conditions with SPA auth SDKs.
     *
     * Does NOT mark domains as applied — that happens when ApplyAuthForDomain()
     * encounters the LocalStorage method (which is a no-op since entries are
     * already in the browser context).
     */
    public ExtractAllLocalStorageBindings(): { Domains: string[]; Entries: Record<string, string> }[] {
        return this.bindings
            .filter(b => b.Method.Type === 'LocalStorage')
            .map(b => ({
                Domains: b.Domains,
                Entries: (b.Method as { Type: 'LocalStorage'; Entries: Record<string, string> }).Entries,
            }));
    }

    /**
     * Reset auth state for a specific domain.
     * Called by the engine's error recovery when a 401/403 is detected.
     * Allows auth to be re-applied on the next navigation to this domain.
     */
    public ResetDomain(domain: string): void {
        this.appliedDomains.delete(domain);
    }

    /** Whether any bindings are configured */
    public get HasBindings(): boolean {
        return this.bindings.length > 0;
    }

    /** Whether a global callback is configured */
    public get HasGlobalCallback(): boolean {
        return this.globalCallback !== undefined;
    }

    // ─── Binding Resolution ────────────────────────────────

    /**
     * Find the first binding whose domain patterns match the given domain.
     * Bindings are evaluated in array order — first match wins.
     * Callers should put specific domains before wildcard ["*"] fallback.
     */
    private findMatchingBinding(domain: string): DomainAuthBinding | undefined {
        return this.bindings.find(binding =>
            binding.Domains.some(pattern =>
                NavigationGuard.MatchesDomain(domain, pattern)
            )
        );
    }

    // ─── Method Application ────────────────────────────────

    /**
     * Apply a specific auth method to the browser adapter for a domain.
     *
     * Exhaustive switch on the discriminated union Type field.
     * Each case maps to exactly one adapter API call (or no-op for FormLogin).
     */
    private async applyMethod(
        method: AuthMethod,
        domain: string,
        adapter: BaseBrowserAdapter
    ): Promise<void> {
        switch (method.Type) {
            case 'Bearer':
                await this.applyBearerAuth(method, domain, adapter);
                break;

            case 'APIKey':
                await this.applyApiKeyAuth(method, domain, adapter);
                break;

            case 'Cookie':
                await adapter.SetCookies(method.Cookies);
                break;

            case 'LocalStorage':
                await adapter.SetLocalStorage(domain, method.Entries);
                break;

            case 'OAuthClientCredentials':
                await this.applyOAuthAuth(method, domain, adapter);
                break;

            case 'Basic':
                await this.applyBasicAuth(method, domain, adapter);
                break;

            case 'CustomCallback':
                await this.applyCustomCallback(method, domain, adapter);
                break;

            default: {
                // Exhaustive check — compiler errors if a new AuthMethod type is added but not handled
                const _exhaustive: never = method;
                throw new Error(`Unhandled auth method type: ${JSON.stringify(_exhaustive)}`);
            }
        }
    }

    /**
     * Bearer token: inject as Authorization header.
     * Supports custom header names and prefixes.
     */
    private async applyBearerAuth(
        method: { Token: string; HeaderName: string; Prefix: string },
        domain: string,
        adapter: BaseBrowserAdapter
    ): Promise<void> {
        const headerValue = `${method.Prefix} ${method.Token}`.trim();
        await adapter.SetExtraHeaders(domain, {
            [method.HeaderName]: headerValue,
        });
    }

    /**
     * API Key: inject as a custom header with optional prefix.
     */
    private async applyApiKeyAuth(
        method: { Key: string; HeaderName: string; Prefix?: string },
        domain: string,
        adapter: BaseBrowserAdapter
    ): Promise<void> {
        const headerValue = method.Prefix ? `${method.Prefix}${method.Key}` : method.Key;
        await adapter.SetExtraHeaders(domain, {
            [method.HeaderName]: headerValue,
        });
    }

    /**
     * Basic auth with two strategies:
     * - HttpHeader: set Authorization header with Base64-encoded credentials
     * - FormLogin: no-op here — credentials are injected into Controller context
     *   via GetFormLoginCredentials() so the LLM navigates the login form
     */
    private async applyBasicAuth(
        method: { Username: string; Password: string; Strategy: 'HttpHeader' | 'FormLogin' },
        domain: string,
        adapter: BaseBrowserAdapter
    ): Promise<void> {
        if (method.Strategy === 'HttpHeader') {
            const encoded = Buffer.from(`${method.Username}:${method.Password}`).toString('base64');
            await adapter.SetExtraHeaders(domain, {
                'Authorization': `Basic ${encoded}`,
            });
        }
        // FormLogin: intentional no-op. Credentials are retrieved via
        // GetFormLoginCredentials() and injected into the controller prompt.
    }

    /**
     * OAuth2 Client Credentials: acquire token via POST, then inject as Bearer header.
     * Tokens are cached by TokenUrl (not domain).
     */
    private async applyOAuthAuth(
        method: OAuthClientCredentialsAuthMethod,
        domain: string,
        adapter: BaseBrowserAdapter
    ): Promise<void> {
        const token = await this.acquireOAuthToken(method);
        await adapter.SetExtraHeaders(domain, {
            'Authorization': `Bearer ${token}`,
        });
    }

    /**
     * Custom callback: invoke with full browser access.
     * Used for complex per-domain auth flows (MFA, CAPTCHA, OAuth popups).
     */
    private async applyCustomCallback(
        method: { Callback: (context: AuthCallbackContext) => Promise<void> },
        domain: string,
        adapter: BaseBrowserAdapter
    ): Promise<void> {
        const context = new AuthCallbackContext(adapter, domain);
        await method.Callback(context);
    }

    // ─── OAuth Token Acquisition ───────────────────────────

    /**
     * Acquire an OAuth2 access token via the client_credentials grant.
     *
     * POSTs to the token URL with client_id, client_secret, and
     * grant_type=client_credentials. Caches tokens by TokenUrl.
     *
     * Uses native fetch() (Node 18+).
     */
    private async acquireOAuthToken(
        method: OAuthClientCredentialsAuthMethod
    ): Promise<string> {
        // Check cache first
        const cached = this.oauthTokenCache.get(method.TokenUrl);
        if (cached && !this.isTokenExpired(cached)) {
            return cached.AccessToken;
        }

        // Build the token request body
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: method.ClientId,
            client_secret: method.ClientSecret,
        });
        if (method.Scope) {
            body.set('scope', method.Scope);
        }

        const response = await fetch(method.TokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `OAuth token acquisition failed (${response.status}): ${errorText}`
            );
        }

        const data = await response.json() as OAuthTokenResponse;

        if (!data.access_token) {
            throw new Error(
                `OAuth token response missing access_token: ${JSON.stringify(data)}`
            );
        }

        // Cache the token with expiry
        const entry: OAuthTokenCacheEntry = {
            AccessToken: data.access_token,
            ExpiresAt: data.expires_in
                ? Date.now() + (data.expires_in * 1000) - 60000 // Expire 1 minute early for safety
                : Date.now() + 3600000, // Default: 1 hour if no expiry provided
        };
        this.oauthTokenCache.set(method.TokenUrl, entry);

        return entry.AccessToken;
    }

    /**
     * Check if a cached token has expired.
     * Tokens are expired 1 minute early to account for clock skew.
     */
    private isTokenExpired(entry: OAuthTokenCacheEntry): boolean {
        return Date.now() >= entry.ExpiresAt;
    }
}

// ─── Internal Types ────────────────────────────────────────

/** Cached OAuth token with expiry timestamp */
interface OAuthTokenCacheEntry {
    AccessToken: string;
    ExpiresAt: number; // Unix timestamp in milliseconds
}

/** Standard OAuth2 token response shape */
interface OAuthTokenResponse {
    access_token: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
}
