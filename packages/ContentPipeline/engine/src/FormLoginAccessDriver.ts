/**
 * @fileoverview {@link FormLoginAccessDriver} — sign in to a members-only site by posting its login form, and hand
 * the session on as cookies.
 *
 * Selected with `AccessDriverKey: 'FormLogin'`. The user name and password come from `MJ: Credentials` (mapped by
 * `Configuration.AccessCredentials`, as for `Credential`); everything else from the source's settings
 * (`AccessRequest.Parameters`, e.g. `SourceSpecificConfiguration`):
 *
 * | Parameter | Meaning | Default |
 * |---|---|---|
 * | `LoginURL` | The login page | the source URL |
 * | `LoginActionURL` | Where the form posts (absolute, or relative to `LoginURL`) | `LoginURL` |
 * | `LoginSeedGet` | GET the login page first, for the cookies (and hidden fields) it sets | `true` |
 * | `LoginHiddenFields` | Carry the login page's hidden inputs (a CSRF token) into the post | `false` |
 * | `LoginUsernameField` / `LoginPasswordField` | The field names | `username` / `password` |
 * | `LoginBodyFormat` | `form` (urlencoded) or `json` | `form` |
 * | `LoginExtraFields` | More fields: a JSON object, or `a=1&b=2` | none |
 * | `LoginSuccessMarker` | Text the answer must contain for the login to count | none |
 * | `LoginFailureMarker` | Text that, in the answer, means the login was refused | none |
 * | `LoginUserAgent` | The `User-Agent` the login sends | the runtime's |
 * | `SessionOrigins` | The origins the session goes to (comma-separated) | the source URL's origin |
 * | `SessionTtlMinutes` | Log in again after this long, even if the cookies say later | the cookies' expiry |
 * | `LoginTimeoutMs` | How long the whole login (every request and redirect) may take | 30000 |
 *
 * Without a success marker, a site that answers a refused login with 200 and its login page again still hands out
 * (anonymous) cookies, and every page is then read as the login wall: set one.
 *
 * Every request and redirect goes through MJ's SSRF guard, and the cookies are collected across redirects (a login
 * that answers 302 with its session cookie is the common case). A 307/308 that would carry the posted credentials to
 * another origin is refused.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { AssertPublicUrl, DrainResponseBody } from '@memberjunction/network-utils';
import { AccessArtifact, AccessRequest, BaseAccessDriver } from '@memberjunction/content-pipeline-base';
import { CookieJar, CookieSessionArtifact, LoginCredentials, SessionOrigins, SessionTtlMs } from './LoginSession.js';

/** The registered key. */
export const FORM_LOGIN_ACCESS_DRIVER = 'FormLogin';

/** The most redirects one login request follows (Chromium's own limit). */
const MAX_LOGIN_REDIRECTS = 20;
/** How long a login request may take when the source sets no `LoginTimeoutMs`. */
const DEFAULT_LOGIN_TIMEOUT_MS = 30_000; // a login page is one page; half a minute is generous
/** The most of a login page or answer read (for hidden fields and markers); a login page is small. */
const MAX_LOGIN_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

/** One answer at the end of a login request's redirects. */
interface LoginAnswer {
    Status: number;
    URL: string;
    Body: string;
}

@RegisterClass(BaseAccessDriver, FORM_LOGIN_ACCESS_DRIVER)
export class FormLoginAccessDriver extends BaseAccessDriver {
    public readonly Key = FORM_LOGIN_ACCESS_DRIVER;

    public async Connect(request: AccessRequest): Promise<AccessArtifact> {
        const { Username, Password } = LoginCredentials(request, this.Key);
        const p = request.Parameters;
        const loginURL = p.LoginURL || request.URL;
        const actionURL = new URL(p.LoginActionURL || loginURL, loginURL).href;
        const jar = new CookieJar();
        const signal = AbortSignal.any([request.Signal, AbortSignal.timeout(this.timeoutMs(request))]);
        let hidden: Record<string, string> = {};
        if (p.LoginSeedGet?.toLowerCase() !== 'false') {
            const seed = await this.Send(loginURL, { method: 'GET' }, jar, request, signal);
            if (p.LoginHiddenFields?.toLowerCase() === 'true') {
                hidden = HiddenInputs(seed.Body);
            }
        }
        const fields: Record<string, string> = {
            ...hidden,
            ...ExtraFields(p.LoginExtraFields),
            [p.LoginUsernameField || 'username']: Username,
            [p.LoginPasswordField || 'password']: Password,
        };
        const json = p.LoginBodyFormat?.toLowerCase() === 'json';
        const answer = await this.Send(
            actionURL,
            {
                method: 'POST',
                body: json ? JSON.stringify(fields) : new URLSearchParams(fields).toString(),
                headers: { 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded' },
            },
            jar,
            request,
            signal,
        );
        this.assertSignedIn(answer, request);
        return CookieSessionArtifact(jar.Cookies, SessionOrigins(request), SessionTtlMs(request), this.Key);
    }

    /**
     * One request with the jar's cookies, its redirects followed here (each hop through the SSRF guard, its cookies
     * kept). A 303, and a 301/302 answering a POST, go on as a GET without the body, as browsers do.
     */
    protected async Send(url: string, init: { method: string; body?: string; headers?: Record<string, string> }, jar: CookieJar, request: AccessRequest, signal: AbortSignal): Promise<LoginAnswer> {
        let method = init.method;
        let body = init.body;
        let target = url;
        for (let hops = 0; ; hops++) {
            const checked = await AssertPublicUrl(target);
            const cookie = jar.HeaderFor(checked.href);
            const response = await fetch(checked.href, {
                method,
                body,
                redirect: 'manual',
                signal,
                headers: {
                    ...(body !== undefined ? init.headers : {}),
                    ...(cookie ? { Cookie: cookie } : {}),
                    ...(request.Parameters.LoginUserAgent ? { 'User-Agent': request.Parameters.LoginUserAgent } : {}),
                },
            });
            jar.SetFromResponse(checked.href, response.headers.getSetCookie());
            const location = response.headers.get('location');
            if (response.status < 300 || response.status > 399 || !location) {
                return { Status: response.status, URL: checked.href, Body: await ReadText(response) };
            }
            await DrainResponseBody(response);
            if (hops >= MAX_LOGIN_REDIRECTS) {
                throw new Error(`${this.Key}: '${url}' redirected more than ${MAX_LOGIN_REDIRECTS} times`);
            }
            if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
                method = 'GET';
                body = undefined;
            }
            const next = new URL(location, checked.href);
            // A 307/308 keeps the body, and a login's body is the password: it goes on only to the same origin.
            if (body !== undefined && next.origin !== new URL(checked.href).origin) {
                throw new Error(`${this.Key}: the login at '${checked.href}' redirected its posted credentials to another origin (${next.origin}); refused`);
            }
            target = next.href;
        }
    }

    /** The login counts when the answer has the success marker (when set), lacks the failure marker, and is not an error. */
    private assertSignedIn(answer: LoginAnswer, request: AccessRequest): void {
        const success = request.Parameters.LoginSuccessMarker;
        const failure = request.Parameters.LoginFailureMarker;
        if (failure && answer.Body.includes(failure)) {
            throw new Error(`${this.Key}: the login was refused (the answer from ${answer.URL} contains '${failure}')`);
        }
        if (success && !answer.Body.includes(success)) {
            throw new Error(`${this.Key}: the login did not succeed (the answer from ${answer.URL} does not contain '${success}')`);
        }
        if (answer.Status >= 400) {
            throw new Error(`${this.Key}: the login answered ${answer.Status} from ${answer.URL}`);
        }
    }

    private timeoutMs(request: AccessRequest): number {
        const ms = Number(request.Parameters.LoginTimeoutMs);
        return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_LOGIN_TIMEOUT_MS;
    }
}

/** A response's text, reading at most {@link MAX_LOGIN_BODY_BYTES}. */
async function ReadText(response: Response): Promise<string> {
    if (!response.body) {
        return '';
    }
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        parts.push(value);
        total += value.byteLength;
        if (total >= MAX_LOGIN_BODY_BYTES) {
            await reader.cancel().catch(() => undefined);
            break;
        }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(parts));
}

/** `LoginExtraFields` as fields: a JSON object, or `a=1&b=2`. */
export function ExtraFields(value: string | undefined): Record<string, string> {
    const text = value?.trim();
    if (!text) {
        return {};
    }
    if (text.startsWith('{')) {
        const parsed = JSON.parse(text) as Record<string, string | number | boolean>;
        return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    }
    return Object.fromEntries(new URLSearchParams(text));
}

/** The `<input type="hidden">` fields of a page (a CSRF token), by name. A structural scan, not a parse. */
export function HiddenInputs(html: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
        const tag = match[0];
        if (!/\btype\s*=\s*["']?hidden\b/i.test(tag)) {
            continue;
        }
        const name = AttributeOf(tag, 'name');
        if (name) {
            fields[name] = DecodeEntities(AttributeOf(tag, 'value') ?? '');
        }
    }
    return fields;
}

function AttributeOf(tag: string, attribute: string): string | null {
    const match = new RegExp(`\\s${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
    return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function DecodeEntities(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}
