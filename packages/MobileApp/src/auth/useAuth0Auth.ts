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
 * Hook for the Auth0 OAuth flow.
 * Returns a `signIn()` that opens the in-app browser, completes the
 * Authorization Code + PKCE flow, and returns the persisted token bundle.
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
