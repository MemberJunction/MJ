import type { WorkJson } from '../envelope';
import type { IWorkPublisher, PublishRequest, PublishResult } from '../publishing';
import { PublishErrorCodes, RejectedPublishResult } from '../publishing';
import { MAX_REST_PUBLISH_BATCH, ParseRestPublishResponse, ToRestPublishRequest } from './restContract';

export interface WorkQueueApiPublisherOptions {
    /** Root of the work-queue REST extension, e.g. https://api.example.com/work-queue */
    BaseUrl: string;
    /** MJ API key with workqueue:publish for the target topics. */
    ApiKey: string;
    Fetch?: typeof fetch;
    /** Retries after the first attempt. Default 3. */
    MaxRetries?: number;
    /** Per-request timeout. Default 10000. */
    TimeoutMs?: number;
    /** Base for exponential retry delay. Default 200. */
    RetryBaseDelayMs?: number;
    NewId?: () => string;
    Sleep?: (ms: number) => Promise<void>;
}

type SendOutcome =
    | { Kind: 'Response'; Status: number; Body: unknown; RetryAfterSeconds: number | null }
    | { Kind: 'NetworkError'; Error: string };

type IdentifiedRequest<TPayload extends WorkJson> = PublishRequest<TPayload> & { MessageID: string };

const FALLBACK_CODES: ReadonlyMap<number, string> = new Map<number, string>([
    [400, PublishErrorCodes.BadRequest],
    [401, PublishErrorCodes.Unauthorized],
    [403, PublishErrorCodes.Forbidden],
    [404, PublishErrorCodes.TopicNotFound],
    [413, PublishErrorCodes.PayloadTooLarge],
]);

/** IWorkPublisher for producers outside MJ: calls the MJ work-queue REST publish endpoint (spec 03 §9). */
export class WorkQueueApiPublisher implements IWorkPublisher {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly maxRetries: number;
    private readonly timeoutMs: number;
    private readonly retryBaseDelayMs: number;
    private readonly newId: () => string;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(private readonly options: WorkQueueApiPublisherOptions) {
        this.baseUrl = options.BaseUrl.replace(/\/+$/, '');
        this.fetchImpl = options.Fetch ?? ((input, init) => fetch(input, init));
        this.maxRetries = options.MaxRetries ?? 3;
        this.timeoutMs = options.TimeoutMs ?? 10_000;
        this.retryBaseDelayMs = options.RetryBaseDelayMs ?? 200;
        this.newId = options.NewId ?? (() => crypto.randomUUID());
        this.sleep = options.Sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    }

    public async Publish<TPayload extends WorkJson>(topic: string, requests: PublishRequest<TPayload>[]): Promise<PublishResult[]> {
        const identified = requests.map((request): IdentifiedRequest<TPayload> => ({ ...request, MessageID: request.MessageID ?? this.newId() }));
        const results: PublishResult[] = [];
        for (let start = 0; start < identified.length; start += MAX_REST_PUBLISH_BATCH) {
            results.push(...(await this.publishChunk(topic, identified.slice(start, start + MAX_REST_PUBLISH_BATCH))));
        }
        return results;
    }

    private async publishChunk<TPayload extends WorkJson>(topic: string, chunk: IdentifiedRequest<TPayload>[]): Promise<PublishResult[]> {
        const url = `${this.baseUrl}/topics/${encodeURIComponent(topic)}/messages`;
        const body = JSON.stringify({ messages: chunk.map((request) => ToRestPublishRequest(request)) });
        for (let attempt = 0; ; attempt += 1) {
            const outcome = await this.send(url, body);
            if (outcome.Kind === 'Response' && !isRetryableStatus(outcome.Status)) {
                return mapResponse(outcome.Status, outcome.Body, chunk);
            }
            if (attempt >= this.maxRetries) {
                const reason = outcome.Kind === 'Response' ? `HTTP ${outcome.Status}` : outcome.Error;
                return chunk.map((request) => RejectedPublishResult(request.MessageID, PublishErrorCodes.TransportUnavailable, reason));
            }
            await this.sleep(this.retryDelayMs(attempt, outcome));
        }
    }

    private async send(url: string, body: string): Promise<SendOutcome> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchImpl(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': this.options.ApiKey },
                body,
                signal: controller.signal,
            });
            const text = await response.text();
            return { Kind: 'Response', Status: response.status, Body: parseJson(text), RetryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')) };
        } catch (error) {
            const message = controller.signal.aborted ? `Timed out after ${this.timeoutMs} ms` : error instanceof Error ? error.message : String(error);
            return { Kind: 'NetworkError', Error: message };
        } finally {
            clearTimeout(timer);
        }
    }

    private retryDelayMs(attempt: number, outcome: SendOutcome): number {
        if (outcome.Kind === 'Response' && outcome.RetryAfterSeconds !== null) {
            return outcome.RetryAfterSeconds * 1000;
        }
        return this.retryBaseDelayMs * Math.pow(2, attempt);
    }
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

function mapResponse(status: number, body: unknown, chunk: { MessageID: string }[]): PublishResult[] {
    if (status === 200 || status === 202) {
        const parsed = ParseRestPublishResponse(body, chunk.length);
        if (parsed !== null) {
            return parsed;
        }
        return chunk.map((request) => RejectedPublishResult(request.MessageID, PublishErrorCodes.InvalidResponse, `Unexpected response body for HTTP ${status}`));
    }
    const { Code, Message } = readErrorBody(status, body);
    return chunk.map((request) => RejectedPublishResult(request.MessageID, Code, Message));
}

function readErrorBody(status: number, body: unknown): { Code: string; Message: string } {
    const fallback = FALLBACK_CODES.get(status) ?? `Http${status}`;
    if (typeof body !== 'object' || body === null) {
        return { Code: fallback, Message: `HTTP ${status}` };
    }
    const code: unknown = Reflect.get(body, 'code');
    const message: unknown = Reflect.get(body, 'message');
    return {
        Code: typeof code === 'string' ? code : fallback,
        Message: typeof message === 'string' ? message : `HTTP ${status}`,
    };
}

function parseJson(text: string): unknown {
    if (text.trim() === '') {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed;
    } catch {
        return null;
    }
}

/** Upper bound on a server-requested wait: a hostile or mistaken header must not park a producer. */
export const MAX_RETRY_AFTER_SECONDS = 60;

/** RFC 9110 Retry-After: delta-seconds or an HTTP date. Capped at MAX_RETRY_AFTER_SECONDS. */
function parseRetryAfter(header: string | null): number | null {
    if (header === null || header.trim() === '') {
        return null;
    }
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
        return seconds >= 0 ? Math.min(seconds, MAX_RETRY_AFTER_SECONDS) : null;
    }
    const at = Date.parse(header);
    if (Number.isNaN(at)) {
        return null;
    }
    return Math.min(Math.max(0, (at - Date.now()) / 1000), MAX_RETRY_AFTER_SECONDS);
}
