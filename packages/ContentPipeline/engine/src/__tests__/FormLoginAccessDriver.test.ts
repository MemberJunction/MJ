/**
 * @fileoverview The `FormLogin` access driver and the cookie session it hands on.
 *
 * A stand-in site answers the login: its login page sets a cookie and holds a CSRF token in a hidden field, and the
 * post answers 302 with the session cookie. The driver must carry the token and the cookie through, follow the
 * redirect as a GET, and hand back one `Cookie` header for the session's origins that expires with its cookies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The site is at public IP addresses: the real SSRF guard checks every hop (an IP needs no DNS lookup).
const SITE = 'https://93.184.216.34';
const ELSEWHERE = 'https://93.184.216.35';

import { AccessRequest } from '@memberjunction/content-pipeline-base';
import { ExtraFields, FormLoginAccessDriver, HiddenInputs } from '../FormLoginAccessDriver.js';
import { CookieJar } from 'tough-cookie';
import { CookieSessionArtifact, SessionOrigins } from '../LoginSession.js';

interface Sent {
    url: string;
    method: string;
    body: string;
    headers: Record<string, string>;
}
let sent: Sent[] = [];

function answer(status: number, body: string, headers: [string, string][] = []): Response {
    return new Response(status >= 300 && status < 400 ? null : body, { status, headers: [['content-type', 'text/html'], ...headers] });
}

/** The stand-in site: a login page, a login post, a home page. */
function site(post: (body: string) => Response): void {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            sent.push({ url, method: String(init.method), body: String(init.body ?? ''), headers: (init.headers ?? {}) as Record<string, string> });
            const path = new URL(url).pathname;
            if (path === '/login' && init.method === 'GET') {
                return answer(200, '<form><input type="hidden" name="csrf" value="t&amp;1"><input name="username"></form>', [['set-cookie', 'pre=1; Path=/']]);
            }
            if (path === '/login' && init.method === 'POST') {
                return post(String(init.body));
            }
            if (path === '/home') {
                return answer(200, '<p>Welcome back</p>');
            }
            return answer(404, 'missing');
        }),
    );
}

function request(parameters: Record<string, string> = {}, secret: Record<string, string> = { username: 'member', password: 'pw' }): AccessRequest {
    return {
        ContentSourceID: 'S1',
        URL: `${SITE}/library`,
        Role: 'Default',
        Secret: secret,
        Parameters: { LoginURL: `${SITE}/login`, ...parameters },
        ContextUser: {} as never,
        Provider: {} as never,
        Signal: new AbortController().signal,
    };
}

const signedIn = () => answer(302, '', [['location', '/home'], ['set-cookie', 'sid=abc; Path=/; HttpOnly; Max-Age=3600']]);

beforeEach(() => {
    sent = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('FormLoginAccessDriver', () => {
    it('posts the form with the hidden token, follows the redirect as a GET, and hands back the cookies', async () => {
        site(signedIn);
        const before = Date.now();
        const artifact = await new FormLoginAccessDriver().Connect(request({ LoginHiddenFields: 'true', LoginExtraFields: '{"remember":true}', LoginSuccessMarker: 'Welcome' }));

        const post = sent.find((s) => s.method === 'POST')!;
        expect(Object.fromEntries(new URLSearchParams(post.body))).toEqual({ csrf: 't&1', remember: 'true', username: 'member', password: 'pw' });
        expect(post.headers.Cookie).toBe('pre=1');
        expect(sent.at(-1)).toMatchObject({ url: `${SITE}/home`, method: 'GET' });
        expect(artifact.Headers?.Cookie).toBe('pre=1; sid=abc');
        expect(artifact.Origins).toEqual([SITE]);
        expect(artifact.ExpiresAt!.getTime()).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
    });

    it('posts JSON to a separate action with its own field names', async () => {
        site(signedIn);
        await new FormLoginAccessDriver().Connect(
            request({ LoginActionURL: '/login', LoginBodyFormat: 'json', LoginUsernameField: 'email', LoginPasswordField: 'pass', LoginSeedGet: 'false' }),
        );
        const post = sent.find((s) => s.method === 'POST')!;
        expect(sent[0].method).toBe('POST');
        expect(JSON.parse(post.body)).toEqual({ email: 'member', pass: 'pw' });
        expect(post.headers['Content-Type']).toBe('application/json');
    });

    it('fails a login whose answer lacks the success marker, or has the failure marker', async () => {
        site(() => answer(200, '<p>Invalid password</p>', [['set-cookie', 'anon=1']]));
        await expect(new FormLoginAccessDriver().Connect(request({ LoginSuccessMarker: 'Welcome' }))).rejects.toThrow(/does not contain 'Welcome'/);
        await expect(new FormLoginAccessDriver().Connect(request({ LoginFailureMarker: 'Invalid password' }))).rejects.toThrow(/refused/);
    });

    it('refuses a 307 that would carry the posted credentials to another origin, and never sends them there', async () => {
        site(() => answer(307, '', [['location', `${ELSEWHERE}/take`]]));
        await expect(new FormLoginAccessDriver().Connect(request())).rejects.toThrow(/to another origin/);
        expect(sent.some((s) => s.url.startsWith(ELSEWHERE))).toBe(false);
    });

    it('needs a user name and a password from the credential', async () => {
        site(signedIn);
        await expect(new FormLoginAccessDriver().Connect(request({}, { apiKey: 'k' }))).rejects.toThrow(/needs a username and a password/);
    });

    it('ends the session at the TTL when it is sooner than the cookies', async () => {
        site(signedIn);
        const artifact = await new FormLoginAccessDriver().Connect(request({ SessionTtlMinutes: '5' }));
        expect(artifact.ExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    });
});

describe('the cookie session', () => {
    it("holds the session origins' cookies, every path, the more specific domain first; refuses a login that set none", () => {
        const jar = new CookieJar();
        const set = (url: string, headers: string[]) => headers.forEach((h) => jar.setCookieSync(h, url, { ignoreError: true }));
        set('https://idp.test/', ['idp=1']);
        set('https://www.site.test/', ['sid=2; Domain=site.test', 'docs=3; Path=/docs', 'sid=4']);
        expect(CookieSessionArtifact(jar, ['https://www.site.test'], null, 'X').Headers?.Cookie).toBe('sid=4; docs=3');
        expect(() => CookieSessionArtifact(jar, ['https://other.test'], null, 'X')).toThrow(/set no cookie/);
    });

    it('takes no cookie a browser would refuse: a public suffix as its domain, or a domain it did not come from', () => {
        const jar = new CookieJar();
        ['wide=1; Domain=com', 'foreign=2; Domain=evil.test'].forEach((h) => jar.setCookieSync(h, 'https://www.site.test/', { ignoreError: true }));
        expect(jar.getCookieStringSync('https://www.site.test/')).toBe('');
    });

    it('expires with its first cookie, or the TTL when sooner', () => {
        const jar = new CookieJar();
        jar.setCookieSync('sid=1; Max-Age=3600', 'https://www.site.test/');
        const now = Date.now();
        expect(CookieSessionArtifact(jar, ['https://www.site.test'], null, 'X', now).ExpiresAt!.getTime()).toBeGreaterThan(now + 3_500_000);
        expect(CookieSessionArtifact(jar, ['https://www.site.test'], 60_000, 'X', now).ExpiresAt!.getTime()).toBe(now + 60_000);
    });

    it('reads SessionOrigins, else the source origin', () => {
        expect(SessionOrigins(request({ SessionOrigins: 'https://a.test/x, https://b.test' }))).toEqual(['https://a.test', 'https://b.test']);
        expect(SessionOrigins(request())).toEqual([SITE]);
    });

    it('reads extra fields as JSON or a query string, and hidden inputs by name', () => {
        expect(ExtraFields('a=1&b=two')).toEqual({ a: '1', b: 'two' });
        expect(ExtraFields('{"n": 2}')).toEqual({ n: '2' });
        expect(HiddenInputs(`<input type='hidden' name='x' value='1'><input type="text" name="y" value="2"><input name=z type=hidden value=3>`)).toEqual({ x: '1', z: '3' });
    });
});
