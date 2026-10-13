/**
 * @fileoverview `fetch` transport for recording shards and the terminal request.
 *
 * Shards travel as raw bytes (no base64, no GraphQL envelope) to MJAPI's REST recording routes. The
 * terminal request sets `keepalive: true` so the browser completes it even while the page is
 * unloading; that flag caps the body at 64 KiB, which is why the window seals tails under 48 KiB.
 *
 * @module @memberjunction/realtime-runtime
 */
import type { RecordingShard } from './RecordingShardWindow';
import type { PendingRecordingShard } from './RecordingShardStore';

export interface RecordingTerminalInput {
    /** The final partial shard's bytes, or null when every shard was already sent. */
    Tail: Uint8Array | null;
    LastShardIndex: number;
    CapturedSamples: number;
    /**
     * False when the call may go on (the tab was only hidden): the server stamps the counts but assembles
     * after its grace period instead of now. Absent or true: the call ended.
     */
    Final?: boolean;
}

/** Per-upload options for {@link IRecordingTransport.UploadShard}. */
export interface RecordingUploadOptions {
    /**
     * Send with `keepalive` so the request survives page unload. Only for shards sealed inside a
     * `pagehide`/`visibilitychange` handler: the browser caps in-flight keepalive bodies (64 KiB per
     * page), and a request over that budget is refused — which resolves false like any failure.
     */
    Keepalive?: boolean;
}

/** Sends recording bytes to the server. Both methods resolve true only on a server ack. */
export interface IRecordingTransport {
    UploadShard(sessionID: string, shard: RecordingShard | PendingRecordingShard, options?: RecordingUploadOptions): Promise<boolean>;
    /** Sent with `keepalive` so it survives page unload. */
    SendTerminal(sessionID: string, input: RecordingTerminalInput): Promise<boolean>;
}

export interface FetchRecordingTransportConfig {
    /** MJAPI base URL without a trailing slash (see {@link RecordingBaseURLFromGraphQLURL}). */
    BaseURL: string;
    /** Called per request so a refreshed token is picked up. */
    Headers: () => Record<string, string>;
    /** Defaults to `globalThis.fetch`, resolved at call time so tests can inject one. */
    Fetch?: typeof fetch;
}

function describeFailure(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
}

const GRAPHQL_SUFFIX = '/graphql';

/**
 * Derives the REST base from the GraphQL endpoint URL by dropping trailing slashes and `/graphql`.
 * A scan, not a regex: `/\/+$/` backtracks quadratically on a long run of slashes that does not end
 * the string, and the URL comes from host configuration.
 */
export function RecordingBaseURLFromGraphQLURL(url: string): string {
    let end = url.length;
    while (end > 0 && url.charCodeAt(end - 1) === 47 /* '/' */) {
        end--;
    }
    const trimmed = url.slice(0, end);
    return trimmed.endsWith(GRAPHQL_SUFFIX) ? trimmed.slice(0, -GRAPHQL_SUFFIX.length) : trimmed;
}

export class FetchRecordingTransport implements IRecordingTransport {
    constructor(private readonly config: FetchRecordingTransportConfig) {}

    public UploadShard(sessionID: string, shard: RecordingShard | PendingRecordingShard, options?: RecordingUploadOptions): Promise<boolean> {
        const url = `${this.config.BaseURL}/realtime/recording/${encodeURIComponent(sessionID)}/shard/${shard.Index}`;
        return this.post(url, shard.Bytes, options?.Keepalive === true, `shard ${sessionID}/${shard.Index}`);
    }

    public SendTerminal(sessionID: string, input: RecordingTerminalInput): Promise<boolean> {
        const final = input.Final === false ? '&final=false' : '';
        const query = `lastShardIndex=${input.LastShardIndex}&capturedSamples=${input.CapturedSamples}${final}`;
        const url = `${this.config.BaseURL}/realtime/recording/${encodeURIComponent(sessionID)}/end?${query}`;
        return this.post(url, input.Tail ?? new Uint8Array(0), true, `terminal ${sessionID}/${input.LastShardIndex}`);
    }

    private async post(url: string, body: Uint8Array, keepalive: boolean, context: string): Promise<boolean> {
        const doFetch = this.config.Fetch ?? globalThis.fetch;
        try {
            const response = await doFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream', ...this.config.Headers() },
                // TS types a bare Uint8Array as possibly SharedArrayBuffer-backed; shard bytes never are.
                body: body as Uint8Array<ArrayBuffer>,
                ...(keepalive ? { keepalive: true } : {}),
            });
            if (!response.ok) {
                console.warn(`[RealtimeSession] Recording ${context} rejected by server with status ${response.status}`);
                return false;
            }
            return true;
        } catch (failure) {
            console.warn(`[RealtimeSession] Recording ${context} request failed: ${describeFailure(failure)}`, failure);
            return false;
        }
    }
}
