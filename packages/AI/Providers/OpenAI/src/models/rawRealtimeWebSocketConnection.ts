import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';
import type { IOpenAIRealtimeConnection } from './openAIRealtime';

/** Structural subset of the platform-global `WebSocket` the adapter drives (Node 22+ / browsers). */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null;
    send(data: string): void;
    close(): void;
}

/** Constructor shape for the platform-global `WebSocket`. */
type NativeWebSocketCtor = new (url: string) => NativeWebSocketLike;

/**
 * Adapts a RAW platform WebSocket speaking the OpenAI Realtime wire protocol into the
 * {@link IOpenAIRealtimeConnection} seam the shared `OpenAIRealtime` driver family consumes.
 *
 * This is the enabling primitive for OpenAI-protocol-compatible providers whose endpoint is NOT
 * reachable through the `openai` SDK client — e.g. a self-hosted HuggingFace speech-to-speech
 * server (arbitrary `ws://` endpoint, optional/no auth) — letting them subclass the shared driver
 * instead of re-implementing the protocol against a bare socket.
 *
 * Behavior mirrors the SDK's `OpenAIRealtimeWebSocket` where the driver depends on it:
 * - Inbound JSON frames fan out to `'event'` listeners; non-JSON frames are ignored.
 * - Provider `error` FRAMES are routed to `'error'` listeners with the payload attached at
 *   `.error` (the driver classifies those as recoverable), while TRANSPORT failures are routed
 *   with no `.error` payload (classified fatal) — the same dual-channel contract the SDK exposes.
 * - Outbound {@link Send} calls made before the socket opens are buffered and flushed on open, so
 *   a non-deferring profile can configure the session without racing the handshake.
 * - The raw socket's close event is surfaced through the optional `socket` shim the driver
 *   feature-detects for unexpected-closure handling.
 */
export class RawRealtimeWebSocketConnection implements IOpenAIRealtimeConnection {
    private ws: NativeWebSocketLike;
    private eventListeners: Array<(event: RealtimeServerEvent) => void> = [];
    private errorListeners: Array<(error: OpenAIRealtimeError) => void> = [];
    private closeListeners: Array<() => void> = [];
    private opened = false;
    private closed = false;
    private pendingSends: string[] = [];

    /** The `socket` shim the driver uses to detect UNEXPECTED closure (see `IOpenAIRealtimeConnection.socket`). */
    public socket: { addEventListener(type: 'close', listener: () => void): void };

    /**
     * Opens the raw socket immediately (matching the SDK connection's construct-then-connect
     * lifecycle). The platform-global `WebSocket` API has no header support, so any upstream auth
     * must be enforced by the endpoint or injected by an intermediary (e.g. MJAPI's realtime proxy).
     *
     * @param url The `ws(s)://…/v1/realtime` endpoint URL.
     * @param webSocketCtor Optional WebSocket constructor override (tests inject a fake; production
     * resolves the platform global).
     */
    constructor(url: string, webSocketCtor?: NativeWebSocketCtor) {
        const WS = webSocketCtor ?? (globalThis as unknown as { WebSocket?: NativeWebSocketCtor }).WebSocket;
        if (!WS) {
            throw new Error('RawRealtimeWebSocketConnection requires a global WebSocket (Node 22+ or a browser runtime).');
        }
        this.ws = new WS(url);
        this.socket = {
            addEventListener: (_type: 'close', listener: () => void): void => {
                this.closeListeners.push(listener);
            },
        };
        this.ws.onopen = () => {
            this.opened = true;
            const queued = this.pendingSends;
            this.pendingSends = [];
            for (const frame of queued) {
                this.ws.send(frame);
            }
        };
        this.ws.onmessage = (event) => this.handleMessage(event.data);
        this.ws.onerror = () => {
            // A transport error before open means the buffered frames can never be delivered.
            this.pendingSends = [];
            this.emitError(this.makeError('realtime websocket transport error'));
        };
        this.ws.onclose = () => {
            this.closed = true;
            this.pendingSends = [];
            for (const listener of [...this.closeListeners]) {
                listener();
            }
        };
    }

    /** Registers a listener for parsed server events (`'event'`) or connection errors (`'error'`). */
    public on(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    public on(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    public on(
        event: 'event' | 'error',
        listener: ((event: RealtimeServerEvent) => void) | ((error: OpenAIRealtimeError) => void),
    ): void {
        if (event === 'event') {
            this.eventListeners.push(listener as (event: RealtimeServerEvent) => void);
        }
        else {
            this.errorListeners.push(listener as (error: OpenAIRealtimeError) => void);
        }
    }

    /** Removes a previously-registered listener. */
    public off(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    public off(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    public off(
        event: 'event' | 'error',
        listener: ((event: RealtimeServerEvent) => void) | ((error: OpenAIRealtimeError) => void),
    ): void {
        if (event === 'event') {
            this.eventListeners = this.eventListeners.filter((l) => l !== listener);
        }
        else {
            this.errorListeners = this.errorListeners.filter((l) => l !== listener);
        }
    }

    /**
     * JSON-serializes one client frame; buffered until the socket opens, sent immediately after.
     * A send after the socket closed is a safe no-op (the session teardown path may still emit).
     */
    public send(event: RealtimeClientEvent): void {
        if (this.closed) {
            return;
        }
        const frame = JSON.stringify(event);
        if (!this.opened) {
            this.pendingSends.push(frame);
            return;
        }
        this.ws.send(frame);
    }

    /** Closes the underlying socket (pending buffered sends are dropped). */
    public close(): void {
        this.closed = true;
        this.pendingSends = [];
        this.ws.close();
    }

    /**
     * Parses one inbound frame. Provider `error` frames are re-routed to the `'error'` channel with
     * the payload attached (recoverable classification downstream) — mirroring the SDK, which never
     * delivers `error` server frames through the `'event'` firehose.
     */
    private handleMessage(data: unknown): void {
        let parsed: RealtimeServerEvent;
        try {
            parsed = JSON.parse(String(data)) as RealtimeServerEvent;
        } catch {
            return; // non-JSON frame — ignore, matching the prior raw-socket drivers
        }
        if (parsed.type === 'error') {
            // ALWAYS attach a provider payload — even for a bodyless `{type:'error'}` frame. The
            // downstream classifier treats "no .error payload" as a TRANSPORT failure (fatal); a
            // provider error FRAME is recoverable by contract regardless of how sparse the compat
            // endpoint's payload is, so a minimal payload is synthesized when absent.
            const providerError = parsed.error;
            const fallbackMessage = (parsed as { message?: string }).message;
            const message = providerError?.message ?? fallbackMessage ?? 'realtime provider error';
            const error = this.makeError(message);
            error.error = providerError ?? { type: 'server_error', message };
            this.emitError(error);
            return;
        }
        for (const listener of [...this.eventListeners]) {
            listener(parsed);
        }
    }

    /** Builds an SDK-shaped connection error (an `Error` with an optional `.error` provider payload). */
    private makeError(message: string): OpenAIRealtimeError {
        return new Error(message) as OpenAIRealtimeError;
    }

    /** Fans an error out to all `'error'` listeners. */
    private emitError(error: OpenAIRealtimeError): void {
        for (const listener of [...this.errorListeners]) {
            listener(error);
        }
    }
}
