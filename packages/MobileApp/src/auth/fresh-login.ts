/**
 * One-shot "next sign-in must show the login form" flag.
 *
 * Auth0 keeps an SSO cookie in the system auth session, so after a sign-out the next
 * `/authorize` request silently completes as the departing user unless the tenant session was
 * ended (`EndAuth0Session`) or the request carries `prompt=login`. Ending the tenant session
 * needs `mjmobile://auth` on the app's Allowed Logout URLs; until that is in place (and as a
 * belt-and-braces guard afterwards) `signOut()` raises this flag and `UseAuth0Auth` sends
 * `prompt=login` while it is set, then clears it on a successful sign-in. Ordinary launches never
 * set it, so they keep the silent SSO path.
 */
import { PrefsStorage } from '@/data/preferences';

/** MMKV key holding the flag. Lives outside the per-user `pref.*` keys so sign-out's wipe keeps it. */
export const FRESH_LOGIN_KEY = 'auth.freshLoginRequired';

/** Raise the flag: the next Auth0 sign-in must present the credentials form. */
export function MarkFreshLoginRequired(): void {
    PrefsStorage.set(FRESH_LOGIN_KEY, true);
}

/** Whether the next Auth0 sign-in must present the credentials form. */
export function IsFreshLoginRequired(): boolean {
    return PrefsStorage.getBoolean(FRESH_LOGIN_KEY) === true;
}

/** Lower the flag after a sign-in that honoured it. */
export function ClearFreshLoginRequired(): void {
    PrefsStorage.delete(FRESH_LOGIN_KEY);
}
