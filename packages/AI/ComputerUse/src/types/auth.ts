/**
 * Authentication types for the Computer Use engine.
 *
 * Auth is scoped per-domain via DomainAuthBinding. Each binding says
 * "for these domains, use this auth method." Bindings are evaluated in
 * array order — first matching domain wins.
 *
 * AuthMethod is a discriminated union on the `Type` field, enabling
 * exhaustive switch handling in AuthHandler without any type casting.
 *
 * The auth system supports:
 * - Single-domain scenarios (one binding with Domains: ["*"])
 * - Multi-domain scenarios (different auth per domain)
 * - Global auth callbacks (SSO/MFA flows spanning multiple domains)
 * - Form-based login (credentials injected into Controller context)
 * - All standard HTTP auth mechanisms (Basic, Bearer, API Key, OAuth)
 * - Browser-state injection (cookies, localStorage)
 * - Custom callbacks for complex flows (MFA, CAPTCHA, OAuth popups)
 */

import type { CookieEntry } from './browser.js';
import type { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';

// ─── Auth Container ────────────────────────────────────────
/**
 * Top-level auth configuration on RunComputerUseParams.
 *
 * Contains both per-domain bindings and an optional global callback.
 * These are NOT mutually exclusive — the global callback runs once
 * after browser launch (for SSO/MFA), then per-domain bindings
 * are applied lazily on first navigation to each domain.
 */
export class ComputerUseAuthConfig {
    /**
     * Per-domain auth bindings. Evaluated in array order — first match wins.
     *
     * Order matters: specific domains should come before wildcard ["*"] fallback.
     *
     * @example Single-domain (all domains same auth):
     * ```
     * [{ Domains: ["*"], Method: { Type: 'Basic', ... } }]
     * ```
     *
     * @example Multi-domain (different auth per domain):
     * ```
     * [
     *   { Domains: ["app.internal.com"],  Method: { Type: 'Basic', ... } },
     *   { Domains: ["api.partner.com"],   Method: { Type: 'APIKey', ... } },
     *   { Domains: ["*"],                 Method: { Type: 'Bearer', ... } },
     * ]
     * ```
     */
    public Bindings: DomainAuthBinding[] = [];

    /**
     * Global auth callback — runs once after browser launch, before the main loop.
     * Use for complex flows that span multiple domains (SSO, MFA, OAuth redirects).
     * Runs IN ADDITION to domain bindings, not instead of them.
     */
    public GlobalCallback?: (context: AuthCallbackContext) => Promise<void>;
}

// ─── Domain-Scoped Auth Binding ────────────────────────────
/**
 * Maps a set of domains to a specific auth method.
 *
 * Domain patterns:
 * - `["*"]`               → default/fallback for all domains
 * - `["example.com"]`     → exact match
 * - `["*.example.com"]`   → wildcard subdomains
 * - `["a.com", "b.com"]`  → multiple domains, same auth
 */
export class DomainAuthBinding {
    /** Domain patterns this auth applies to */
    public Domains: string[] = [];
    /** The auth method to apply for matching domains */
    public Method: AuthMethod;

    constructor(domains: string[] = [], method?: AuthMethod) {
        this.Domains = domains;
        // Default to a placeholder — callers must set a real method
        this.Method = method ?? { Type: 'CustomCallback', Callback: async () => {} } as CustomCallbackAuthMethod;
    }
}

// ─── Discriminated Union of Auth Methods ───────────────────
/**
 * All supported authentication methods.
 * Discriminated on the `Type` field for exhaustive switch handling.
 */
export type AuthMethod =
    | BasicAuthMethod
    | BearerTokenAuthMethod
    | APIKeyHeaderAuthMethod
    | OAuthClientCredentialsAuthMethod
    | CookieInjectionAuthMethod
    | LocalStorageInjectionAuthMethod
    | CustomCallbackAuthMethod;

// ─── Individual Auth Method Types ──────────────────────────

/**
 * HTTP Basic Authentication or form-based login.
 *
 * Strategy determines HOW the credentials are applied:
 * - 'HttpHeader': Sets the HTTP Authorization header with Base64-encoded credentials
 *   on all requests to matching domains. Works for HTTP Basic Auth challenges.
 * - 'FormLogin': Does NOT set any headers. Instead, the engine injects the credentials
 *   into the Controller LLM's context so it can navigate the login form, type the
 *   username/password, and submit. Useful for testing web UIs with form-based auth.
 */
export class BasicAuthMethod {
    public readonly Type = 'Basic' as const;
    public Username: string = '';
    public Password: string = '';
    public Strategy: 'HttpHeader' | 'FormLogin' = 'FormLogin';
}

/**
 * Bearer token authentication.
 * Injects a token as an HTTP header on requests to matching domains.
 */
export class BearerTokenAuthMethod {
    public readonly Type = 'Bearer' as const;
    public Token: string = '';
    /** HTTP header name (default: 'Authorization') */
    public HeaderName: string = 'Authorization';
    /** Token prefix (default: 'Bearer') */
    public Prefix: string = 'Bearer';
}

/**
 * API key authentication via HTTP header.
 * Supports custom header names and optional prefixes.
 */
export class APIKeyHeaderAuthMethod {
    public readonly Type = 'APIKey' as const;
    public Key: string = '';
    /** HTTP header name (e.g., 'X-API-Key', 'Authorization') */
    public HeaderName: string = 'Authorization';
    /** Optional prefix before the key value (e.g., 'Api-Key ', 'Bearer ') */
    public Prefix?: string;
}

/**
 * OAuth2 Client Credentials grant.
 *
 * The AuthHandler acquires a token at runtime by POSTing to TokenUrl
 * with client_id, client_secret, and grant_type=client_credentials.
 * The acquired token is cached and injected as a Bearer header.
 */
export class OAuthClientCredentialsAuthMethod {
    public readonly Type = 'OAuthClientCredentials' as const;
    public ClientId: string = '';
    public ClientSecret: string = '';
    public TokenUrl: string = '';
    public Scope?: string;
}

/**
 * Cookie injection authentication.
 * Directly sets cookies on the browser context for matching domains.
 * Useful for bypassing login flows when you have valid session cookies.
 */
export class CookieInjectionAuthMethod {
    public readonly Type = 'Cookie' as const;
    public Cookies: CookieEntry[] = [];
}

/**
 * LocalStorage injection authentication.
 * Sets key-value pairs in localStorage for a specific domain.
 * Useful for SPA auth tokens stored in localStorage.
 */
export class LocalStorageInjectionAuthMethod {
    public readonly Type = 'LocalStorage' as const;
    public Entries: Record<string, string> = {};
}

/**
 * Custom callback authentication.
 * Called when the engine first navigates to a matching domain.
 * Receives full browser access for complex per-domain auth flows
 * (MFA, CAPTCHA, OAuth popups, etc.).
 */
export class CustomCallbackAuthMethod {
    public readonly Type = 'CustomCallback' as const;
    public Callback: (context: AuthCallbackContext) => Promise<void>;

    constructor(callback?: (context: AuthCallbackContext) => Promise<void>) {
        this.Callback = callback ?? (async () => {});
    }
}

// ─── Auth Callback Context ─────────────────────────────────
/**
 * Context passed to auth callbacks (both GlobalCallback and CustomCallback).
 * Provides full browser access for implementing complex auth flows.
 */
export class AuthCallbackContext {
    /** The browser adapter for interacting with the browser */
    public BrowserAdapter: BaseBrowserAdapter;
    /** The domain that triggered this auth callback */
    public TargetDomain: string;

    constructor(adapter: BaseBrowserAdapter, targetDomain: string) {
        this.BrowserAdapter = adapter;
        this.TargetDomain = targetDomain;
    }
}
