import { useCallback } from 'react';
import { useAuthRequest, ResponseType } from 'expo-auth-session';
import { Env } from '@/config/env';
import { ClearFreshLoginRequired, IsFreshLoginRequired } from '@/auth/fresh-login';
import {
    GetAuth0Discovery,
    GetAuth0RedirectUri,
    ExchangeAuth0Code,
    type Auth0Tokens,
} from '@/auth/auth0';

/**
 * React hook for the Auth0 login flow. Configures an expo-auth-session
 * Authorization Code + PKCE request against the Auth0 tenant and exposes a
 * `signIn()` that drives the in-app browser and token exchange.
 *
 * @returns An object with:
 *  - `signIn`: opens the browser, completes the PKCE flow, persists and
 *    returns the {@link Auth0Tokens} bundle. Throws if the request isn't ready,
 *    the user cancels/errors, or no code/verifier is present.
 *  - `ready`: `true` once the underlying auth request has initialized.
 */
export function UseAuth0Auth() {
    const discovery = GetAuth0Discovery();
    // After an explicit sign-out, force Auth0 to show the credentials form instead of silently
    // reusing the previous user's SSO cookie (see src/auth/fresh-login.ts). `extraParams` is part
    // of useAuthRequest's rebuild dependencies, so flipping the flag re-creates the request.
    // Read once per render, not subscribed: this relies on signOut() ending in status 'no-token',
    // which remounts the login screen. If this hook ever lives in a component that stays mounted
    // across sign-out, the read goes stale and needs a state hook instead.
    const freshLogin = IsFreshLoginRequired();
    const [request, , promptAsync] = useAuthRequest(
        {
            clientId: Env.auth0ClientId,
            scopes: [...Env.auth0Scopes],
            redirectUri: GetAuth0RedirectUri(),
            responseType: ResponseType.Code,
            usePKCE: true,
            extraParams: freshLogin ? { prompt: 'login' } : undefined,
        },
        discovery,
    );

    const signIn = useCallback(async (): Promise<Auth0Tokens> => {
        if (!request) {
            throw new Error('Auth request is still initializing — try again in a moment.');
        }
        const result = await promptAsync();
        if (result.type !== 'success') {
            const reason = result.type === 'error' ? result.error?.message : result.type;
            throw new Error(`Sign-in cancelled or failed: ${reason ?? 'unknown'}`);
        }
        const code = result.params.code;
        if (!code) throw new Error('No auth code returned by Auth0.');
        const verifier = request.codeVerifier;
        if (!verifier) throw new Error('PKCE code verifier missing.');
        const tokens = await ExchangeAuth0Code(code, verifier);
        ClearFreshLoginRequired();
        return tokens;
    }, [request, promptAsync]);

    return { signIn, ready: !!request };
}

/** @deprecated Use {@link UseAuth0Auth}. */
export function useAuth0Auth() {
    return UseAuth0Auth();
}
