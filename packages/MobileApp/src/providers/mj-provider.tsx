import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { GraphQLProviderConfigData, setupGraphQLClient } from '@memberjunction/graphql-dataprovider';
import { Env } from '@/config/env';

/**
 * Mobile-side MJ provider boot.
 *
 * Wraps the `setupGraphQLClient(config)` flow from
 * @memberjunction/graphql-dataprovider with a React-friendly state machine and
 * persistent dev-token storage in expo-secure-store.
 *
 * - `loading` → initial state while we check for a stored / env token
 * - `no-token` → no token available; the app should prompt the user to paste one
 * - `ready` → provider is initialized; Metadata / RunView / agent calls work
 * - `error` → setup attempted and failed (network down, token invalid, etc.)
 *
 * Phase 2 will replace the dev-token flow with real OAuth via expo-auth-session.
 */

export type MJStatus = 'loading' | 'no-token' | 'ready' | 'error';

type MJState = {
    status: MJStatus;
    error: Error | null;
    /** Persist a dev JWT and reboot the provider. */
    setDevToken: (token: string) => Promise<void>;
    /** Clear any stored token and revert to the no-token state. */
    clearToken: () => Promise<void>;
};

const SECURE_STORE_KEY = 'mj-dev-token';

const MJContext = createContext<MJState | null>(null);

export function useMJ(): MJState {
    const ctx = useContext(MJContext);
    if (!ctx) throw new Error('useMJ must be used inside <MJProviderRoot>');
    return ctx;
}

export function MJProviderRoot({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<MJStatus>('loading');
    const [error, setError] = useState<Error | null>(null);

    const boot = useCallback(async (token: string) => {
        setStatus('loading');
        setError(null);
        try {
            const config = new GraphQLProviderConfigData(
                token,
                Env.graphqlUrl,
                Env.graphqlWsUrl,
                async () => {
                    // Phase 1: no refresh function. Token expiry => user re-pastes.
                    // Phase 2: implement a real refresh via expo-auth-session.
                    return '';
                },
            );
            await setupGraphQLClient(config);
            setStatus('ready');
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Check stored token first; fall back to compile-time env token.
                const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
                const token = stored || Env.devAuthToken || '';
                if (cancelled) return;
                if (!token) {
                    setStatus('no-token');
                    return;
                }
                await boot(token);
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e : new Error(String(e)));
                setStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, [boot]);

    const setDevToken = useCallback(async (token: string) => {
        await SecureStore.setItemAsync(SECURE_STORE_KEY, token);
        await boot(token);
    }, [boot]);

    const clearToken = useCallback(async () => {
        await SecureStore.deleteItemAsync(SECURE_STORE_KEY).catch(() => undefined);
        setStatus('no-token');
        setError(null);
    }, []);

    const value = useMemo<MJState>(() => ({
        status,
        error,
        setDevToken,
        clearToken,
    }), [status, error, setDevToken, clearToken]);

    return <MJContext.Provider value={value}>{children}</MJContext.Provider>;
}
