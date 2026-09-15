/**
 * MSAL (Microsoft Authentication Library) auth for the mobile app.
 *
 * Uses `expo-auth-session` to implement the OAuth Authorization Code + PKCE
 * flow against Azure AD's OIDC endpoint. We never use the native MSAL SDK
 * (which would require a custom Expo dev client). The result is a self-
 * contained OIDC flow that returns an idToken — the same token MJ Explorer
 * uses today.
 *
 * Token lifecycle:
 *   - On sign-in, exchange the auth code for an idToken + accessToken + refreshToken.
 *   - Persist the bundle in expo-secure-store (keychain on iOS).
 *   - On reload, restore the bundle and refresh if the idToken is near expiry.
 *   - On 401 from MJAPI, refresh and retry once.
 *
 * Required Azure AD setup (see src/config/env.ts for the checklist).
 */

import {
    AuthRequest,
    exchangeCodeAsync,
    makeRedirectUri,
    refreshAsync,
    ResponseType,
    type DiscoveryDocument,
    type TokenResponse,
} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Env } from '@/config/env';

/** expo-secure-store key holding the persisted MSAL token bundle (JSON). */
const STORE_KEY = 'mj-msal-tokens';

/** Persisted MSAL/Azure AD token bundle. */
export type MJAuthTokens = {
    idToken: string;
    accessToken: string;
    refreshToken?: string;
    /** Epoch ms when idToken expires (or 0 if unknown). */
    expiresAt: number;
};

/**
 * The redirect URI is built from our app's `scheme` in app.json (`mjmobile`).
 * Computed once at module load — the same value is registered in Azure AD.
 */
export function GetRedirectUri(): string {
    return makeRedirectUri({
        scheme: 'mjmobile',
        path: 'auth',
    });
}

/** @deprecated Use {@link GetRedirectUri}. */
export function getRedirectUri(): string {
    return GetRedirectUri();
}

/**
 * Build the OIDC discovery document (authorize/token/logout endpoints) for the
 * configured Azure AD authority (`Env.msalAuthority`).
 */
export function GetDiscovery(): DiscoveryDocument {
    return {
        authorizationEndpoint: `${Env.msalAuthority}/oauth2/v2.0/authorize`,
        tokenEndpoint: `${Env.msalAuthority}/oauth2/v2.0/token`,
        endSessionEndpoint: `${Env.msalAuthority}/oauth2/v2.0/logout`,
    };
}

/** @deprecated Use {@link GetDiscovery}. */
export function getDiscovery(): DiscoveryDocument {
    return GetDiscovery();
}

/**
 * Build the AuthRequest. PKCE is enabled by default in expo-auth-session.
 */
export function BuildAuthRequest(): AuthRequest {
    return new AuthRequest({
        clientId: Env.msalClientId,
        scopes: [...Env.msalScopes],
        redirectUri: GetRedirectUri(),
        responseType: ResponseType.Code,
        usePKCE: true,
        // Force a fresh consent on first run to avoid silent-failure surprises.
        prompt: undefined,
    });
}

/** @deprecated Use {@link BuildAuthRequest}. */
export function buildAuthRequest(): AuthRequest {
    return BuildAuthRequest();
}

/**
 * Decode the JWT idToken to find its expiry. Strictly informational —
 * not a signature check (MJAPI validates that server-side).
 */
function readJwtExp(jwt: string): number {
    try {
        const [, payloadB64] = jwt.split('.');
        if (!payloadB64) return 0;
        // expo-crypto doesn't ship atob; do a minimal base64url decode ourselves.
        const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
        const decoded = globalThis.atob ? globalThis.atob(padded) : Buffer.from(padded, 'base64').toString('binary');
        const json = JSON.parse(decoded) as { exp?: number };
        if (typeof json.exp === 'number') return json.exp * 1000;
    } catch {
        // ignore — fall back to 0 (treat as "unknown expiry")
    }
    return 0;
}

/** Normalize an expo-auth-session token response into an {@link MJAuthTokens} bundle. */
function bundleFromResponse(resp: TokenResponse): MJAuthTokens {
    const idToken = resp.idToken ?? '';
    return {
        idToken,
        accessToken: resp.accessToken,
        refreshToken: resp.refreshToken,
        expiresAt: readJwtExp(idToken),
    };
}

/**
 * Complete the OAuth flow: exchange the auth code for tokens and persist them.
 * Called from the React UI after `request.promptAsync()` resolves with a code.
 * @param code The authorization code from the redirect.
 * @param codeVerifier The PKCE verifier generated for this request.
 * @returns The exchanged (and persisted) {@link MJAuthTokens}.
 * @throws If the token endpoint rejects the exchange.
 */
export async function ExchangeCodeForTokens(code: string, codeVerifier: string): Promise<MJAuthTokens> {
    const resp = await exchangeCodeAsync(
        {
            clientId: Env.msalClientId,
            code,
            redirectUri: GetRedirectUri(),
            extraParams: { code_verifier: codeVerifier },
        },
        GetDiscovery(),
    );
    const tokens = bundleFromResponse(resp);
    await PersistTokens(tokens);
    return tokens;
}

/** @deprecated Use {@link ExchangeCodeForTokens}. */
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<MJAuthTokens> {
    return ExchangeCodeForTokens(code, codeVerifier);
}

/** Persist the token bundle to expo-secure-store (keychain on iOS). */
export async function PersistTokens(tokens: MJAuthTokens): Promise<void> {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(tokens));
}

/** @deprecated Use {@link PersistTokens}. */
export async function persistTokens(tokens: MJAuthTokens): Promise<void> {
    return PersistTokens(tokens);
}

/**
 * Load the persisted token bundle from secure-store.
 * @returns The stored {@link MJAuthTokens}, or `null` if absent/unreadable.
 */
export async function LoadStoredTokens(): Promise<MJAuthTokens | null> {
    try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as MJAuthTokens;
    } catch {
        return null;
    }
}

/** @deprecated Use {@link LoadStoredTokens}. */
export async function loadStoredTokens(): Promise<MJAuthTokens | null> {
    return LoadStoredTokens();
}

/** Delete the persisted token bundle from secure-store (best-effort; swallows errors). */
export async function ClearStoredTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(STORE_KEY).catch(() => undefined);
}

/** @deprecated Use {@link ClearStoredTokens}. */
export async function clearStoredTokens(): Promise<void> {
    return ClearStoredTokens();
}

/**
 * Use the refresh token to get a fresh idToken/accessToken. Throws if the
 * refresh token is missing or rejected.
 */
export async function RefreshTokens(): Promise<MJAuthTokens> {
    const current = await LoadStoredTokens();
    if (!current?.refreshToken) {
        throw new Error('No refresh token stored — user must re-authenticate.');
    }
    const resp = await refreshAsync(
        {
            clientId: Env.msalClientId,
            refreshToken: current.refreshToken,
            scopes: [...Env.msalScopes],
        },
        GetDiscovery(),
    );
    const tokens = bundleFromResponse(resp);
    await PersistTokens(tokens);
    return tokens;
}

/** @deprecated Use {@link RefreshTokens}. */
export async function refreshTokens(): Promise<MJAuthTokens> {
    return RefreshTokens();
}

/**
 * Returns a usable idToken — refreshes if expired or near-expiry.
 * Throws if no tokens are stored or refresh fails.
 */
export async function GetValidIdToken(): Promise<string> {
    const current = await LoadStoredTokens();
    if (!current) throw new Error('No tokens stored.');
    const nowMs = Date.now();
    // Refresh if expired or within 60s of expiry
    if (!current.expiresAt || current.expiresAt - nowMs < 60_000) {
        const refreshed = await RefreshTokens();
        return refreshed.idToken;
    }
    return current.idToken;
}

/** @deprecated Use {@link GetValidIdToken}. */
export async function getValidIdToken(): Promise<string> {
    return GetValidIdToken();
}

/**
 * Whether a bundle should be treated as expired (missing, or within 60s of
 * `expiresAt`). Unknown expiry (`expiresAt === 0`) is treated as NOT expired —
 * defer to the server.
 * @param tokens The bundle to test (or `null`).
 * @returns `true` when the caller should refresh / re-authenticate.
 */
export function IsExpired(tokens: MJAuthTokens | null): boolean {
    if (!tokens) return true;
    if (!tokens.expiresAt) return false; // unknown expiry — let server tell us
    return tokens.expiresAt - Date.now() < 60_000;
}

/** @deprecated Use {@link IsExpired}. */
export function isExpired(tokens: MJAuthTokens | null): boolean {
    return IsExpired(tokens);
}
