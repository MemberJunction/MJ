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
 * Every request and redirect goes through MJ's HTTP client and its SSRF guard, and the cookies are collected across redirects (a login
 * that answers 302 with its session cookie is the common case). A 307/308 that would carry the posted credentials to
 * another origin is refused.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import * as cheerio from 'cheerio';
import { HttpMethod, HttpRequest } from '@memberjunction/network-utils';
import { AccessArtifact, AccessRequest, BaseAccessDriver } from '@memberjunction/content-pipeline-base';
import { CookieJar } from 'tough-cookie';
import { CookieSessionArtifact, LoginCredentials, SessionOrigins, SessionTtlMs } from './LoginSession.js';

/** The registered key. */
export const FORM_LOGIN_ACCESS_DRIVER = 'FormLogin';

/** The most redirects one login request follows (Chromium's own limit). */
const MAX_LOGIN_REDIRECTS = 20;
/** How long a login request may take when the source sets no `LoginTimeoutMs`. */
const DEFAULT_LOGIN_TIMEOUT_MS = 30_000; // a login page is one page; half a minute is generous
/** The most of a login page or answer read (for hidden fields and markers); a login page is small, so a larger answer is refused. */
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
        return CookieSessionArtifact(jar, SessionOrigins(request), SessionTtlMs(request), this.Key);
    }

    /**
     * One request with the jar's cookies, through MJ's HTTP client with the SSRF guard on every hop (`ValidateUrl`). Each
     * redirect is seen before it is followed (`OnRedirect`): its cookies are kept, a 303 (and a 301/302 answering a POST)
     * goes on as a GET without the body, as browsers do, and the next hop gets the jar's cookies for its own URL.
     */
    protected async Send(url: string, init: { method: string; body?: string; headers?: Record<string, string> }, jar: CookieJar, request: AccessRequest, signal: AbortSignal): Promise<LoginAnswer> {
        const userAgent = request.Parameters.LoginUserAgent;
        let carriesBody = init.body !== undefined;
        const headersFor = (target: string): Record<string, string> => {
            const cookie = jar.getCookieStringSync(target);
            return { ...(carriesBody ? init.headers : {}), ...(cookie ? { Cookie: cookie } : {}), ...(userAgent ? { 'User-Agent': userAgent } : {}) };
        };
        // A cookie a browser would refuse (a public suffix, a foreign domain) is skipped, not an error.
        const keep = (from: string, headers: readonly string[]) => headers.forEach((h) => jar.setCookieSync(h, from, { ignoreError: true }));
        const response = await HttpRequest<string>({
            Url: url,
            Method: init.method as HttpMethod,
            Body: init.body,
            Headers: headersFor(url),
            ValidateUrl: true,
            MaxRedirects: MAX_LOGIN_REDIRECTS,
            ThrowOnError: false,
            ResponseType: 'text',
            MaxResponseBytes: MAX_LOGIN_BODY_BYTES,
            Timeout: 0, // the login's own deadline is the signal (LoginTimeoutMs)
            Signal: signal,
            OnRedirect: (hop) => {
                keep(hop.From.href, hop.Response.headers.getSetCookie());
                const status = hop.Response.status;
                const toGet = status === 303 || ((status === 301 || status === 302) && hop.Method === 'POST');
                carriesBody &&= !toGet;
                // A 307/308 keeps the body, and a login's body is the password: it goes on only to the same origin.
                if (carriesBody && hop.To.origin !== hop.From.origin) {
                    throw new Error(`${this.Key}: the login at '${hop.From.href}' redirected its posted credentials to another origin (${hop.To.origin}); refused`);
                }
                return { Method: toGet ? 'GET' : hop.Method, ...(toGet ? { Body: null } : {}), Headers: headersFor(hop.To.href) };
            },
        });
        keep(response.Url, response.SetCookies ?? []);
        return { Status: response.Status, URL: response.Url, Body: typeof response.Data === 'string' ? response.Data : '' };
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

/** The `<input type="hidden">` fields of a page (a CSRF token), by name. */
export function HiddenInputs(html: string): Record<string, string> {
    const $ = cheerio.load(html);
    const fields: Record<string, string> = {};
    $('input[type="hidden" i][name]').each((_, input) => {
        fields[$(input).attr('name')!] = $(input).attr('value') ?? '';
    });
    return fields;
}
