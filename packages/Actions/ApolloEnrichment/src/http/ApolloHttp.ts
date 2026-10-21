/**
 * The one place that talks HTTP to Apollo: header auth, JSON handling, and the mapping of failures
 * onto typed errors. `ApolloRESTClient` (lists, search) and `ApolloPeopleClient` (bulk match) both go
 * through here, so the 403-means-master-key explanation and the error message format exist once.
 *
 * Error messages keep the historical `ApolloRESTClient.<context>: <METHOD> <path> ...` format so
 * callers and tests that match on them keep working; the classes just add structure on top.
 */
import { LogError } from '@memberjunction/core';

export type ApolloRateLimitWindow = 'minute' | 'hour' | 'day' | 'unknown';

export class ApolloRequestError extends Error {
    public readonly Status: number;
    public readonly Body: string;
    constructor(message: string, status: number, body: string) {
        super(message);
        this.name = 'ApolloRequestError';
        this.Status = status;
        this.Body = body;
    }
}

export class ApolloAuthError extends ApolloRequestError {
    constructor(message: string, status: 401 | 403, body: string) {
        super(message, status, body);
        this.name = 'ApolloAuthError';
    }
}

export class ApolloRateLimitError extends ApolloRequestError {
    public readonly RetryAfterSeconds: number | null;
    public readonly Window: ApolloRateLimitWindow;
    constructor(message: string, body: string, retryAfterSeconds: number | null, window: ApolloRateLimitWindow) {
        super(message, 429, body);
        this.name = 'ApolloRateLimitError';
        this.RetryAfterSeconds = retryAfterSeconds;
        this.Window = window;
    }
}

export interface ApolloHttpRequest {
    ApiKey: string;
    FetchImpl: typeof fetch;
    BaseURL: string;
    Method: 'GET' | 'POST' | 'PATCH';
    Path: string;
    /** Names the caller in error messages, e.g. `ApolloRESTClient.searchPeople`. */
    Context: string;
    Body?: unknown;
    /** When true, a 403 is explained as the master-key requirement. */
    MasterKeyOp?: boolean;
}

/** Rate-limit headers Apollo sets on every response. Null when absent or blank. */
export interface ApolloRateLimits {
    Minute: number | null;
    Hourly: number | null;
    Daily: number | null;
}

export interface ApolloHttpResponse {
    Status: number;
    Body: unknown;
    Limits: ApolloRateLimits;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Sends one request. Resolves with the parsed JSON body on 2xx; throws a typed error otherwise. */
export async function ApolloRequest(args: ApolloHttpRequest): Promise<ApolloHttpResponse> {
    const url = `${args.BaseURL}${args.Path}`;
    const headers: Record<string, string> = { 'X-Api-Key': args.ApiKey, accept: 'application/json' };
    if (args.Body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await args.FetchImpl(url, { method: args.Method, headers, body: args.Body !== undefined ? JSON.stringify(args.Body) : undefined });
    const limits = ReadLimits(response.headers);
    if (!response.ok) throw await FailureOf(response, args);
    try {
        return { Status: response.status, Body: (await response.json()) as unknown, Limits: limits };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        const message = `${args.Context}: ${args.Method} ${args.Path} returned a non-JSON body: ${msg}`;
        LogError(message);
        throw new ApolloRequestError(message, response.status, '');
    }
}

async function FailureOf(response: Response, args: ApolloHttpRequest): Promise<ApolloRequestError> {
    let rawText = '';
    let detail = '';
    try {
        rawText = await response.text();
        const parsed: unknown = JSON.parse(rawText);
        if (isRecord(parsed)) detail = stringOr(parsed.error, stringOr(parsed.message, ''));
    } catch {
        /* keep rawText */
    }
    const prefix = `${args.Context}: ${args.Method} ${args.Path}`;
    if (response.status === 403 && args.MasterKeyOp) {
        const message = `${prefix} returned HTTP 403. This endpoint requires a MASTER Apollo API key — scoped keys 403 on label reads/writes and on account/contact updates.${detail ? ` (${detail})` : ''}`;
        LogError(message);
        return new ApolloAuthError(message, 403, rawText);
    }
    const fallback = detail || rawText.slice(0, 500);
    const message = `${prefix} failed with HTTP ${response.status}${fallback ? ` — ${fallback}` : ''}`;
    LogError(message);
    if (response.status === 401 || response.status === 403) return new ApolloAuthError(message, response.status, rawText);
    if (response.status === 429) {
        const retryAfter = RetryAfterSeconds(response.headers);
        return new ApolloRateLimitError(message, rawText, retryAfter, WindowOf(retryAfter, rawText));
    }
    return new ApolloRequestError(message, response.status, rawText);
}

function ReadLimits(headers: Headers | undefined): ApolloRateLimits {
    const read = (name: string): number | null => {
        const value = headers?.get?.(name);
        return value !== null && value !== undefined && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : null;
    };
    return { Minute: read('x-rate-limit-minute'), Hourly: read('x-rate-limit-hourly'), Daily: read('x-rate-limit-24-hour') };
}

function RetryAfterSeconds(headers: Headers | undefined): number | null {
    const value = headers?.get?.('retry-after');
    if (value === null || value === undefined || value.trim() === '') return null;
    const seconds = Number(value);
    if (!Number.isNaN(seconds)) return Math.max(0, Math.ceil(seconds));
    const at = Date.parse(value);
    return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** Apollo names the window in its 429 body ("per minute", "hourly", "daily"); a short Retry-After also means the minute window. */
export function WindowOf(retryAfterSeconds: number | null, body: string): ApolloRateLimitWindow {
    const text = body.toLowerCase();
    if (/per[ -]?minute|minute/.test(text)) return 'minute';
    if (/hour/.test(text)) return 'hour';
    if (/day|daily/.test(text)) return 'day';
    if (retryAfterSeconds !== null && retryAfterSeconds <= 60) return 'minute';
    return 'unknown';
}
