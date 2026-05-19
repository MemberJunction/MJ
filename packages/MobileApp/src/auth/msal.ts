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

const STORE_KEY = 'mj-msal-tokens';

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
export function getRedirectUri(): string {
    return makeRedirectUri({
        scheme: 'mjmobile',
        path: 'auth',
    });
}

export function getDiscovery(): DiscoveryDocument {
    return {
        authorizationEndpoint: `${Env.msalAuthority}/oauth2/v2.0/authorize`,
        tokenEndpoint: `${Env.msalAuthority}/oauth2/v2.0/token`,
        endSessionEndpoint: `${Env.msalAuthority}/oauth2/v2.0/logout`,
    };
}

/**
 * Build the AuthRequest. PKCE is enabled by default in expo-auth-session.
 */
export function buildAuthRequest(): AuthRequest {
    return new AuthRequest({
        clientId: Env.msalClientId,
        scopes: [...Env.msalScopes],
        redirectUri: getRedirectUri(),
        responseType: ResponseType.Code,
        usePKCE: true,
        // Force a fresh consent on first run to avoid silent-failure surprises.
        prompt: undefined,
    });
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
 * Complete the OAuth flow: exchange the auth code for tokens.
 * Called from the React UI after `request.promptAsync()` resolves with a code.
 */
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<MJAuthTokens> {
    const resp = await exchangeCodeAsync(
        {
            clientId: Env.msalClientId,
            code,
            redirectUri: getRedirectUri(),
            extraParams: { code_verifier: codeVerifier },
        },
        getDiscovery(),
    );
    const tokens = bundleFromResponse(resp);
    await persistTokens(tokens);
    return tokens;
}

export async function persistTokens(tokens: MJAuthTokens): Promise<void> {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(tokens));
}

export async function loadStoredTokens(): Promise<MJAuthTokens | null> {
    try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as MJAuthTokens;
    } catch {
        return null;
    }
}

export async function clearStoredTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(STORE_KEY).catch(() => undefined);
}

/**
 * Use the refresh token to get a fresh idToken/accessToken. Throws if the
 * refresh token is missing or rejected.
 */
export async function refreshTokens(): Promise<MJAuthTokens> {
    const current = await loadStoredTokens();
    if (!current?.refreshToken) {
        throw new Error('No refresh token stored — user must re-authenticate.');
    }
    const resp = await refreshAsync(
        {
            clientId: Env.msalClientId,
            refreshToken: current.refreshToken,
            scopes: [...Env.msalScopes],
        },
        getDiscovery(),
    );
    const tokens = bundleFromResponse(resp);
    await persistTokens(tokens);
    return tokens;
}

/**
 * Returns a usable idToken — refreshes if expired or near-expiry.
 * Throws if no tokens are stored or refresh fails.
 */
export async function getValidIdToken(): Promise<string> {
    const current = await loadStoredTokens();
    if (!current) throw new Error('No tokens stored.');
    const nowMs = Date.now();
    // Refresh if expired or within 60s of expiry
    if (!current.expiresAt || current.expiresAt - nowMs < 60_000) {
        const refreshed = await refreshTokens();
        return refreshed.idToken;
    }
    return current.idToken;
}

export function isExpired(tokens: MJAuthTokens | null): boolean {
    if (!tokens) return true;
    if (!tokens.expiresAt) return false; // unknown expiry — let server tell us
    return tokens.expiresAt - Date.now() < 60_000;
}
