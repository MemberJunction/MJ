import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import {
    OpenAIProtocolWebSocketRealtimeClient,
    IOpenAIProtocolClientSocket,
} from '../generic/openAIProtocolClient';

// ── Audio constants ────────────────────────────────────────────────────────────

/**
 * Default PCM16 sample rate (mono) both directions, used when the server pact omits `sampleRate`.
 * HuggingFace's speech-to-speech cascade is natively **16 kHz**, so capture AND playout default to that
 * (a wrong rate pitch/speed-distorts audio). Matches the server driver's `HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE`.
 */
export const HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE = 16000;

/**
 * Loosely-typed inbound frame shape kept for back-compat with existing consumers/tests. The
 * shared protocol brain (`OpenAIProtocolServerEvent`) is the operative model; this alias
 * documents the fields the HuggingFace flavor reads.
 */
export interface HuggingFaceClientServerEvent {
    type?: string;
    delta?: string;
    transcript?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    response?: { usage?: { input_tokens?: number; output_tokens?: number } };
    error?: { message?: string; code?: string };
}

/**
 * The minimal websocket surface this client depends on. Structurally identical to the shared
 * {@link IOpenAIProtocolClientSocket} (kept as this module's own named export for back-compat —
 * structural typing makes the two interchangeable).
 */
export type IHuggingFaceClientSocket = IOpenAIProtocolClientSocket;

/** Structural subset of the platform `WebSocket` used by the production {@link HuggingFaceRealtimeClient.createSocket}. */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    send(data: string): void;
    close(): void;
}

// ── The driver ─────────────────────────────────────────────────────────────────

/**
 * HuggingFace speech-to-speech implementation of {@link BaseRealtimeClient}: a **browser-direct**
 * websocket that speaks the OpenAI-Realtime wire protocol over the shared PCM audio plane.
 *
 * Registered under the key `'huggingface'` — the `Provider` string the server's `HuggingFaceRealtime`
 * driver stamps — so hosts resolve it without referencing this class directly.
 *
 * The `EphemeralToken` is the full `wss://<mjapi-public>/realtime-proxy?ticket=…` URL (ElevenLabs-style
 * — the credential IS the URL): the browser connects to MJAPI's realtime proxy, which tunnels
 * transparently to the internal self-hosted endpoint. The client never learns the internal endpoint.
 *
 * Because HuggingFace speaks the OpenAI wire protocol over a websocket with a client-owned PCM
 * plane, nearly everything lives in the shared layers (protocol brain + websocket transport in
 * {@link OpenAIProtocolWebSocketRealtimeClient}). This class supplies only the HuggingFace
 * specifics: the proxy-URL connect, the `{ session, sampleRate }` server-pact parsing, the
 * `session.created` readiness gate (OpenAI ordering — a `session.update` sent earlier is
 * dropped), and the benign close semantics of a self-hosted proxy hop.
 */
@RegisterClass(BaseRealtimeClient, 'huggingface')
export class HuggingFaceRealtimeClient extends OpenAIProtocolWebSocketRealtimeClient {
    /** @inheritdoc — used in the shared diagnostics + close messages. */
    protected override get providerDebugLabel(): string {
        return 'HuggingFaceRealtimeClient';
    }

    // ── Transport hooks ────────────────────────────────────────────────────────

    /** @inheritdoc — the proxy URL IS the credential (one-time ticket in the query string). */
    protected openProviderSocket(config: ClientRealtimeSessionConfig): IOpenAIProtocolClientSocket {
        return this.createSocket(config.EphemeralToken);
    }

    /** @inheritdoc — the endpoint drops `session.update` until `session.created` confirms the session. */
    protected override get waitsForSessionCreated(): boolean {
        return true;
    }

    /** @inheritdoc — extracts the wire-shaped `session` object from the `{ session, sampleRate }` pact. */
    protected override resolveSessionObject(config: ClientRealtimeSessionConfig): JSONObject {
        const sessionConfig: JSONObject = config.SessionConfig ?? {};
        const raw = sessionConfig['session'];
        return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JSONObject) : {};
    }

    /** @inheritdoc — the pact's `sampleRate`, defaulting to the HF-native 16 kHz. */
    protected resolveSampleRate(config: ClientRealtimeSessionConfig): number {
        const raw = config.SessionConfig?.['sampleRate'];
        return typeof raw === 'number' && raw > 0 ? raw : HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE;
    }

    /**
     * @inheritdoc
     *
     * A close the consumer didn't ask for is reported as a terminal `'closed'` — NOT the fatal
     * error the cloud providers surface: the self-hosted proxy hop closes benignly (ticket
     * expiry, upstream restart), and the host treats `'closed'` as the session-over signal.
     */
    protected override handleSocketClose(): void {
        if (this.closedByConsumer) {
            return;
        }
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    /** Creates the websocket to the given URL (the proxy URL). Production wraps the platform `WebSocket`. */
    protected createSocket(url: string): IHuggingFaceClientSocket {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('HuggingFaceRealtimeClient requires a global WebSocket (browser or Node 22+).');
        }
        const ws = new WS(url);
        const seam: IHuggingFaceClientSocket = {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send: (data) => ws.send(data),
            close: () => ws.close(),
        };
        ws.onopen = () => seam.onopen?.();
        ws.onmessage = (event) => seam.onmessage?.(String(event.data));
        ws.onerror = () => seam.onerror?.('HuggingFace realtime websocket error');
        ws.onclose = () => seam.onclose?.();
        return seam;
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link HuggingFaceRealtimeClient} is instantiated
 * dynamically through the ClassFactory, so a consumer must call this no-op to keep the `@RegisterClass`
 * side effect alive.
 */
export function LoadHuggingFaceRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
