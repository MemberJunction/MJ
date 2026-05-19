/**
 * Auth0 OAuth integration for the mobile app.
 *
 * Mirrors src/auth/msal.ts but targets the Auth0 OIDC endpoints rather than
 * Azure AD. Uses `expo-auth-session` for the in-app browser flow + PKCE.
 *
 * Required Auth0 setup (one-time, in Auth0 dashboard):
 *   1. Application type: Native
 *   2. Allowed Callback URLs: add `mjmobile://auth`
 *   3. Allowed Logout URLs (optional): add `mjmobile://auth`
 *   4. Refresh Token Rotation: enabled (Token Settings)
 *
 * Note on the ID token: Auth0's default flow returns an idToken with
 * aud = clientId. MJAPI validates this token against the configured Auth0
 * tenant. We pass the idToken (not accessToken) to the GraphQL provider —
 * matches the behavior of MJ Explorer's Auth0 provider.
 */

import {
    exchangeCodeAsync,
    makeRedirectUri,
    refreshAsync,
    type DiscoveryDocument,
    type TokenResponse,
} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Env } from '@/config/env';

const STORE_KEY = 'mj-auth0-tokens';

export type Auth0Tokens = {
    idToken: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
};

export function getAuth0RedirectUri(): string {
    return makeRedirectUri({ scheme: 'mjmobile', path: 'auth' });
}

export function getAuth0Discovery(): DiscoveryDocument {
    const domain = Env.auth0Domain;
    return {
        authorizationEndpoint: `https://${domain}/authorize`,
        tokenEndpoint: `https://${domain}/oauth/token`,
        endSessionEndpoint: `https://${domain}/v2/logout`,
    };
}

function readJwtExp(jwt: string): number {
    try {
        const [, payloadB64] = jwt.split('.');
        if (!payloadB64) return 0;
        const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
        const decoded = globalThis.atob ? globalThis.atob(padded) : Buffer.from(padded, 'base64').toString('binary');
        const json = JSON.parse(decoded) as { exp?: number };
        if (typeof json.exp === 'number') return json.exp * 1000;
    } catch {
        // fall through
    }
    return 0;
}

function bundleFromResponse(resp: TokenResponse): Auth0Tokens {
    const idToken = resp.idToken ?? '';
    return {
        idToken,
        accessToken: resp.accessToken,
        refreshToken: resp.refreshToken,
        expiresAt: readJwtExp(idToken),
    };
}

export async function exchangeAuth0Code(code: string, codeVerifier: string): Promise<Auth0Tokens> {
    const resp = await exchangeCodeAsync(
        {
            clientId: Env.auth0ClientId,
            code,
            redirectUri: getAuth0RedirectUri(),
            extraParams: { code_verifier: codeVerifier },
        },
        getAuth0Discovery(),
    );
    const tokens = bundleFromResponse(resp);
    await persistAuth0Tokens(tokens);
    return tokens;
}

export async function persistAuth0Tokens(tokens: Auth0Tokens): Promise<void> {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(tokens));
}

export async function loadAuth0Tokens(): Promise<Auth0Tokens | null> {
    try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        return raw ? JSON.parse(raw) as Auth0Tokens : null;
    } catch {
        return null;
    }
}

export async function clearAuth0Tokens(): Promise<void> {
    await SecureStore.deleteItemAsync(STORE_KEY).catch(() => undefined);
}

export async function refreshAuth0Tokens(): Promise<Auth0Tokens> {
    const current = await loadAuth0Tokens();
    if (!current?.refreshToken) {
        throw new Error('No Auth0 refresh token — re-authentication required.');
    }
    const resp = await refreshAsync(
        {
            clientId: Env.auth0ClientId,
            refreshToken: current.refreshToken,
            scopes: [...Env.auth0Scopes],
        },
        getAuth0Discovery(),
    );
    const tokens = bundleFromResponse(resp);
    await persistAuth0Tokens(tokens);
    return tokens;
}

export async function getValidAuth0IdToken(): Promise<string> {
    const current = await loadAuth0Tokens();
    if (!current) throw new Error('No Auth0 tokens stored.');
    const nowMs = Date.now();
    if (!current.expiresAt || current.expiresAt - nowMs < 60_000) {
        const refreshed = await refreshAuth0Tokens();
        return refreshed.idToken;
    }
    return current.idToken;
}

export function isAuth0Expired(tokens: Auth0Tokens | null): boolean {
    if (!tokens) return true;
    if (!tokens.expiresAt) return false;
    return tokens.expiresAt - Date.now() < 60_000;
}
