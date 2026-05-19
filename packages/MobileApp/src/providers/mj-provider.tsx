import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { GraphQLProviderConfigData, setupGraphQLClient } from '@memberjunction/graphql-dataprovider';
import { Env } from '@/config/env';
import {
    clearStoredTokens,
    getValidIdToken,
    isExpired,
    loadStoredTokens,
    type MJAuthTokens,
} from '@/auth/msal';

/**
 * MJ provider boot — wraps `setupGraphQLClient(config)` from
 * `@memberjunction/graphql-dataprovider`. Supports two auth paths:
 *
 *   1. **MSAL** (primary) — tokens come from Azure AD via expo-auth-session.
 *      Refresh happens silently when the idToken nears expiry.
 *   2. **Dev token paste** (fallback) — manual JWT pasted via the status
 *      banner. Useful for quick API testing without going through OAuth.
 *
 * The provider is "ready" once either path has produced a usable token AND
 * `setupGraphQLClient` has completed. Screens consume `useMJ()` and decide
 * whether to render real data or mocks based on `status === 'ready'`.
 */

export type MJStatus = 'loading' | 'no-token' | 'ready' | 'error';
export type AuthMethod = 'msal' | 'dev-token' | null;

type MJState = {
    status: MJStatus;
    error: Error | null;
    authMethod: AuthMethod;
    /** Boot the GraphQL client with a freshly-obtained MSAL token bundle. */
    bootWithMsalTokens: (tokens: MJAuthTokens) => Promise<void>;
    /** Persist a dev JWT and reboot the provider. */
    setDevToken: (token: string) => Promise<void>;
    /** Sign out: clear all stored tokens and revert to no-token state. */
    signOut: () => Promise<void>;
};

const DEV_TOKEN_KEY = 'mj-dev-token';

const MJContext = createContext<MJState | null>(null);

export function useMJ(): MJState {
    const ctx = useContext(MJContext);
    if (!ctx) throw new Error('useMJ must be used inside <MJProviderRoot>');
    return ctx;
}

export function MJProviderRoot({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<MJStatus>('loading');
    const [error, setError] = useState<Error | null>(null);
    const [authMethod, setAuthMethod] = useState<AuthMethod>(null);

    const bootWith = useCallback(async (token: string, method: AuthMethod) => {
        setStatus('loading');
        setError(null);
        try {
            const config = new GraphQLProviderConfigData(
                token,
                Env.graphqlUrl,
                Env.graphqlWsUrl,
                async () => {
                    // Refresh function — only useful for MSAL. Dev token has no refresh.
                    if (method === 'msal') {
                        try { return await getValidIdToken(); }
                        catch { return ''; }
                    }
                    return '';
                },
            );
            await setupGraphQLClient(config);
            setAuthMethod(method);
            setStatus('ready');
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setStatus('error');
        }
    }, []);

    const bootWithMsalTokens = useCallback(async (tokens: MJAuthTokens) => {
        if (!tokens.idToken) {
            throw new Error('MSAL response did not include an idToken.');
        }
        await bootWith(tokens.idToken, 'msal');
    }, [bootWith]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // 1. Try MSAL stored tokens
                const msalTokens = await loadStoredTokens();
                if (msalTokens && !isExpired(msalTokens)) {
                    if (!cancelled) await bootWith(msalTokens.idToken, 'msal');
                    return;
                }
                if (msalTokens) {
                    // Expired — attempt silent refresh
                    try {
                        const refreshed = await getValidIdToken();
                        if (refreshed && !cancelled) {
                            await bootWith(refreshed, 'msal');
                            return;
                        }
                    } catch {
                        // Refresh failed — fall through to other auth options
                        await clearStoredTokens();
                    }
                }

                // 2. Try stored dev token
                const stored = await SecureStore.getItemAsync(DEV_TOKEN_KEY);
                if (stored) {
                    if (!cancelled) await bootWith(stored, 'dev-token');
                    return;
                }

                // 3. Compile-time env token (committed JWT, rare)
                if (Env.devAuthToken) {
                    if (!cancelled) await bootWith(Env.devAuthToken, 'dev-token');
                    return;
                }

                // 4. Nothing — wait for user to sign in
                if (!cancelled) setStatus('no-token');
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e : new Error(String(e)));
                setStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, [bootWith]);

    const setDevToken = useCallback(async (token: string) => {
        await SecureStore.setItemAsync(DEV_TOKEN_KEY, token);
        await bootWith(token, 'dev-token');
    }, [bootWith]);

    const signOut = useCallback(async () => {
        await clearStoredTokens();
        await SecureStore.deleteItemAsync(DEV_TOKEN_KEY).catch(() => undefined);
        setAuthMethod(null);
        setError(null);
        setStatus('no-token');
    }, []);

    const value = useMemo<MJState>(() => ({
        status, error, authMethod,
        bootWithMsalTokens, setDevToken, signOut,
    }), [status, error, authMethod, bootWithMsalTokens, setDevToken, signOut]);

    return <MJContext.Provider value={value}>{children}</MJContext.Provider>;
}
