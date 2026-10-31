/**
 * Auth0 browser-session teardown.
 *
 * The native login runs in the system auth session (ASWebAuthenticationSession on iOS,
 * Custom Tabs on Android), and that session keeps Auth0's SSO cookie after a successful
 * sign-in. Clearing the app's stored tokens does not touch that cookie, so the next
 * "Continue with Auth0" silently completes as the previous user. On a shared device that
 * means sign-out never actually hands the phone over. `EndAuth0Session` opens Auth0's
 * `/v2/logout` endpoint in the same auth session so the cookie is cleared, then returns
 * control to the app via the `mjmobile://auth` return URL.
 *
 * Auth0 setup: `mjmobile://auth` must be listed under the application's
 * **Allowed Logout URLs**, or Auth0 renders an error page instead of redirecting back.
 */
import * as WebBrowser from 'expo-web-browser';
import { Env } from '@/config/env';
import { GetAuth0Discovery, GetAuth0RedirectUri } from '@/auth/auth0';

/**
 * Build the Auth0 logout URL that clears the tenant session and returns to `returnTo`.
 *
 * @param returnTo The app URL Auth0 redirects to once the session is cleared.
 * @returns The fully-qualified `/v2/logout` URL.
 */
export function BuildAuth0LogoutUrl(returnTo: string): string {
    const endpoint = GetAuth0Discovery().endSessionEndpoint;
    if (!endpoint) throw new Error('Auth0 discovery has no endSessionEndpoint.');
    const params = new URLSearchParams({ client_id: Env.auth0ClientId, returnTo });
    return `${endpoint}?${params.toString()}`;
}

/**
 * Clear the Auth0 SSO session in the system auth session. Best-effort: resolves `true` when
 * Auth0 redirected back to the app, `false` when the user dismissed the sheet or the
 * browser could not be opened. Never throws; callers continue local sign-out regardless.
 */
export async function EndAuth0Session(): Promise<boolean> {
    const returnTo = GetAuth0RedirectUri();
    try {
        const result = await WebBrowser.openAuthSessionAsync(BuildAuth0LogoutUrl(returnTo), returnTo);
        return result.type === 'success';
    } catch (e) {
        console.warn('[auth0] logout session could not be opened; local sign-out continues:', e);
        return false;
    }
}
