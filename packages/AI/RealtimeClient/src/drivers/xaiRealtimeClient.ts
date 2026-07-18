import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import {
    OpenAIProtocolWebSocketRealtimeClient,
    IOpenAIProtocolClientSocket,
    OpenAIProtocolClientEvent,
    OpenAIProtocolServerEvent,
} from '../generic/openAIProtocolClient';

// ── Audio + endpoint constants (xAI Grok Voice wire format) ────────────────────

/**
 * The Grok Voice realtime websocket endpoint. The model is appended as a `?model=` query
 * parameter, derived from `config.Model` (e.g. `grok-voice-latest`) — unlike OpenAI's GA
 * browser flow (where the ephemeral secret encodes the model), xAI takes the model on the URL.
 */
export const XAI_REALTIME_WS_URL = 'wss://api.x.ai/v1/realtime';

/**
 * Browser auth rides as a websocket SUBPROTOCOL with this prefix: the ephemeral client secret
 * is passed as `"xai-client-secret." + token`. Browsers cannot set request headers on a
 * websocket handshake, so an `Authorization` header is impossible — the subprotocol channel is
 * how the server-minted one-time credential reaches xAI (no API key ever touches the browser).
 */
export const XAI_CLIENT_SECRET_SUBPROTOCOL_PREFIX = 'xai-client-secret.';

/**
 * The Grok Voice wire audio format is FIXED: 16-bit signed little-endian PCM, mono, 24 kHz,
 * base64-encoded, in BOTH directions (`input_audio_buffer.append` up, `response.audio.delta`
 * down) — there is no per-session format negotiation on this provider.
 */
export const XAI_PCM_SAMPLE_RATE = 24000;

/**
 * Structural subset of the platform `WebSocket` used by the production
 * {@link xAIRealtimeClient.createSocket} seam (typed structurally so the package compiles
 * independent of DOM lib configuration). The two-arg constructor carries the subprotocol auth.
 */
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
 * xAI Grok Voice implementation of {@link BaseRealtimeClient}: a **browser-direct** websocket
 * connection to xAI's Grok Voice realtime API, authenticated with the server-minted ONE-TIME
 * ephemeral client secret passed as a websocket SUBPROTOCOL (no API key ever reaches the
 * browser, and browsers cannot set a handshake `Authorization` header).
 *
 * Registered with the ClassFactory under the key `'xai'` — the `Provider` string the server's
 * matching Grok Voice driver stamps on its `ClientRealtimeSessionConfig` — so hosts resolve it
 * without referencing this class directly.
 *
 * Grok Voice speaks the OpenAI Realtime wire protocol over a websocket with a client-owned PCM
 * audio plane, so nearly everything lives in the shared layers: the protocol brain
 * (`OpenAIProtocolRealtimeClient`) and the websocket+PCM transport
 * ({@link OpenAIProtocolWebSocketRealtimeClient}). This class supplies only the Grok
 * specifics: the model-on-URL endpoint + subprotocol auth, the FIXED 24 kHz audio format,
 * Grok's STREAMED input-transcription behavior, and wire diagnostics.
 *
 * Connect handshake (shared skeleton): open the socket → apply the server-authored
 * `config.SessionConfig` via `session.update` on OPEN (this protocol has no separate readiness
 * ack, so applying the config on open is the readiness boundary — obligation #7) → build the
 * audio plane at 24 kHz → report `'listening'`.
 */
@RegisterClass(BaseRealtimeClient, 'xai')
export class xAIRealtimeClient extends OpenAIProtocolWebSocketRealtimeClient {
    /**
     * Whether the CURRENT user turn has already emitted a transcription. Grok streams input
     * transcription as repeated `.completed` events (each the full growing text), so the first emission
     * of a turn appends a caption and the rest are flagged ReplacesPrevious — one in-place bubble, not a
     * stack of growing duplicates. Reset on each `input_audio_buffer.speech_started` (new turn).
     */
    private userTurnTranscribed = false;

    /** @inheritdoc — used in the shared diagnostics + close messages. */
    protected override get providerDebugLabel(): string {
        return 'xAIRealtimeClient';
    }

    // ── Transport hooks ────────────────────────────────────────────────────────

    /** @inheritdoc — model on the URL, ephemeral secret as the subprotocol. */
    protected openProviderSocket(config: ClientRealtimeSessionConfig): IOpenAIProtocolClientSocket {
        const url = `${XAI_REALTIME_WS_URL}?model=${encodeURIComponent(config.Model)}`;
        const subprotocol = `${XAI_CLIENT_SECRET_SUBPROTOCOL_PREFIX}${config.EphemeralToken}`;
        return this.createSocket(url, subprotocol);
    }

    /** @inheritdoc — the Grok Voice wire format is fixed at 24 kHz PCM16 both directions. */
    protected resolveSampleRate(_config: ClientRealtimeSessionConfig): number {
        return XAI_PCM_SAMPLE_RATE;
    }

    /**
     * Creation seam for the realtime websocket. Production wraps the platform-global `WebSocket`
     * opened against the model-on-URL endpoint WITH the `xai-client-secret.<token>` subprotocol
     * (browser auth — no handshake header is possible); unit tests override this to return an
     * in-memory fake. Handlers are attached by the shared Connect AFTER this returns, so the
     * implementation must not require them at construction time.
     */
    protected createSocket(url: string, subprotocol: string): IOpenAIProtocolClientSocket {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string | string[]) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('xAIRealtimeClient requires a global WebSocket (browser or Node 22+).');
        }
        const ws = new WS(url, subprotocol);
        const seam: IOpenAIProtocolClientSocket = {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send: (data) => ws.send(data),
            close: () => ws.close(),
        };
        ws.onopen = () => seam.onopen?.();
        ws.onmessage = (event) => seam.onmessage?.(String(event.data));
        ws.onerror = () => seam.onerror?.('xAI Grok Voice websocket error');
        ws.onclose = () => seam.onclose?.();
        return seam;
    }

    // ── Grok behavior overrides ────────────────────────────────────────────────

    /**
     * @inheritdoc
     *
     * Grok STREAMS the input transcription — repeated `input_audio_transcription.completed`
     * events, each carrying the full text so far — unlike OpenAI's single final. So the FIRST
     * emission of a turn appends a fresh caption and every later one is flagged
     * ReplacesPrevious, collapsing the stream into ONE in-place-updating user bubble. The
     * per-turn flag resets on the next `speech_started` ({@link onSpeechStartedFrame}).
     */
    protected override onUserTranscriptFrame(transcript: string): void {
        if (transcript && transcript.trim().length > 0) {
            this.emitTranscript({
                Role: 'User', Text: transcript, IsFinal: true, Kind: 'normal',
                ReplacesPrevious: this.userTurnTranscribed,
            });
            this.userTurnTranscribed = true;
        }
    }

    /**
     * @inheritdoc
     *
     * On top of the shared websocket behavior (flush local playout on TRUE barge-in, gated
     * interruption): a new user turn begins, so the streamed-transcription flag resets, and an
     * interrupted response's busy flag is cleared eagerly (Grok cancels its own turn; clearing
     * now lets a queued tool result fire without waiting on the trailing `response.done`).
     */
    protected override onSpeechStartedFrame(): void {
        this.userTurnTranscribed = false;
        if (this.responseActive || this.IsAudioPlaying) {
            this.playback?.Flush();
            this.responseActive = false;
            this.activeResponseKind = 'normal';
            // Floor to the user — drop the queued auto-trigger (see the brain's docstring).
            this.pendingResultResponse = false;
            this.emitInterruption();
        }
        this.setState('listening');
    }

    /** @inheritdoc — provider-branded transport-error message (kept stable for hosts/logs). */
    protected override formatTransportError(message: string): string {
        return `xAI Grok Voice realtime transport error: ${message}`;
    }

    /** @inheritdoc — provider-branded unexpected-close message (kept stable for hosts/logs). */
    protected override get unexpectedCloseMessage(): string {
        return 'xAI Grok Voice realtime connection closed unexpectedly';
    }

    // ── Wire diagnostics (a silent Grok session is otherwise undebuggable) ────

    /** @inheritdoc — log every inbound event type; error frames include their payload. */
    protected override logInboundEvent(event: OpenAIProtocolServerEvent): void {
        console.debug('[xAIRealtimeClient] ◀ inbound:', event.type,
            event.type === 'error' ? JSON.stringify(event).slice(0, 400) : '');
    }

    /** @inheritdoc */
    protected override onNonJsonFrame(raw: string): void {
        console.debug('[xAIRealtimeClient] ◀ inbound NON-JSON frame:', String(raw).slice(0, 200));
    }

    /** @inheritdoc — log outbound control frames (skip the high-frequency mic audio). */
    protected override logOutboundEvent(event: OpenAIProtocolClientEvent): void {
        if (event.type !== 'input_audio_buffer.append') {
            console.debug('[xAIRealtimeClient] ▶ outbound:', event.type);
        }
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link xAIRealtimeClient} is instantiated
 * dynamically through the ClassFactory, so a consumer must call this no-op to create a static
 * code path that keeps the `@RegisterClass` side effect alive.
 */
export function LoadxAIRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
