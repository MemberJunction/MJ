import { useCallback } from 'react';
import { useAuthRequest, ResponseType } from 'expo-auth-session';
import { Env } from '@/config/env';
import {
    getAuth0Discovery,
    getAuth0RedirectUri,
    exchangeAuth0Code,
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
export function useAuth0Auth() {
    const discovery = getAuth0Discovery();
    const [request, , promptAsync] = useAuthRequest(
        {
            clientId: Env.auth0ClientId,
            scopes: [...Env.auth0Scopes],
            redirectUri: getAuth0RedirectUri(),
            responseType: ResponseType.Code,
            usePKCE: true,
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
        return exchangeAuth0Code(code, verifier);
    }, [request, promptAsync]);

    return { signIn, ready: !!request };
}
