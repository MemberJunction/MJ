/**
 * @fileoverview What the login Access drivers share: the user name and password out of the resolved `MJ: Credentials`
 * secret, the session's origins, and the {@link AccessArtifact} a cookie session becomes. Cookies are kept in a
 * `tough-cookie` jar (RFC 6265 parsing and matching, public suffixes included).
 *
 * A login produces cookies; the pipeline's fetchers take headers. So a session is handed on as one `Cookie`
 * header, sent only to the session's origins (`SessionOrigins`, else the source URL's origin), and it expires
 * with the first of its cookies to expire or after `SessionTtlMinutes`, whichever is sooner, so the resolver
 * logs in again before the site starts answering with its login page.
 *
 * @module @memberjunction/content-pipeline
 */

import { Cookie, CookieJar } from 'tough-cookie';
import { AccessArtifact, AccessRequest } from '@memberjunction/content-pipeline-base';

/** What a login was told to sign in with: `username`/`password` (or `user`, `email`, `login`; `pass`) from the secret. */
export function LoginCredentials(request: AccessRequest, driver: string): { Username: string; Password: string } {
    const pick = (...keys: string[]) => {
        for (const key of keys) {
            const value = request.Secret[key];
            if (typeof value === 'string' && value.length > 0) {
                return value;
            }
        }
        return null;
    };
    const username = pick('username', 'user', 'email', 'login', 'userName');
    const password = pick('password', 'pass');
    if (!username || !password) {
        throw new Error(
            `${driver}: the credential for Content Source '${request.ContentSourceID}' (role '${request.Role}') needs a username and a password. ` +
                "Map one in the source's Configuration.AccessCredentials; the secret itself lives in MJ: Credentials.",
        );
    }
    return { Username: username, Password: password };
}

/** The origins a session goes to: `SessionOrigins` (comma- or space-separated), else the source URL's origin. */
export function SessionOrigins(request: AccessRequest): string[] {
    const listed = (request.Parameters.SessionOrigins ?? '')
        .split(/[\s,]+/)
        .filter((o) => o.length > 0)
        .map((o) => OriginOf(o))
        .filter((o): o is string => o !== null);
    if (listed.length > 0) {
        return [...new Set(listed)];
    }
    const own = OriginOf(request.URL);
    return own ? [own] : [];
}

/** `SessionTtlMinutes` as ms, or null when unset or not a positive number. */
export function SessionTtlMs(request: AccessRequest): number | null {
    const minutes = Number(request.Parameters.SessionTtlMinutes);
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : null;
}

/**
 * The cookies a jar holds for the session's origins (`tough-cookie`'s RFC 6265 matching: domain, public suffixes,
 * `Secure`; every path), one per name: the more specific domain wins, as a browser would send it first.
 */
export function SessionCookies(jar: CookieJar, origins: readonly string[]): Cookie[] {
    const byName = new Map<string, Cookie>();
    for (const origin of origins) {
        for (const cookie of jar.getCookiesSync(origin, { allPaths: true })) {
            const existing = byName.get(cookie.key);
            if (!existing || (cookie.domain?.length ?? 0) > (existing.domain?.length ?? 0)) {
                byName.set(cookie.key, cookie);
            }
        }
    }
    return [...byName.values()];
}

/**
 * A cookie session as an artifact: one `Cookie` header holding the session's cookies (see {@link SessionCookies}; the
 * header is sent to every one of the origins), expiring with its first cookie or the TTL.
 *
 * @throws When no cookie goes to any of the origins: the login did not produce a session for the site.
 */
export function CookieSessionArtifact(jar: CookieJar, origins: readonly string[], ttlMs: number | null, driver: string, now: number = Date.now()): AccessArtifact {
    const cookies = SessionCookies(jar, origins);
    if (cookies.length === 0) {
        throw new Error(`${driver}: the login set no cookie for ${origins.join(', ') || 'the source'}; check the login settings and the credential`);
    }
    const expiries = cookies.map((c) => c.expiryTime()).filter((e): e is number => e !== undefined && Number.isFinite(e));
    if (ttlMs !== null) {
        expiries.push(now + ttlMs);
    }
    return {
        Headers: { Cookie: cookies.map((c) => c.cookieString()).join('; ') },
        Origins: [...origins],
        ...(expiries.length > 0 ? { ExpiresAt: new Date(Math.min(...expiries)) } : {}),
    };
}

/** A URL's origin, or null when it is not an http(s) URL. */
export function OriginOf(url: string): string | null {
    try {
        const parsed = new URL(url);
        return /^https?:$/.test(parsed.protocol) ? parsed.origin : null;
    } catch {
        return null;
    }
}
