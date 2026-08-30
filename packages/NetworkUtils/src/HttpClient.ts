/**
 * A dependency-free HTTP client built on Node's native `fetch`.
 *
 * This exists to replace `axios` across the MJ codebase. Node 18+ ships a spec-compliant `fetch`,
 * so a third-party HTTP client buys nothing but supply-chain surface — while costing us the ability
 * to route every outbound request through one place. That one place matters: {@link HttpClient}
 * and {@link HttpRequest} can opt into the SSRF guard in this same package (`ValidateUrl`), which
 * is impossible to enforce when every package reaches for `axios` directly.
 *
 * The shape deliberately mirrors the parts of axios MJ actually used — a config object, a response
 * with a parsed `Data`, a throw-on-non-2xx default, per-instance defaults, and request/retry hooks
 * standing in for interceptors — so call sites port over mechanically.
 *
 * SSRF NOTE: `ValidateUrl` defaults to **false** here. That is intentional. Most MJ call sites talk
 * to fixed, well-known provider endpoints, and some legitimately talk to internal hosts (MJServer
 * posting to its own API, MetadataSync resolving a `@url:` reference on a dev box). Guarding those
 * by default would break them. Set `ValidateUrl: true` — or use {@link SafeFetch} directly —
 * wherever the URL is caller-controlled.
 */

import { SafeFetch } from "./SSRFGuard.js";

/** HTTP methods supported by {@link HttpRequest}. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * How to interpret the response body.
 * - `json` — parse as JSON; falls back to raw text when the body is empty or not valid JSON.
 * - `text` — return the body as a string.
 * - `arraybuffer` — return the body as an `ArrayBuffer` (binary downloads).
 * - `blob` — return the body as a `Blob`.
 * - `stream` — return the raw `ReadableStream` body without consuming it.
 * - `none` — discard the body and return `null`.
 */
export type HttpResponseType = "json" | "text" | "arraybuffer" | "blob" | "stream" | "none";

/**
 * Values accepted in a query-string object. Arrays are serialized as repeated keys, and `Date`
 * values as ISO 8601 — matching how axios's default param serializer rendered them.
 */
export type HttpQueryValue = string | number | boolean | Date | null | undefined | ReadonlyArray<string | number | boolean | Date>;

/**
 * The result of a request. Returned for 2xx responses, and — when `ThrowOnError` is disabled —
 * for any response at all.
 *
 * The axios equivalent is its response object, with the fields renamed to MJ's `PascalCase`
 * convention: `data` -> `Data`, `status` -> `Status`, `headers` -> `Headers`.
 *
 * @typeParam T - the shape of the parsed response body. Supply it at the call site
 *   (`HttpGet<Payload>(...)`) so `Data` is typed rather than `unknown`.
 *
 * @example
 * ```ts
 * interface Repo { id: number; full_name: string }
 * const response = await HttpGet<Repo>('https://api.github.com/repos/a/b');
 * response.Data.full_name;   // typed as string
 * response.Status;           // 200
 * response.Headers['etag'];  // header keys are always lower-cased
 * ```
 */
export interface HttpResponse<T = unknown> {
    /** The parsed response body, per the request's `ResponseType`. */
    Data: T;
    /** HTTP status code. */
    Status: number;
    /** HTTP status text. */
    StatusText: string;
    /** Response headers, lower-cased keys. */
    Headers: Record<string, string>;
    /** The final URL the response came from (after any redirects). */
    Url: string;
    /** True when `Status` is in the 2xx range. */
    Ok: boolean;
}

/**
 * Everything {@link HttpRequest} accepts. Only `Url` is required.
 *
 * When used through {@link HttpClient}, each field falls back to the client's corresponding
 * option, except `Headers`, which is *merged* over the client's defaults key-by-key.
 *
 * @example
 * ```ts
 * await HttpRequest({
 *     Url: '/reports',
 *     BaseURL: 'https://api.example.com/v2',
 *     Method: 'POST',
 *     Query: { format: 'json', tag: ['a', 'b'] },   // -> ?format=json&tag=a&tag=b
 *     Body: { name: 'Q3' },                          // JSON-encoded automatically
 *     Timeout: 15000,
 *     ValidateUrl: false,
 * });
 * ```
 */
export interface HttpRequestConfig {
    /** Target URL. Resolved against `BaseURL` when that is set and this is relative. */
    Url: string;
    /** HTTP method. Default: `GET`. */
    Method?: HttpMethod;
    /** Prefix applied to a relative `Url`. */
    BaseURL?: string;
    /** Request headers. Merged over any client-level defaults. */
    Headers?: Record<string, string>;
    /** Query-string parameters appended to the URL. */
    Query?: Record<string, HttpQueryValue>;
    /**
     * Request body. A plain object or array is JSON-encoded (with a `Content-Type: application/json`
     * default); `string`, `URLSearchParams`, `FormData`, `Blob`, `ArrayBuffer`, and typed arrays are
     * passed through to `fetch` untouched so it can set the right `Content-Type` itself.
     */
    Body?: unknown;
    /** How to interpret the response body. Default: `json`. */
    ResponseType?: HttpResponseType;
    /** Request timeout in milliseconds. Default: 30000. Pass 0 to disable. */
    Timeout?: number;
    /** When true, run the URL through the SSRF guard (and re-check every redirect hop). Default: false. */
    ValidateUrl?: boolean;
    /**
     * Maximum redirect hops to follow. Default: 5.
     *
     * With `ValidateUrl` off, `0` returns the 3xx response itself rather than following it. With
     * `ValidateUrl` on, {@link SafeFetch} drives redirects manually, so `0` makes a redirected
     * request throw once the cap is hit rather than returning the 3xx.
     */
    MaxRedirects?: number;
    /** When true (default), a non-2xx status throws {@link HttpError} instead of returning. */
    ThrowOnError?: boolean;
    /** Caller-supplied abort signal, honored alongside `Timeout`. */
    Signal?: AbortSignal;
    /**
     * HTTP Basic credentials. Encoded into an `Authorization: Basic ...` header — the replacement
     * for axios's `auth` option. An explicit `Authorization` header takes precedence.
     */
    BasicAuth?: { Username: string; Password: string };
}

/**
 * Thrown for a non-2xx response (when `ThrowOnError` is on), a timeout, a caller-initiated
 * cancellation, or a transport failure.
 *
 * Unlike axios's error — which nests response details under `error.response` and leaves you
 * guessing whether that property exists — every field here is always present. A request that
 * never reached a server reports `Status: 0`, so `error.Status === 404` is safe to write without
 * an optional-chain dance.
 *
 * Distinguish the three failure modes with `Status`, {@link HttpError.IsTimeout}, and
 * {@link HttpError.IsCancelled}.
 *
 * @example
 * ```ts
 * try {
 *     await client.Get('/thing');
 * } catch (error) {
 *     if (!IsHttpError(error)) throw error;
 *     if (error.IsCancelled) return;                       // caller aborted; not a failure
 *     if (error.IsTimeout) LogError('upstream slow');
 *     else if (error.Status === 404) LogError('missing');
 *     else if (error.Status === 429) await backOff(error.Headers['retry-after']);
 *     else LogError(`HTTP ${error.Status}`, error.Data);
 * }
 * ```
 */
export class HttpError extends Error {
    /** HTTP status code, or 0 when the request never produced a response (timeout / network error). */
    public readonly Status: number;
    /** HTTP status text, empty when there was no response. */
    public readonly StatusText: string;
    /** Parsed response body, when one was received. */
    public readonly Data: unknown;
    /** Response headers, lower-cased keys. Empty when there was no response. */
    public readonly Headers: Record<string, string>;
    /** The URL that was requested. */
    public readonly Url: string;
    /** The HTTP method used. */
    public readonly Method: HttpMethod;
    /** True when the failure was this request's own `Timeout` elapsing. */
    public readonly IsTimeout: boolean;
    /** True when the caller's own `Signal` aborted the request — the `axios.isCancel` equivalent. */
    public readonly IsCancelled: boolean;

    constructor(
        message: string,
        details: {
            Status?: number;
            StatusText?: string;
            Data?: unknown;
            Headers?: Record<string, string>;
            Url: string;
            Method: HttpMethod;
            IsTimeout?: boolean;
            IsCancelled?: boolean;
        }
    ) {
        super(message);
        this.name = "HttpError";
        this.Status = details.Status ?? 0;
        this.StatusText = details.StatusText ?? "";
        this.Data = details.Data;
        this.Headers = details.Headers ?? {};
        this.Url = details.Url;
        this.Method = details.Method;
        this.IsTimeout = details.IsTimeout ?? false;
        this.IsCancelled = details.IsCancelled ?? false;
    }
}

/**
 * Narrows an unknown caught value to {@link HttpError} — the replacement for axios's
 * `isAxiosError`.
 *
 * @param error - the value from a `catch` block.
 * @returns true when the value is an {@link HttpError}, narrowing its type for the caller.
 *
 * @example
 * ```ts
 * catch (error) {
 *     if (IsHttpError(error) && error.Status === 403) { ... }
 *     throw error;   // anything else is not ours to interpret
 * }
 * ```
 */
export function IsHttpError(error: unknown): error is HttpError {
    return error instanceof HttpError;
}

/**
 * True when a request failed because the caller's own `Signal` aborted it — the replacement for
 * axios's `isCancel`.
 *
 * A request's own {@link HttpRequestConfig.Timeout} elapsing is NOT a cancellation; that reports
 * {@link HttpError.IsTimeout} instead. The distinction matters because a cancellation is usually
 * an expected outcome to swallow, while a timeout is a fault worth logging or retrying.
 *
 * A native `AbortError` — thrown when the signal was already aborted before the request
 * started — also counts.
 *
 * @param error - the value from a `catch` block.
 * @returns true when the failure was caller-initiated cancellation.
 *
 * @example
 * ```ts
 * catch (error) {
 *     if (IsCancellationError(error)) return null;   // the caller gave up; stay quiet
 *     throw error;
 * }
 * ```
 */
export function IsCancellationError(error: unknown): boolean {
    if (error instanceof HttpError) {
        return error.IsCancelled;
    }
    return error instanceof Error && error.name === "AbortError";
}

/**
 * Serializes a parameter object into a URL-encoded query string.
 *
 * Exported because it is occasionally useful on its own; {@link HttpRequest} applies it to
 * `Query` automatically, so you rarely need to call it directly.
 *
 * Rules: `null` and `undefined` entries are omitted entirely (rather than becoming the strings
 * `"null"`/`"undefined"`), arrays expand to repeated keys, and `Date` values render as ISO 8601.
 *
 * @param query - the parameters to serialize.
 * @returns the encoded query string, WITHOUT a leading `?`. Empty when nothing survives.
 *
 * @example
 * ```ts
 * BuildQueryString({ q: 'a b', tag: ['x', 'y'], skip: null });
 * // 'q=a+b&tag=x&tag=y'
 * ```
 */
export function BuildQueryString(query: Record<string, HttpQueryValue>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                params.append(key, item instanceof Date ? item.toISOString() : String(item));
            }
        } else if (value instanceof Date) {
            params.append(key, value.toISOString());
        } else {
            params.append(key, String(value as string | number | boolean));
        }
    }
    return params.toString();
}

/** Resolves the final absolute URL from `BaseURL`, `Url`, and `Query`. */
function ResolveUrl(config: HttpRequestConfig): string {
    let url = config.Url;
    if (config.BaseURL && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
        const base = config.BaseURL.endsWith("/") ? config.BaseURL.slice(0, -1) : config.BaseURL;
        const path = url.startsWith("/") ? url : `/${url}`;
        url = `${base}${path}`;
    }
    if (config.Query) {
        const qs = BuildQueryString(config.Query);
        if (qs) {
            url += (url.includes("?") ? "&" : "?") + qs;
        }
    }
    return url;
}

/** Body types `fetch` understands natively — passed through without JSON encoding. */
function IsNativeBody(body: unknown): boolean {
    return (
        typeof body === "string" ||
        body instanceof URLSearchParams ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body) ||
        (typeof Blob !== "undefined" && body instanceof Blob) ||
        (typeof FormData !== "undefined" && body instanceof FormData) ||
        (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
    );
}

/** Flattens a `Headers` object into a plain lower-cased-key record. */
function HeadersToRecord(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
        result[key.toLowerCase()] = value;
    });
    return result;
}

/** Reads and interprets a response body per the requested {@link HttpResponseType}. */
async function ReadBody(response: Response, responseType: HttpResponseType): Promise<unknown> {
    switch (responseType) {
        case "none":
            await response.body?.cancel();
            return null;
        case "stream":
            return response.body;
        case "arraybuffer":
            return await response.arrayBuffer();
        case "blob":
            return await response.blob();
        case "text":
            return await response.text();
        case "json":
        default: {
            const text = await response.text();
            if (text.length === 0) {
                return null;
            }
            try {
                return JSON.parse(text);
            } catch {
                // Not JSON despite the request — hand back the raw text rather than throwing,
                // which matches how axios behaves when a server mislabels its content type.
                return text;
            }
        }
    }
}

/**
 * Performs a single HTTP request using native `fetch`. This is the primitive the rest of the
 * module is built on — the method shorthands and {@link HttpClient} all funnel through it.
 *
 * Reach for a shorthand ({@link HttpGet}, {@link HttpPost}, …) for one-off calls, and for
 * {@link HttpClient} when several requests share a base URL, credentials, or retry policy.
 *
 * @typeParam T - the expected shape of the parsed response body.
 * @param config - the request configuration; see {@link HttpRequestConfig}.
 * @returns the {@link HttpResponse}, whose `Data` is parsed per `ResponseType`.
 * @throws {HttpError} on a non-2xx status (unless `ThrowOnError` is disabled), on a timeout, on
 *   caller cancellation, or on a transport failure. Inspect `Status` / `IsTimeout` / `IsCancelled`
 *   to tell them apart.
 * @throws {SSRFError} when `ValidateUrl` is enabled and the URL — or any redirect hop — resolves
 *   to a private or reserved address. This propagates as itself rather than being wrapped in an
 *   {@link HttpError}, so a security decision is never mistaken for an unreachable host.
 *
 * @example Reading a JSON payload
 * ```ts
 * const response = await HttpRequest<{ items: Item[] }>({
 *     Url: 'https://api.example.com/items',
 *     Query: { page: 1 },
 * });
 * return response.Data.items;
 * ```
 *
 * @example Inspecting a non-2xx instead of catching it
 * ```ts
 * const response = await HttpRequest({ Url: url, ThrowOnError: false });
 * if (response.Status === 404) return null;
 * ```
 */
export async function HttpRequest<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const method = config.Method ?? "GET";
    const responseType = config.ResponseType ?? "json";
    const throwOnError = config.ThrowOnError ?? true;
    const timeout = config.Timeout ?? 30000;
    const maxRedirects = config.MaxRedirects ?? 5;
    const url = ResolveUrl(config);

    const headers: Record<string, string> = { ...config.Headers };

    if (config.BasicAuth) {
        const hasAuthHeader = Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
        if (!hasAuthHeader) {
            const encoded = Buffer.from(`${config.BasicAuth.Username}:${config.BasicAuth.Password}`, "utf8").toString("base64");
            headers["Authorization"] = `Basic ${encoded}`;
        }
    }

    let body: BodyInit | undefined;
    if (config.Body !== undefined && config.Body !== null && method !== "GET" && method !== "HEAD") {
        if (IsNativeBody(config.Body)) {
            body = config.Body as BodyInit;
        } else {
            body = JSON.stringify(config.Body);
            const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === "content-type");
            if (!hasContentType) {
                headers["Content-Type"] = "application/json";
            }
        }
    }

    // Compose the caller's signal with our timeout so either can abort the request.
    const controller = new AbortController();
    const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
    const onCallerAbort = () => controller.abort();
    if (config.Signal) {
        if (config.Signal.aborted) {
            controller.abort();
        } else {
            config.Signal.addEventListener("abort", onCallerAbort, { once: true });
        }
    }

    try {
        let response: Response;
        if (config.ValidateUrl) {
            response = await SafeFetch(url, {
                method,
                headers,
                body,
                signal: controller.signal,
                MaxRedirects: maxRedirects,
            });
        } else {
            response = await fetch(url, {
                method,
                headers,
                body,
                signal: controller.signal,
                redirect: maxRedirects > 0 ? "follow" : "manual",
            });
        }

        const responseHeaders = HeadersToRecord(response.headers);
        // HEAD responses have no body, and a caller asking for JSON should not get a parse attempt.
        const data = method === "HEAD" ? null : await ReadBody(response, responseType);

        const result: HttpResponse<T> = {
            Data: data as T,
            Status: response.status,
            StatusText: response.statusText,
            Headers: responseHeaders,
            Url: response.url || url,
            Ok: response.status >= 200 && response.status < 300,
        };

        if (!result.Ok && throwOnError) {
            throw new HttpError(`Request failed with status code ${response.status}`, {
                Status: response.status,
                StatusText: response.statusText,
                Data: data,
                Headers: responseHeaders,
                Url: result.Url,
                Method: method,
            });
        }

        return result;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        const aborted = controller.signal.aborted;
        const isCancelled = aborted && config.Signal?.aborted === true;
        const isTimeout = aborted && !isCancelled;
        const message = isTimeout
            ? `Request to ${url} timed out after ${timeout}ms`
            : isCancelled
              ? `Request to ${url} was cancelled by the caller`
              : `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`;
        // A guard rejection (SSRFError) is a security decision, not a transport failure — let it
        // propagate as itself so callers can distinguish "blocked" from "unreachable".
        if (error instanceof Error && error.name === "SSRFError") {
            throw error;
        }
        throw new HttpError(message, { Url: url, Method: method, IsTimeout: isTimeout, IsCancelled: isCancelled });
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
        config.Signal?.removeEventListener("abort", onCallerAbort);
    }
}

/**
 * Sends a `GET` request. Shorthand for {@link HttpRequest} with `Method: 'GET'`.
 *
 * @typeParam T - the expected shape of the parsed response body.
 * @param url - absolute URL, or a path when `config.BaseURL` is supplied.
 * @param config - optional per-request settings (query, headers, timeout, …).
 * @returns the {@link HttpResponse}.
 * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
 *
 * @example
 * ```ts
 * const { Data } = await HttpGet<User[]>('https://api.example.com/users', {
 *     Query: { active: true },
 *     Headers: { Authorization: `Bearer ${token}` },
 * });
 * ```
 */
export async function HttpGet<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "GET" });
}

/**
 * Sends a `POST` request. Shorthand for {@link HttpRequest} with `Method: 'POST'`.
 *
 * A plain object or array `body` is JSON-encoded and given a JSON `Content-Type`. Pass a
 * `URLSearchParams` for form encoding or a `FormData` for multipart, and `fetch` sets the correct
 * `Content-Type` (including the multipart boundary) itself.
 *
 * @typeParam T - the expected shape of the parsed response body.
 * @param url - absolute URL, or a path when `config.BaseURL` is supplied.
 * @param body - the request body.
 * @param config - optional per-request settings.
 * @returns the {@link HttpResponse}.
 * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
 *
 * @example
 * ```ts
 * await HttpPost('https://api.example.com/items', { name: 'Widget' });               // JSON
 * await HttpPost(tokenUrl, new URLSearchParams({ grant_type: 'refresh_token' }));    // form
 * ```
 */
export async function HttpPost<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "POST", Body: body });
}

/**
 * Sends a `PUT` request. Shorthand for {@link HttpRequest} with `Method: 'PUT'`.
 * Body handling matches {@link HttpPost}.
 *
 * @typeParam T - the expected shape of the parsed response body.
 * @param url - absolute URL, or a path when `config.BaseURL` is supplied.
 * @param body - the request body.
 * @param config - optional per-request settings.
 * @returns the {@link HttpResponse}.
 * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
 */
export async function HttpPut<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "PUT", Body: body });
}

/**
 * Sends a `PATCH` request. Shorthand for {@link HttpRequest} with `Method: 'PATCH'`.
 * Body handling matches {@link HttpPost}.
 *
 * @typeParam T - the expected shape of the parsed response body.
 * @param url - absolute URL, or a path when `config.BaseURL` is supplied.
 * @param body - the request body.
 * @param config - optional per-request settings.
 * @returns the {@link HttpResponse}.
 * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
 */
export async function HttpPatch<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "PATCH", Body: body });
}

/**
 * Sends a `DELETE` request. Shorthand for {@link HttpRequest} with `Method: 'DELETE'`.
 *
 * @typeParam T - the expected shape of the parsed response body.
 * @param url - absolute URL, or a path when `config.BaseURL` is supplied.
 * @param config - optional per-request settings.
 * @returns the {@link HttpResponse}.
 * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
 */
export async function HttpDelete<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "DELETE" });
}

/**
 * Sends a `HEAD` request. Shorthand for {@link HttpRequest} with `Method: 'HEAD'`.
 *
 * `ResponseType` is forced to `none` because a HEAD response has no body by definition, so `Data`
 * is always `null` — use `Status` and `Headers`. Pair with `ThrowOnError: false` when probing a
 * URL's reachability, so a 4xx is reported as a status rather than thrown.
 *
 * @typeParam T - unused in practice; `Data` is always `null`.
 * @param url - absolute URL, or a path when `config.BaseURL` is supplied.
 * @param config - optional per-request settings.
 * @returns the {@link HttpResponse}, with `Data` set to `null`.
 * @throws {HttpError} on a non-2xx status (unless `ThrowOnError` is disabled), timeout,
 *   cancellation, or transport failure.
 *
 * @example Probing whether a link is alive
 * ```ts
 * const response = await HttpHead(url, { ThrowOnError: false, Timeout: 10000 });
 * const reachable = response.Status >= 200 && response.Status < 400;
 * ```
 */
export async function HttpHead<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "HEAD", ResponseType: "none" });
}

/**
 * {@link HttpRequest} with the SSRF guard switched on — equivalent to passing
 * `ValidateUrl: true`, but named so a reviewer can see at a glance that the call site handles an
 * untrusted URL.
 *
 * Use this (or set `ValidateUrl` explicitly) wherever the URL can be influenced by an AI agent, an
 * Action parameter, an API caller, or stored data those can write. Prefer {@link SafeFetch} when
 * you want the raw `Response` rather than a parsed body.
 *
 * @typeParam T - the expected shape of the parsed response body.
 * @param config - the request configuration; `ValidateUrl` is forced on.
 * @returns the {@link HttpResponse}.
 * @throws {SSRFError} when the URL, or any redirect hop, resolves to a private or reserved address.
 * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
 *
 * @example
 * ```ts
 * try {
 *     const response = await SafeHttpRequest({ Url: userSuppliedUrl });
 *     return response.Data;
 * } catch (error) {
 *     if (error instanceof SSRFError) {
 *         return { Success: false, ResultCode: 'SSRF_BLOCKED' };
 *     }
 *     throw error;
 * }
 * ```
 */
export async function SafeHttpRequest<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, ValidateUrl: true });
}

/**
 * Per-instance defaults and hooks for {@link HttpClient}.
 *
 * The three hooks replace what axios interceptors did, with one important difference: they are
 * plain options on the instance rather than entries appended to a mutable global chain, so what a
 * given client does is visible at its construction site and cannot be changed from elsewhere.
 *
 * | axios | here |
 * |---|---|
 * | `interceptors.request.use(fn)` | {@link HttpClientOptions.OnRequest} |
 * | `interceptors.response.use(onOk)` | {@link HttpClientOptions.OnResponse} |
 * | `interceptors.response.use(_, onErr)` | {@link HttpClientOptions.OnRetry} |
 */
export interface HttpClientOptions {
    /** Prefix applied to every relative request URL. */
    BaseURL?: string;
    /** Headers merged under each request's own headers. */
    Headers?: Record<string, string>;
    /** Default request timeout in milliseconds. Default: 30000. */
    Timeout?: number;
    /** When true, every request runs through the SSRF guard. Default: false. */
    ValidateUrl?: boolean;
    /** Default maximum redirect hops. Default: 5. */
    MaxRedirects?: number;
    /** Maximum retry attempts allowed when `OnRetry` asks for one. Default: 3. */
    MaxRetries?: number;
    /** Default HTTP Basic credentials applied to every request. */
    BasicAuth?: { Username: string; Password: string };
    /**
     * Called before each request with the fully merged config; return the config to actually send.
     * The replacement for an axios request interceptor — this is where token injection, request
     * signing, and per-request query defaults belong.
     *
     * Treat the incoming config as immutable and return a new object; it is re-derived on every
     * retry attempt, so a token read here is always current rather than captured at construction.
     *
     * @example
     * ```ts
     * OnRequest: (config) => ({
     *     ...config,
     *     Headers: { ...config.Headers, Authorization: `Bearer ${this.getAccessToken()}` },
     * })
     * ```
     */
    OnRequest?: (config: HttpRequestConfig) => HttpRequestConfig | Promise<HttpRequestConfig>;
    /**
     * Called after each successful response. Observation only: whatever this does, the response is
     * still returned to the caller unchanged. Replaces the success half of an axios response
     * interceptor — logging, metrics, and rate-limit headroom tracking belong here.
     *
     * @example
     * ```ts
     * OnResponse: (response) => {
     *     const remaining = response.Headers['x-rate-limit-remaining'];
     *     if (remaining) LogStatus(`Rate limit remaining: ${remaining}`);
     * }
     * ```
     */
    OnResponse?: (response: HttpResponse<unknown>) => void | Promise<void>;
    /**
     * Called when a request fails. Return `true` to retry, `false` to let the error propagate.
     * Replaces the error half of an axios response interceptor — 429 back-off, and one-shot token
     * refresh on a 401, belong here.
     *
     * Retries are bounded by `MaxRetries` (default 3) so a hook that always returns `true` cannot
     * loop forever. Await the back-off inside the hook; the retry fires as soon as it resolves, and
     * `OnRequest` runs again first, so a refreshed token is picked up automatically.
     *
     * Only an {@link HttpError} reaches this hook — an {@link SSRFError} is a security decision and
     * is never retried.
     *
     * @example
     * ```ts
     * OnRetry: async (error, attempt) => {
     *     if (error.Status !== 429) return false;
     *     const retryAfter = Number(error.Headers['retry-after']) || 2 ** attempt;
     *     await new Promise((r) => setTimeout(r, retryAfter * 1000));
     *     return true;
     * }
     * ```
     */
    OnRetry?: (error: HttpError, attempt: number) => boolean | Promise<boolean>;
}

/**
 * A configured HTTP client — the replacement for `axios.create(...)`.
 *
 * Holds a base URL, default headers, a timeout, and the {@link HttpClientOptions} hooks that stand
 * in for axios interceptors. Construct one per upstream API, typically behind a lazy getter on a
 * provider base class so the cost is paid only when that provider is actually used.
 *
 * Instances are stateless apart from their options and safe to share across concurrent requests.
 * Nothing is cached between calls, so a client whose `OnRequest` reads a token always sends the
 * current one.
 *
 * @example A provider client with auth injection and 429 back-off
 * ```ts
 * private _client: HttpClient | null = null;
 *
 * protected get httpClient(): HttpClient {
 *     if (!this._client) {
 *         this._client = new HttpClient({
 *             BaseURL: 'https://graph.facebook.com/v18.0',
 *             Timeout: 30000,
 *             Headers: { Accept: 'application/json' },
 *
 *             // Runs before every attempt, so a refreshed token is picked up automatically.
 *             OnRequest: (config) => ({
 *                 ...config,
 *                 Query: { ...config.Query, access_token: this.getAccessToken() },
 *             }),
 *
 *             // Bounded by MaxRetries (default 3).
 *             OnRetry: async (error) => {
 *                 if (error.Status !== 429) return false;
 *                 await this.handleRateLimit(60);
 *                 return true;
 *             },
 *         });
 *     }
 *     return this._client;
 * }
 *
 * // Then, at the call sites:
 * const response = await this.httpClient.Get<FacebookPagedResponse<Post>>('/me/feed');
 * return response.Data.data;
 * ```
 */
export class HttpClient {
    private readonly _options: HttpClientOptions;

    constructor(options: HttpClientOptions = {}) {
        this._options = options;
    }

    /**
     * The options this client was constructed with. Read-only — a client's behavior is fixed at
     * construction, so build a second client rather than trying to mutate one.
     */
    public get Options(): Readonly<HttpClientOptions> {
        return this._options;
    }

    /**
     * Sends a request using this client's defaults and hooks. Every other method on the class
     * delegates here.
     *
     * Per-request values win over client defaults, except `Headers`, which are merged key-by-key so
     * one request can override a single default header without discarding the rest. `OnRequest`
     * then gets the last word on the merged config.
     *
     * @typeParam T - the expected shape of the parsed response body.
     * @param config - per-request configuration, merged over the client's defaults.
     * @returns the {@link HttpResponse}.
     * @throws {HttpError} when the request fails and `OnRetry` does not ask for another attempt, or
     *   once `MaxRetries` is exhausted.
     * @throws {SSRFError} when `ValidateUrl` is enabled and the target resolves to a blocked
     *   address. Never retried.
     */
    public async Request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
        const maxRetries = this._options.MaxRetries ?? 3;
        let attempt = 0;

        for (;;) {
            let merged: HttpRequestConfig = {
                ...config,
                BaseURL: config.BaseURL ?? this._options.BaseURL,
                Timeout: config.Timeout ?? this._options.Timeout,
                ValidateUrl: config.ValidateUrl ?? this._options.ValidateUrl,
                MaxRedirects: config.MaxRedirects ?? this._options.MaxRedirects,
                BasicAuth: config.BasicAuth ?? this._options.BasicAuth,
                Headers: { ...this._options.Headers, ...config.Headers },
            };

            if (this._options.OnRequest) {
                merged = await this._options.OnRequest(merged);
            }

            try {
                const response = await HttpRequest<T>(merged);
                if (this._options.OnResponse) {
                    await this._options.OnResponse(response as HttpResponse<unknown>);
                }
                return response;
            } catch (error) {
                if (!IsHttpError(error) || !this._options.OnRetry || attempt >= maxRetries) {
                    throw error;
                }
                attempt++;
                const shouldRetry = await this._options.OnRetry(error, attempt);
                if (!shouldRetry) {
                    throw error;
                }
            }
        }
    }

    /**
     * Sends a `GET` request through this client.
     *
     * @typeParam T - the expected shape of the parsed response body.
     * @param url - absolute URL, or a path resolved against the client's `BaseURL`.
     * @param config - optional per-request settings, merged over the client's defaults.
     * @returns the {@link HttpResponse}.
     * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
     */
    public async Get<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "GET" });
    }

    /**
     * Sends a `POST` request through this client. Body handling matches {@link HttpPost}.
     *
     * @typeParam T - the expected shape of the parsed response body.
     * @param url - absolute URL, or a path resolved against the client's `BaseURL`.
     * @param body - the request body.
     * @param config - optional per-request settings, merged over the client's defaults.
     * @returns the {@link HttpResponse}.
     * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
     */
    public async Post<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "POST", Body: body });
    }

    /**
     * Sends a `PUT` request through this client. Body handling matches {@link HttpPost}.
     *
     * @typeParam T - the expected shape of the parsed response body.
     * @param url - absolute URL, or a path resolved against the client's `BaseURL`.
     * @param body - the request body.
     * @param config - optional per-request settings, merged over the client's defaults.
     * @returns the {@link HttpResponse}.
     * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
     */
    public async Put<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "PUT", Body: body });
    }

    /**
     * Sends a `PATCH` request through this client. Body handling matches {@link HttpPost}.
     *
     * @typeParam T - the expected shape of the parsed response body.
     * @param url - absolute URL, or a path resolved against the client's `BaseURL`.
     * @param body - the request body.
     * @param config - optional per-request settings, merged over the client's defaults.
     * @returns the {@link HttpResponse}.
     * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
     */
    public async Patch<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "PATCH", Body: body });
    }

    /**
     * Sends a `DELETE` request through this client.
     *
     * @typeParam T - the expected shape of the parsed response body.
     * @param url - absolute URL, or a path resolved against the client's `BaseURL`.
     * @param config - optional per-request settings, merged over the client's defaults.
     * @returns the {@link HttpResponse}.
     * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
     */
    public async Delete<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "DELETE" });
    }

    /**
     * Sends a `HEAD` request through this client. `ResponseType` is forced to `none`, so `Data` is always `null`.
     *
     * @typeParam T - the expected shape of the parsed response body.
     * @param url - absolute URL, or a path resolved against the client's `BaseURL`.
     * @param config - optional per-request settings, merged over the client's defaults.
     * @returns the {@link HttpResponse}.
     * @throws {HttpError} on a non-2xx status, timeout, cancellation, or transport failure.
     */
    public async Head<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "HEAD", ResponseType: "none" });
    }
}
