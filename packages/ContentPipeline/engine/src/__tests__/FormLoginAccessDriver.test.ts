/**
 * @fileoverview The `FormLogin` access driver and the cookie session it hands on.
 *
 * A stand-in site answers the login: its login page sets a cookie and holds a CSRF token in a hidden field, and the
 * post answers 302 with the session cookie. The driver must carry the token and the cookie through, follow the
 * redirect as a GET, and hand back one `Cookie` header for the session's origins that expires with its cookies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/network-utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/network-utils')>();
    return { ...actual, AssertPublicUrl: vi.fn(async (url: string) => new URL(url)) };
});

import { AccessRequest } from '@memberjunction/content-pipeline-base';
import { ExtraFields, FormLoginAccessDriver, HiddenInputs } from '../FormLoginAccessDriver.js';
import { CookieJar, CookieSessionArtifact, ParseSetCookie, SessionOrigins } from '../LoginSession.js';

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
        URL: 'https://members.site.test/library',
        Role: 'Default',
        Secret: secret,
        Parameters: { LoginURL: 'https://members.site.test/login', ...parameters },
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
        expect(sent.at(-1)).toMatchObject({ url: 'https://members.site.test/home', method: 'GET' });
        expect(artifact.Headers?.Cookie).toBe('pre=1; sid=abc');
        expect(artifact.Origins).toEqual(['https://members.site.test']);
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
        site(() => answer(307, '', [['location', 'https://collector.elsewhere.test/take']]));
        await expect(new FormLoginAccessDriver().Connect(request())).rejects.toThrow(/to another origin/);
        expect(sent.some((s) => s.url.startsWith('https://collector.elsewhere.test'))).toBe(false);
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
    it('parses Set-Cookie: domain, path, Max-Age over Expires, flags', () => {
        const cookie = ParseSetCookie('a=1; Domain=.site.test; Path=/docs; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Max-Age=60; Secure; SameSite=None', 'https://www.site.test/x', 1000);
        expect(cookie).toMatchObject({ Name: 'a', Value: '1', Domain: 'site.test', HostOnly: false, Path: '/docs', ExpiresAt: 61_000, Secure: true, SameSite: 'None' });
        // A domain the response did not come from is ignored: the cookie stays host-only.
        expect(ParseSetCookie('b=2; Domain=evil.test', 'https://www.site.test/', 0)).toMatchObject({ Domain: 'www.site.test', HostOnly: true });
    });

    it("sends a jar's cookies only where they belong", () => {
        const jar = new CookieJar();
        jar.SetFromResponse('https://login.site.test/', ['wide=1; Domain=site.test', 'narrow=2', 'secure=3; Secure', 'docs=4; Path=/docs']);
        expect(jar.HeaderFor('https://www.site.test/docs/a')).toBe('wide=1');
        expect(jar.HeaderFor('https://login.site.test/docs/a')).toBe('wide=1; narrow=2; secure=3; docs=4');
        expect(jar.HeaderFor('http://login.site.test/other')).toBe('wide=1; narrow=2');
        jar.SetFromResponse('https://login.site.test/', ['narrow=; Max-Age=0']);
        expect(jar.HeaderFor('http://login.site.test/')).toBe('wide=1');
    });

    it("holds only the cookies for the session's origins, and refuses a login that set none for them", () => {
        const jar = new CookieJar();
        jar.SetFromResponse('https://idp.test/', ['idp=1']);
        jar.SetFromResponse('https://www.site.test/', ['sid=2; Domain=site.test']);
        expect(CookieSessionArtifact(jar.Cookies, ['https://www.site.test'], null, 'X').Headers?.Cookie).toBe('sid=2');
        expect(() => CookieSessionArtifact(jar.Cookies, ['https://other.test'], null, 'X')).toThrow(/set no cookie/);
    });

    it('reads SessionOrigins, else the source origin', () => {
        expect(SessionOrigins(request({ SessionOrigins: 'https://a.test/x, https://b.test' }))).toEqual(['https://a.test', 'https://b.test']);
        expect(SessionOrigins(request())).toEqual(['https://members.site.test']);
    });

    it('reads extra fields as JSON or a query string, and hidden inputs by name', () => {
        expect(ExtraFields('a=1&b=two')).toEqual({ a: '1', b: 'two' });
        expect(ExtraFields('{"n": 2}')).toEqual({ n: '2' });
        expect(HiddenInputs(`<input type='hidden' name='x' value='1'><input type="text" name="y" value="2"><input name=z type=hidden value=3>`)).toEqual({ x: '1', z: '3' });
    });
});
