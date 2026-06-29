/**
 * @fileoverview The durable returning-visitor anchor (RV3): a long-lived, opaque,
 * first-party cookie holding the server-minted `VisitorKey`. This is identity/auth
 * state (a visitor anchor), NOT a user preference — so a cookie is the right mechanism
 * (analogous to the auth-token exception, CLAUDE rule 9), and it must survive page
 * close (unlike the in-memory guest token). It is ONLY ever set when the widget's
 * `RememberReturningVisitors` toggle is on; the "forget me" control clears it (RV5).
 *
 * The cookie is scoped per widget key so two widgets on the same origin don't share a
 * visitor identity. The value is the opaque base64url key the server returns.
 *
 * @module @memberjunction/web-widget
 */

/** Cookie name prefix; the (sanitized) widget key is appended to scope it per deployment. */
const COOKIE_PREFIX = 'mjwv_';

/** Default cookie lifetime. The authoritative retention lives server-side (VisitorMemoryRetentionDays);
 *  this is just how long the browser keeps presenting the anchor. One year, refreshed on each visit. */
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Per-deployment cookie name; widget keys are restricted to a cookie-name-safe charset. */
function cookieName(widgetKey: string): string {
    return COOKIE_PREFIX + widgetKey.replace(/[^A-Za-z0-9_-]/g, '');
}

/** Reads the persisted VisitorKey for this widget, or undefined when absent / no document. */
export function readVisitorKey(widgetKey: string): string | undefined {
    if (typeof document === 'undefined' || !document.cookie) {
        return undefined;
    }
    const name = cookieName(widgetKey) + '=';
    for (const part of document.cookie.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(name)) {
            const raw = trimmed.slice(name.length);
            try {
                return decodeURIComponent(raw) || undefined;
            } catch {
                return raw || undefined;
            }
        }
    }
    return undefined;
}

/** Persists the VisitorKey as a long-lived first-party cookie (Secure on https, SameSite=Lax). */
export function writeVisitorKey(widgetKey: string, visitorKey: string): void {
    if (typeof document === 'undefined' || !visitorKey) {
        return;
    }
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
        `${cookieName(widgetKey)}=${encodeURIComponent(visitorKey)}` +
        `; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/** Clears the persisted VisitorKey (RV5 "forget me"). Expires the cookie immediately. */
export function clearVisitorKey(widgetKey: string): void {
    if (typeof document === 'undefined') {
        return;
    }
    document.cookie = `${cookieName(widgetKey)}=; Max-Age=0; Path=/; SameSite=Lax`;
}
