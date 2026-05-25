import { useCallback } from 'react';
import { useAuthRequest } from 'expo-auth-session';
import { ResponseType } from 'expo-auth-session';
import { Env } from '@/config/env';
import { getDiscovery, getRedirectUri, exchangeCodeForTokens, type MJAuthTokens } from '@/auth/msal';

/**
 * React hook wrapping the MSAL/Azure AD OAuth flow.
 *
 * Returns a `signIn()` that:
 *   1. Opens the in-app browser pointed at Azure AD
 *   2. Handles the `mjmobile://auth?code=…` callback
 *   3. Exchanges the code for tokens (PKCE handled internally)
 *   4. Returns the persisted token bundle
 *
 * Caller is responsible for booting the GraphQL provider with the idToken
 * after a successful sign-in.
 */
export function useMsalAuth() {
    const discovery = getDiscovery();
    const [request, , promptAsync] = useAuthRequest(
        {
            clientId: Env.msalClientId,
            scopes: [...Env.msalScopes],
            redirectUri: getRedirectUri(),
            responseType: ResponseType.Code,
            usePKCE: true,
        },
        discovery,
    );

    const signIn = useCallback(async (): Promise<MJAuthTokens> => {
        if (!request) {
            throw new Error('Auth request is still initializing — try again in a moment.');
        }
        const result = await promptAsync();
        if (result.type !== 'success') {
            const reason = result.type === 'error' ? result.error?.message : result.type;
            throw new Error(`Sign-in cancelled or failed: ${reason ?? 'unknown'}`);
        }
        const code = result.params.code;
        if (!code) throw new Error('No auth code returned by the provider.');
        const verifier = request.codeVerifier;
        if (!verifier) throw new Error('PKCE code verifier missing — auth request not configured correctly.');
        return exchangeCodeForTokens(code, verifier);
    }, [request, promptAsync]);

    return { signIn, ready: !!request };
}
