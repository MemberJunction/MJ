/**
 * Expo Router native-intent interceptor.
 *
 * Why this exists (Android OAuth redirect fix):
 * On iOS, `ASWebAuthenticationSession` intercepts `mjmobile://auth?code=...&state=...` privately
 * inside the modal browser sheet and hands the URL straight to `expo-auth-session`'s `promptAsync()`
 * without firing a system URL open event to Expo Router.
 *
 * On Android, Chrome Custom Tabs returns to `MainActivity` via a standard `android.intent.action.VIEW`
 * Intent (`mjmobile://auth?code=...&state=...` on sign-in, or `mjmobile://auth` on `/v2/logout`).
 * Without this hook, Expo Router tries to match `/auth` as a screen route and lands on its built-in
 * 404 screen (`Unmatched Route: mjmobile://auth?code=...`).
 *
 * Note: `expo-auth-session` subscribes to React Native's `Linking` directly, so rewriting the path
 * here for Expo Router does not interfere with PKCE code extraction in `useAuth0Auth` / `useMsalAuth`.
 */
export function redirectSystemPath({
    path,
    initial,
}: {
    path: string;
    initial: boolean;
}): string {
    try {
        // Match `mjmobile://auth...`, `mjmobile:///auth...`, or `/auth...`
        const isOAuthCallback =
            /^\/?auth(\/|\?|$)/i.test(path) ||
            /^[a-z][a-z0-9+.-]*:\/\/\/?auth(\/|\?|$)/i.test(path);
        if (isOAuthCallback) {
            return initial ? '/' : '/login';
        }
    } catch {
        // Fall through and let Expo Router handle `path` normally.
    }
    return path;
}
