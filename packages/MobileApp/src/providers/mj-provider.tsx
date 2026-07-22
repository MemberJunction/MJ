import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { GraphQLProviderConfigData, setupGraphQLClient } from '@memberjunction/graphql-dataprovider';
import { Env } from '@/config/env';
import {
    clearAuth0Tokens,
    getValidAuth0IdToken,
    isAuth0Expired,
    loadAuth0Tokens,
    persistAuth0Tokens,
    type Auth0Tokens,
} from '@/auth/auth0';
import {
    clearStoredTokens as clearMsalTokens,
    getValidIdToken as getValidMsalIdToken,
    isExpired as isMsalExpired,
    loadStoredTokens as loadMsalTokens,
    type MJAuthTokens,
} from '@/auth/msal';

/**
 * MJ provider boot. Supports three auth paths in priority order:
 *
 *   1. Auth0 (primary) — OAuth via expo-auth-session against the
 *      BlueCypress dev Auth0 tenant.
 *   2. MSAL (Azure AD) — same library, different tenant. Available once
 *      the `mjmobile://auth` redirect URI is registered in Azure AD.
 *   3. Dev JWT paste (fallback) — manual JWT for ad-hoc API testing.
 *
 * On boot we attempt #1 → #2 → #3. The provider is "ready" once a token
 * has been produced AND setupGraphQLClient has completed. Screens consume
 * `useMJ()` and decide whether to render real data based on `status==='ready'`.
 */

/**
 * Provider lifecycle state:
 * - `loading`  — booting / obtaining a token / configuring the GraphQL client.
 * - `no-token` — no valid credential; the login screen should take over.
 * - `ready`    — a token was obtained AND `setupGraphQLClient` succeeded; data
 *                screens may render real data.
 * - `error`    — boot or client setup failed (see `error`).
 */
export type MJStatus = 'loading' | 'no-token' | 'ready' | 'error';

/** Which credential source produced the active token (`null` when signed out). */
export type AuthMethod = 'auth0' | 'msal' | 'dev-token' | null;

/** The value exposed by {@link MJContext} / {@link useMJ}. */
type MJState = {
    status: MJStatus;
    error: Error | null;
    authMethod: AuthMethod;
    /** Boot the GraphQL client with a freshly-obtained Auth0 token bundle. */
    bootWithAuth0Tokens: (tokens: Auth0Tokens) => Promise<void>;
    /** Boot the GraphQL client with a freshly-obtained MSAL token bundle. */
    bootWithMsalTokens: (tokens: MJAuthTokens) => Promise<void>;
    /** Persist a dev JWT and reboot the provider. */
    setDevToken: (token: string) => Promise<void>;
    /** Sign out: clear all stored tokens and revert to no-token state. */
    signOut: () => Promise<void>;
};

/** expo-secure-store key under which a manually-pasted dev JWT is persisted. */
const DEV_TOKEN_KEY = 'mj-dev-token';

const MJContext = createContext<MJState | null>(null);

/**
 * Access the MJ auth/GraphQL context.
 * @returns The current {@link MJState} (status, auth handlers, sign-out).
 * @throws If called outside a `<MJProviderRoot>` subtree.
 */
export function useMJ(): MJState {
    const ctx = useContext(MJContext);
    if (!ctx) throw new Error('useMJ must be used inside <MJProviderRoot>');
    return ctx;
}

/**
 * Root provider that owns the app's auth + GraphQL boot sequence and publishes
 * {@link MJState} through {@link MJContext}.
 *
 * On mount it attempts to restore a session in priority order (dev-seed →
 * Auth0 → MSAL → stored dev token → env dev token), refreshing expired tokens
 * where a refresh token exists and falling through to `no-token` otherwise.
 * For each candidate it calls {@link bootWith}, which constructs a
 * `GraphQLProviderConfigData` (including a `refreshTokenFunction` bound to the
 * active method) and runs `setupGraphQLClient` under a 15s timeout. Also
 * exposes imperative handlers to boot from a fresh Auth0/MSAL login, set a dev
 * token, and sign out.
 *
 * @param props.children The app subtree that consumes `useMJ()`.
 * @returns The context provider wrapping `children`.
 */
export function MJProviderRoot({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<MJStatus>('loading');
    const [error, setError] = useState<Error | null>(null);
    const [authMethod, setAuthMethod] = useState<AuthMethod>(null);

    /**
     * Core boot routine: configure and start the MJ GraphQL client with a
     * token. Builds `GraphQLProviderConfigData` with the REST/WS URLs from
     * `Env` and a `refreshTokenFunction` that, for `auth0`/`msal`, returns a
     * freshly-refreshed idToken (empty string on failure so the client can
     * surface a 401 rather than hang). Races `setupGraphQLClient` against a
     * 15s timeout so a hung MJAPI or bad token can't wedge the app in
     * `loading`. Sets `status`/`authMethod` on success, `error`/`status:error`
     * on failure.
     *
     * @param token The bearer idToken to authenticate the GraphQL client.
     * @param method Which auth source produced `token` (drives token refresh).
     */
    const bootWith = useCallback(async (token: string, method: AuthMethod) => {
        console.log(`[MJProvider] bootWith method=${method} tokenLen=${token.length}`);
        setStatus('loading');
        setError(null);
        try {
            const config = new GraphQLProviderConfigData(
                token,
                Env.graphqlUrl,
                Env.graphqlWsUrl,
                async () => {
                    if (method === 'auth0') {
                        try { return await getValidAuth0IdToken(); }
                        catch { return ''; }
                    }
                    if (method === 'msal') {
                        try { return await getValidMsalIdToken(); }
                        catch { return ''; }
                    }
                    return '';
                },
            );

            // Hard timeout so a hung MJAPI / bad token doesn't lock us in 'loading' forever.
            const SETUP_TIMEOUT_MS = 15_000;
            await Promise.race([
                setupGraphQLClient(config).then((p) => { console.log('[MJProvider] setupGraphQLClient ok'); return p; }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Connection to ${Env.graphqlUrl} timed out after ${SETUP_TIMEOUT_MS}ms`)), SETUP_TIMEOUT_MS),
                ),
            ]);
            setAuthMethod(method);
            setStatus('ready');
        } catch (e) {
            console.warn('[MJProvider] bootWith failed:', e);
            setError(e instanceof Error ? e : new Error(String(e)));
            setStatus('error');
        }
    }, []);

    /**
     * Boot the GraphQL client from a freshly-obtained Auth0 token bundle
     * (called by the login screen after `useAuth0Auth().signIn()`).
     * @param tokens The Auth0 bundle; its `idToken` is used as the bearer.
     * @throws If the bundle has no `idToken`.
     */
    const bootWithAuth0Tokens = useCallback(async (tokens: Auth0Tokens) => {
        if (!tokens.idToken) throw new Error('Auth0 response did not include an idToken.');
        await bootWith(tokens.idToken, 'auth0');
    }, [bootWith]);

    /**
     * Boot the GraphQL client from a freshly-obtained MSAL token bundle
     * (called by the login screen after `useMsalAuth().signIn()`).
     * @param tokens The MSAL bundle; its `idToken` is used as the bearer.
     * @throws If the bundle has no `idToken`.
     */
    const bootWithMsalTokens = useCallback(async (tokens: MJAuthTokens) => {
        if (!tokens.idToken) throw new Error('MSAL response did not include an idToken.');
        await bootWith(tokens.idToken, 'msal');
    }, [bootWith]);

    // One-time boot on mount: restore a session via the priority chain
    // (dev-seed → Auth0 → MSAL → stored dev token → env dev token → no-token).
    // `cancelled` guards against setState after unmount / re-run.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                console.log('[MJProvider] boot start');

                // 0. Dev-mode seeding (no-op in committed code): if env supplies an
                //    Auth0 bundle (id + refresh + access + exp) and secure-store has
                //    nothing yet, persist it once. From then on the normal Auth0 path
                //    in step 1 (load + auto-refresh via refreshAsync) takes over —
                //    same code that handles a real in-app OAuth login.
                if (Env.devAuthToken && Env.devAuth0RefreshToken && !(await loadAuth0Tokens())) {
                    console.log('[MJProvider] seeding Auth0 secure-store from env (dev)');
                    await persistAuth0Tokens({
                        idToken: Env.devAuthToken,
                        accessToken: Env.devAuth0AccessToken,
                        refreshToken: Env.devAuth0RefreshToken,
                        expiresAt: Env.devAuth0ExpiresAtMs,
                    });
                }

                // 1. Try Auth0 stored tokens
                const auth0Tokens = await loadAuth0Tokens();
                if (auth0Tokens && !isAuth0Expired(auth0Tokens)) {
                    console.log('[MJProvider] using stored Auth0 token');
                    if (!cancelled) await bootWith(auth0Tokens.idToken, 'auth0');
                    return;
                }
                if (auth0Tokens) {
                    console.log('[MJProvider] Auth0 token expired, attempting refresh');
                    try {
                        const refreshed = await getValidAuth0IdToken();
                        if (refreshed && !cancelled) {
                            await bootWith(refreshed, 'auth0');
                            return;
                        }
                    } catch (e) {
                        console.warn('[MJProvider] Auth0 refresh failed, clearing:', e);
                        await clearAuth0Tokens();
                    }
                }

                // 2. Try MSAL stored tokens
                const msalTokens = await loadMsalTokens();
                if (msalTokens && !isMsalExpired(msalTokens)) {
                    console.log('[MJProvider] using stored MSAL token');
                    if (!cancelled) await bootWith(msalTokens.idToken, 'msal');
                    return;
                }
                if (msalTokens) {
                    console.log('[MJProvider] MSAL token expired, attempting refresh');
                    try {
                        const refreshed = await getValidMsalIdToken();
                        if (refreshed && !cancelled) {
                            await bootWith(refreshed, 'msal');
                            return;
                        }
                    } catch (e) {
                        console.warn('[MJProvider] MSAL refresh failed, clearing:', e);
                        await clearMsalTokens();
                    }
                }

                // 3. Try stored dev token
                const stored = await SecureStore.getItemAsync(DEV_TOKEN_KEY);
                if (stored) {
                    console.log('[MJProvider] using stored dev token');
                    if (!cancelled) await bootWith(stored, 'dev-token');
                    return;
                }

                // 4. Compile-time env token (rare)
                if (Env.devAuthToken) {
                    console.log('[MJProvider] using env devAuthToken');
                    if (!cancelled) await bootWith(Env.devAuthToken, 'dev-token');
                    return;
                }

                // 5. Not authenticated — login screen takes over
                console.log('[MJProvider] no token found, going to no-token');
                if (!cancelled) setStatus('no-token');
            } catch (e) {
                if (cancelled) return;
                console.warn('[MJProvider] boot threw:', e);
                setError(e instanceof Error ? e : new Error(String(e)));
                setStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, [bootWith]);

    /**
     * Persist a manually-supplied dev JWT to secure-store and boot with it.
     * @param token The raw JWT to use (and remember across launches).
     */
    const setDevToken = useCallback(async (token: string) => {
        await SecureStore.setItemAsync(DEV_TOKEN_KEY, token);
        await bootWith(token, 'dev-token');
    }, [bootWith]);

    /**
     * Sign out: clear all stored credentials (Auth0, MSAL, and dev-token
     * secure-store keys) and revert to the `no-token` state so the login
     * screen takes over. Does not itself tear down the GraphQL client.
     */
    const signOut = useCallback(async () => {
        await clearAuth0Tokens();
        await clearMsalTokens();
        await SecureStore.deleteItemAsync(DEV_TOKEN_KEY).catch(() => undefined);
        setAuthMethod(null);
        setError(null);
        setStatus('no-token');
    }, []);

    const value = useMemo<MJState>(() => ({
        status, error, authMethod,
        bootWithAuth0Tokens, bootWithMsalTokens, setDevToken, signOut,
    }), [status, error, authMethod, bootWithAuth0Tokens, bootWithMsalTokens, setDevToken, signOut]);

    return <MJContext.Provider value={value}>{children}</MJContext.Provider>;
}
