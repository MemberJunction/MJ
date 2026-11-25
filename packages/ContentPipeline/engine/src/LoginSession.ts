/**
 * @fileoverview What the login Access drivers share: a small cookie jar, the user name and password out of the
 * resolved `MJ: Credentials` secret, and the {@link AccessArtifact} a cookie session becomes.
 *
 * A login produces cookies; the pipeline's fetchers take headers. So a session is handed on as one `Cookie`
 * header, sent only to the session's origins (`SessionOrigins`, else the source URL's origin), and it expires
 * with the first of its cookies to expire or after `SessionTtlMinutes`, whichever is sooner, so the resolver
 * logs in again before the site starts answering with its login page.
 *
 * @module @memberjunction/content-pipeline
 */

import { AccessArtifact, AccessRequest } from '@memberjunction/content-pipeline-base';

/** One cookie a login was given. */
export interface SessionCookie {
    Name: string;
    Value: string;
    /** The host it belongs to, lower case, without a leading dot. */
    Domain: string;
    /** True when the cookie named no `Domain`: it goes to exactly that host, not its subdomains. */
    HostOnly: boolean;
    Path: string;
    /** When it expires, epoch ms; unset for a session cookie. */
    ExpiresAt?: number;
    Secure: boolean;
    HttpOnly: boolean;
    SameSite: 'Strict' | 'Lax' | 'None';
}

/** Parse one `Set-Cookie` header as the response from `url` set it, or null when it is not a cookie. */
export function ParseSetCookie(header: string, url: string, now: number = Date.now()): SessionCookie | null {
    const [pair, ...attributes] = header.split(';');
    const equals = pair.indexOf('=');
    if (equals <= 0) {
        return null;
    }
    const host = new URL(url).hostname.toLowerCase();
    const cookie: SessionCookie = {
        Name: pair.slice(0, equals).trim(),
        Value: pair.slice(equals + 1).trim(),
        Domain: host,
        HostOnly: true,
        Path: '/',
        Secure: false,
        HttpOnly: false,
        SameSite: 'Lax',
    };
    let maxAge: number | undefined;
    for (const attribute of attributes) {
        const [rawName, ...rest] = attribute.split('=');
        const name = rawName.trim().toLowerCase();
        const value = rest.join('=').trim();
        if (name === 'domain' && value) {
            const domain = value.replace(/^\./, '').toLowerCase();
            // A cookie for a host the response did not come from would be refused by a browser too.
            if (host === domain || host.endsWith(`.${domain}`)) {
                cookie.Domain = domain;
                cookie.HostOnly = false;
            }
        } else if (name === 'path' && value.startsWith('/')) {
            cookie.Path = value;
        } else if (name === 'max-age' && /^-?\d+$/.test(value)) {
            maxAge = Number(value);
        } else if (name === 'expires') {
            const expires = Date.parse(value);
            if (!Number.isNaN(expires)) {
                cookie.ExpiresAt = expires;
            }
        } else if (name === 'secure') {
            cookie.Secure = true;
        } else if (name === 'httponly') {
            cookie.HttpOnly = true;
        } else if (name === 'samesite') {
            cookie.SameSite = /^strict$/i.test(value) ? 'Strict' : /^none$/i.test(value) ? 'None' : 'Lax';
        }
    }
    if (maxAge !== undefined) {
        // Max-Age wins over Expires (RFC 6265 §5.3).
        cookie.ExpiresAt = now + maxAge * 1000;
    }
    return cookie;
}

/** Whether a cookie goes to a host (RFC 6265 domain matching). */
export function CookieMatchesHost(cookie: SessionCookie, host: string): boolean {
    const target = host.toLowerCase();
    return cookie.HostOnly ? target === cookie.Domain : target === cookie.Domain || target.endsWith(`.${cookie.Domain}`);
}

/** The cookies a login collects across its requests and redirects. */
export class CookieJar {
    private readonly cookies = new Map<string, SessionCookie>();

    constructor(private readonly now: () => number = Date.now) {}

    /** Every live cookie. */
    public get Cookies(): SessionCookie[] {
        return [...this.cookies.values()].filter((c) => c.ExpiresAt === undefined || c.ExpiresAt > this.now());
    }

    /** Take the cookies a response from `url` set; one that is already expired removes its namesake. */
    public SetFromResponse(url: string, setCookieHeaders: readonly string[]): void {
        for (const header of setCookieHeaders) {
            const cookie = ParseSetCookie(header, url, this.now());
            if (cookie) {
                this.Add(cookie);
            }
        }
    }

    public Add(cookie: SessionCookie): void {
        const key = `${cookie.Domain}|${cookie.Path}|${cookie.Name}`;
        if (cookie.ExpiresAt !== undefined && cookie.ExpiresAt <= this.now()) {
            this.cookies.delete(key);
            return;
        }
        this.cookies.set(key, cookie);
    }

    /** The `Cookie` header a request to `url` carries, or '' when none applies. */
    public HeaderFor(url: string): string {
        const target = new URL(url);
        return this.Cookies.filter(
            (c) =>
                CookieMatchesHost(c, target.hostname) &&
                (target.pathname === c.Path || target.pathname.startsWith(c.Path.endsWith('/') ? c.Path : `${c.Path}/`) || c.Path === '/') &&
                (!c.Secure || target.protocol === 'https:'),
        )
            .map((c) => `${c.Name}=${c.Value}`)
            .join('; ');
    }
}

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
 * A cookie session as an artifact: one `Cookie` header holding every cookie that goes to any of the session's
 * origins (the header is sent to all of them), expiring with its first cookie or the TTL.
 *
 * @throws When no cookie goes to any of the origins: the login did not produce a session for the site.
 */
export function CookieSessionArtifact(
    cookies: readonly SessionCookie[],
    origins: readonly string[],
    ttlMs: number | null,
    driver: string,
    now: number = Date.now(),
): AccessArtifact {
    const hosts = origins.map((o) => new URL(o).hostname);
    const byName = new Map<string, SessionCookie>();
    for (const cookie of cookies) {
        if ((cookie.ExpiresAt === undefined || cookie.ExpiresAt > now) && hosts.some((h) => CookieMatchesHost(cookie, h))) {
            const existing = byName.get(cookie.Name);
            // Two cookies of one name: the more specific domain wins, as a browser would send it first.
            if (!existing || cookie.Domain.length > existing.Domain.length) {
                byName.set(cookie.Name, cookie);
            }
        }
    }
    if (byName.size === 0) {
        throw new Error(`${driver}: the login set no cookie for ${origins.join(', ') || 'the source'}; check the login settings and the credential`);
    }
    const expiries = [...byName.values()].map((c) => c.ExpiresAt).filter((e): e is number => e !== undefined);
    if (ttlMs !== null) {
        expiries.push(now + ttlMs);
    }
    return {
        Headers: { Cookie: [...byName.values()].map((c) => `${c.Name}=${c.Value}`).join('; ') },
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
