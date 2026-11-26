/**
 * @fileoverview What the login Access drivers share: the user name and password out of the resolved `MJ: Credentials`
 * secret, the session's origins, and the {@link AccessArtifact} a cookie session becomes. Cookies are kept in a
 * `tough-cookie` jar (RFC 6265 parsing and matching, public suffixes included).
 *
 * A login produces cookies; the pipeline's fetchers take headers. So a session is handed on as a `Cookie` header per
 * origin (`AccessArtifact.OriginHeaders`, read through `AccessHeadersFor`), for the session's origins only
 * (`SessionOrigins`, else the source URL's origin): each origin gets the cookies RFC 6265 sends it, so a host-only or
 * `Secure` cookie never reaches another origin or plain http. It expires with the first of its cookies to expire or
 * after `SessionTtlMinutes`, whichever is sooner, so the resolver logs in again before the site starts answering with
 * its login page.
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
 * The cookies one or more jars send to one origin (`tough-cookie`'s RFC 6265 matching: domain, public suffixes,
 * `Secure` only over https, expiry; every path). Several jars hold cookies one jar cannot: a jar keeps one cookie per
 * domain, path and name, where a browser keeps a host-only and a domain cookie of the same name apart.
 */
export function OriginCookies(jar: CookieJar | readonly CookieJar[], origin: string): Cookie[] {
    return JarsOf(jar).flatMap((j) => j.getCookiesSync(origin, { allPaths: true }));
}

/**
 * A cookie session as an artifact: each of the session's origins gets its own `Cookie` header in
 * {@link AccessArtifact.OriginHeaders} (see {@link OriginCookies}), none in the shared `Headers`, so same-named cookies
 * of different origins both survive and none reaches an origin it was not set for. Expires with its first cookie or
 * the TTL. Carries no header at all when no cookie goes to any origin (see {@link CookieSessionArtifact}).
 */
export function SessionArtifact(jar: CookieJar | readonly CookieJar[], origins: readonly string[], ttlMs: number | null, now: number = Date.now()): AccessArtifact {
    const originHeaders: Record<string, Record<string, string>> = {};
    const expiries: number[] = [];
    for (const origin of origins) {
        const cookies = OriginCookies(jar, origin);
        if (cookies.length > 0) {
            originHeaders[origin] = { Cookie: cookies.map((c) => c.cookieString()).join('; ') };
            expiries.push(...cookies.map((c) => c.expiryTime()).filter((e): e is number => e !== undefined && Number.isFinite(e)));
        }
    }
    if (ttlMs !== null) {
        expiries.push(now + ttlMs);
    }
    return {
        ...(Object.keys(originHeaders).length > 0 ? { OriginHeaders: originHeaders } : {}),
        Origins: [...origins],
        ...(expiries.length > 0 ? { ExpiresAt: new Date(Math.min(...expiries)) } : {}),
    };
}

/**
 * {@link SessionArtifact}, for a session that must be cookies.
 *
 * @throws When no cookie goes to any of the origins: the login did not produce a session for the site.
 */
export function CookieSessionArtifact(jar: CookieJar | readonly CookieJar[], origins: readonly string[], ttlMs: number | null, driver: string, now: number = Date.now()): AccessArtifact {
    const artifact = SessionArtifact(jar, origins, ttlMs, now);
    if (!artifact.OriginHeaders) {
        throw new Error(`${driver}: the login set no cookie for ${origins.join(', ') || 'the source'}; check the login settings and the credential`);
    }
    return artifact;
}

function JarsOf(jar: CookieJar | readonly CookieJar[]): readonly CookieJar[] {
    return jar instanceof CookieJar ? [jar] : jar;
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
