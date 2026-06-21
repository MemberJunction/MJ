/**
 * OAuth2TokenManager — shared OAuth2 token acquisition + refresh helper for REST
 * integration connectors. Centralizes the token-endpoint round-trip so concrete
 * connectors never inline the grant logic.
 *
 * Supports the two grant types association/CRM APIs commonly expose:
 *   - `refresh_token` (primary) — exchange a long-lived refresh token for a fresh
 *     access token via `grant_type=refresh_token`.
 *   - `password` (fallback) — resource-owner password credentials grant via
 *     `grant_type=password` (username + password + scopes), for tenants that issue
 *     no refresh token.
 *
 * Client authentication is sent in the request body (`client_id`/`client_secret`)
 * which is the form GrowthZone and most modern OAuth2 servers accept; set
 * {@link OAuth2TokenRequest.UseBasicAuth} to instead send HTTP Basic on the
 * Authorization header.
 *
 * The manager caches the minted access token in memory and only re-mints when the
 * cached token is within {@link OAuth2TokenManager.RefreshBufferMs} of expiry, so a
 * single sync run does one token exchange and reuses it across every request.
 *
 * NOTE: this is a thin, crypto-free wrapper over the standard OAuth2 token endpoint
 * — there is no signing/HMAC here. It exists so connectors share ONE correct token
 * round-trip rather than each re-implementing `grant_type` form bodies.
 */

/** Which OAuth2 grant a token request should use. */
export type OAuth2GrantType = 'refresh_token' | 'password' | 'client_credentials';

/** Inputs needed to mint/refresh an OAuth2 access token. */
export interface OAuth2TokenRequest {
    /** Absolute token endpoint URL (e.g. `https://tenant.example.com/oauth/token`). */
    TokenURL: string;
    /** OAuth2 client identifier. */
    ClientId: string;
    /** OAuth2 client secret. */
    ClientSecret: string;
    /** Refresh token — required for the `refresh_token` grant. */
    RefreshToken?: string;
    /** Username — required for the `password` grant. */
    Username?: string;
    /** Password — required for the `password` grant. */
    Password?: string;
    /** Space- or comma-delimited scopes (sent as the `scopes`/`scope` param). */
    Scopes?: string;
    /** Parameter name carrying the scopes. Defaults to `scope`. */
    ScopeParam?: string;
    /**
     * Parameter name carrying the username in a `password` grant. Defaults to `username`
     * (RFC 6749 §4.3). Some Doorkeeper/WineBouncer deployments (e.g. Hivebrite) name it
     * `admin_email`; set this to that key when the vendor diverges from the spec name.
     */
    UsernameParam?: string;
    /** Send client_id/secret as HTTP Basic instead of in the form body. Default false. */
    UseBasicAuth?: boolean;
    /**
     * Extra `application/x-www-form-urlencoded` parameters appended to the grant body for vendors
     * whose token endpoint requires non-standard inputs — e.g. Auth0's `audience` on a
     * `client_credentials` grant, or a vendor-specific `resource`/`tenant` param. Applies to every
     * grant type; standard params (grant_type, client_id/secret, scope, refresh_token, username,
     * password) take precedence and are never overwritten by this map.
     */
    ExtraParams?: Record<string, string>;
    /** Request timeout in ms. Default 30000. */
    TimeoutMs?: number;
    /**
     * Extra `application/x-www-form-urlencoded` parameters appended to the grant body for vendors
     * whose token endpoint requires non-standard inputs — e.g. Auth0's `audience` on a
     * `client_credentials` grant, or a vendor-specific `resource`/`tenant` param. Applies to every
     * grant type; standard params (grant_type, client_id/secret, scope, refresh_token, username,
     * password) take precedence and are never overwritten by this map.
     */
    ExtraParams?: Record<string, string>;
}

/** A minted access token plus its derived expiry. */
export interface OAuth2Token {
    /** The bearer access token to send as `Authorization: Bearer {AccessToken}`. */
    AccessToken: string;
    /** The (possibly rotated) refresh token returned by the server, if any. */
    RefreshToken?: string;
    /** Token type reported by the server (typically `Bearer`). */
    TokenType: string;
    /** Absolute epoch-ms time at which this token should be considered expired. */
    ExpiresAt: number;
    /** Scopes granted by the server, if reported. */
    Scope?: string;
}

/** Raw OAuth2 token-endpoint response shape (RFC 6749 §5.1). */
interface OAuth2TokenResponse {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_EXPIRES_IN_S = 3_600;

/**
 * Stateful per-connection OAuth2 token manager. One instance caches one access
 * token; a connector typically holds a single manager and resets it when the
 * bound connection/config changes.
 */
export class OAuth2TokenManager {
    /** Skew window: re-mint when within this many ms of expiry. */
    public RefreshBufferMs = 60_000;

    private cached: OAuth2Token | null = null;
    /** The most recently seen refresh token (may rotate across refreshes). */
    private lastRefreshToken: string | undefined;

    /**
     * Returns a valid access token, minting/refreshing only when the cache is
     * empty or near expiry. `grant` selects which flow to run; pass
     * `'refresh_token'` as the primary and `'password'` as the documented
     * fallback when no refresh token is available.
     */
    public async GetAccessToken(req: OAuth2TokenRequest, grant: OAuth2GrantType): Promise<OAuth2Token> {
        if (this.cached && this.cached.ExpiresAt > Date.now() + this.RefreshBufferMs) {
            return this.cached;
        }
        const effectiveReq: OAuth2TokenRequest = {
            ...req,
            RefreshToken: this.lastRefreshToken ?? req.RefreshToken,
        };
        const token = await this.RequestToken(effectiveReq, grant);
        this.cached = token;
        this.lastRefreshToken = token.RefreshToken ?? effectiveReq.RefreshToken;
        return token;
    }

    /** Clears the cached token (e.g. on a 401, or when the bound config changes). */
    public Reset(): void {
        this.cached = null;
        this.lastRefreshToken = undefined;
    }

    /** Executes the token-endpoint round-trip for the chosen grant. */
    private async RequestToken(req: OAuth2TokenRequest, grant: OAuth2GrantType): Promise<OAuth2Token> {
        const body = this.BuildGrantBody(req, grant);
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        };
        if (req.UseBasicAuth) {
            const basic = Buffer.from(`${req.ClientId}:${req.ClientSecret}`).toString('base64');
            headers['Authorization'] = `Basic ${basic}`;
        } else {
            body.set('client_id', req.ClientId);
            body.set('client_secret', req.ClientSecret);
        }

        const response = await fetch(req.TokenURL, {
            method: 'POST',
            headers,
            body: body.toString(),
            signal: AbortSignal.timeout(req.TimeoutMs ?? DEFAULT_TIMEOUT_MS),
        });

        const text = await response.text();
        let parsed: OAuth2TokenResponse = {};
        if (text.length > 0) {
            try { parsed = JSON.parse(text) as OAuth2TokenResponse; } catch { parsed = {}; }
        }

        if (!response.ok || !parsed.access_token) {
            const detail = parsed.error_description ?? parsed.error ?? text.slice(0, 300);
            throw new Error(
                `OAuth2 ${grant} token request to ${req.TokenURL} failed: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`
            );
        }

        const expiresInS = typeof parsed.expires_in === 'number' ? parsed.expires_in : DEFAULT_EXPIRES_IN_S;
        return {
            AccessToken: parsed.access_token,
            RefreshToken: parsed.refresh_token ?? req.RefreshToken,
            TokenType: parsed.token_type ?? 'Bearer',
            ExpiresAt: Date.now() + expiresInS * 1_000,
            Scope: parsed.scope,
        };
    }

    /** Builds the `application/x-www-form-urlencoded` grant body for the chosen flow. */
    private BuildGrantBody(req: OAuth2TokenRequest, grant: OAuth2GrantType): URLSearchParams {
        const body = new URLSearchParams();
        // Seed vendor extra params FIRST so the standard params set below always take precedence
        // (a caller can never clobber grant_type/scope/credentials via ExtraParams).
        if (req.ExtraParams) {
            for (const [k, v] of Object.entries(req.ExtraParams)) {
                if (typeof v === 'string' && v.length > 0) body.set(k, v);
            }
        }
        body.set('grant_type', grant);
        const scopeParam = req.ScopeParam ?? 'scope';
        if (req.Scopes) body.set(scopeParam, req.Scopes);

        if (grant === 'client_credentials') {
            // grant_type=client_credentials carries no user/refresh params; client auth is
            // either in the body (default) or as HTTP Basic (UseBasicAuth) — handled by the caller.
            return body;
        }

        if (grant === 'refresh_token') {
            if (!req.RefreshToken) {
                throw new Error('OAuth2 refresh_token grant requires a RefreshToken.');
            }
            body.set('refresh_token', req.RefreshToken);
            return body;
        }

        // password grant
        if (!req.Username || !req.Password) {
            throw new Error('OAuth2 password grant requires Username and Password.');
        }
        body.set(req.UsernameParam ?? 'username', req.Username);
        body.set('password', req.Password);
        return body;
    }
}
