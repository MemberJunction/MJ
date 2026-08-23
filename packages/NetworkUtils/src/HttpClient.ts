import { SafeFetch } from "./SSRFGuard.js";

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

/** A successful (or, when `ThrowOnError` is false, any) HTTP response. */
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

/** Everything {@link HttpRequest} accepts. All fields optional except `Url`. */
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
    /** Maximum redirect hops to follow. Default: 5. Set 0 to return the 3xx response itself. */
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

/** Thrown for a non-2xx response (when `ThrowOnError` is on), a timeout, or a transport failure. */
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

/** Type guard for {@link HttpError} — the replacement for axios's `isAxiosError`. */
export function IsHttpError(error: unknown): error is HttpError {
    return error instanceof HttpError;
}

/**
 * True when a request failed because the caller's own `Signal` aborted it — the replacement for
 * axios's `isCancel`. A native `AbortError` (thrown before the request reached us) also counts.
 */
export function IsCancellationError(error: unknown): boolean {
    if (error instanceof HttpError) {
        return error.IsCancelled;
    }
    return error instanceof Error && error.name === "AbortError";
}

/**
 * Builds a query string from a parameter object.
 * `null`/`undefined` values are omitted; arrays become repeated keys (`?tag=a&tag=b`).
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
 * Performs a single HTTP request using native `fetch`.
 *
 * @param config - the request configuration; see {@link HttpRequestConfig}.
 * @returns the {@link HttpResponse} with a parsed `Data` payload.
 * @throws {HttpError} on a non-2xx status (unless `ThrowOnError` is false), a timeout, or a
 *   transport failure.
 * @throws {SSRFError} when `ValidateUrl` is true and the URL resolves to a blocked address.
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

/** Convenience wrapper for a `GET` request. */
export async function HttpGet<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "GET" });
}

/** Convenience wrapper for a `POST` request. */
export async function HttpPost<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "POST", Body: body });
}

/** Convenience wrapper for a `PUT` request. */
export async function HttpPut<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "PUT", Body: body });
}

/** Convenience wrapper for a `PATCH` request. */
export async function HttpPatch<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "PATCH", Body: body });
}

/** Convenience wrapper for a `DELETE` request. */
export async function HttpDelete<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "DELETE" });
}

/** Convenience wrapper for a `HEAD` request. */
export async function HttpHead<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, Url: url, Method: "HEAD", ResponseType: "none" });
}

/**
 * Fetches a caller-controlled URL with the SSRF guard on, returning a parsed {@link HttpResponse}.
 * Equivalent to {@link HttpRequest} with `ValidateUrl: true` — provided so that call sites handling
 * untrusted URLs read as obviously safe.
 */
export async function SafeHttpRequest<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    return await HttpRequest<T>({ ...config, ValidateUrl: true });
}

/** Per-instance defaults and hooks for {@link HttpClient}. */
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
     * This is the replacement for an axios request interceptor (injecting auth, signing, etc.).
     */
    OnRequest?: (config: HttpRequestConfig) => HttpRequestConfig | Promise<HttpRequestConfig>;
    /**
     * Called after each successful response. Observation only — the response is returned to the
     * caller regardless. Replaces the success half of an axios response interceptor.
     */
    OnResponse?: (response: HttpResponse<unknown>) => void | Promise<void>;
    /**
     * Called when a request fails. Return `true` to retry (bounded by `MaxRetries`), `false` to let
     * the error propagate. Replaces the error half of an axios response interceptor — this is where
     * 429 / rate-limit back-off belongs.
     */
    OnRetry?: (error: HttpError, attempt: number) => boolean | Promise<boolean>;
}

/**
 * A configured HTTP client — the replacement for `axios.create(...)`.
 *
 * Holds a `BaseURL`, default headers, and a timeout, and exposes `OnRequest` / `OnResponse` /
 * `OnRetry` hooks that cover what MJ used axios interceptors for (auth injection and rate-limit
 * retry). Unlike axios interceptors, the hooks are plain options on the instance rather than a
 * mutable global chain, so what a given client does is visible at its construction site.
 *
 * @example
 * ```ts
 * const client = new HttpClient({
 *     BaseURL: 'https://graph.facebook.com/v18.0',
 *     Timeout: 30000,
 *     OnRequest: (config) => ({ ...config, Query: { ...config.Query, access_token: token } }),
 *     OnRetry: async (error) => {
 *         if (error.Status !== 429) return false;
 *         await new Promise((r) => setTimeout(r, 60000));
 *         return true;
 *     },
 * });
 * const response = await client.Get<Feed>('/me/feed');
 * ```
 */
export class HttpClient {
    private readonly _options: HttpClientOptions;

    constructor(options: HttpClientOptions = {}) {
        this._options = options;
    }

    /** The options this client was constructed with. */
    public get Options(): Readonly<HttpClientOptions> {
        return this._options;
    }

    /**
     * Sends a request using this client's defaults and hooks.
     * @param config - per-request configuration, merged over the client's defaults.
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

    /** Sends a `GET` request. */
    public async Get<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "GET" });
    }

    /** Sends a `POST` request. */
    public async Post<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "POST", Body: body });
    }

    /** Sends a `PUT` request. */
    public async Put<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "PUT", Body: body });
    }

    /** Sends a `PATCH` request. */
    public async Patch<T = unknown>(url: string, body?: unknown, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "PATCH", Body: body });
    }

    /** Sends a `DELETE` request. */
    public async Delete<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "DELETE" });
    }

    /** Sends a `HEAD` request. */
    public async Head<T = unknown>(url: string, config?: Omit<HttpRequestConfig, "Url" | "Method" | "Body">): Promise<HttpResponse<T>> {
        return await this.Request<T>({ ...config, Url: url, Method: "HEAD", ResponseType: "none" });
    }
}
