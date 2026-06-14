import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient, RealtimeClientState } from '../generic/baseRealtimeClient';
import { base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { createPcmMicCapture, IPcmMicCapture } from '../audio/micCapture';

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

// ── xAI Realtime SERVER event interfaces (discriminated union by `type`) ───────
// Grok Voice is OpenAI-Realtime-API COMPATIBLE, so these mirror the OpenAI server frames.
// We model only the fields this client consumes; provider payloads are larger, but every
// field we read is typed so there are no `any` leaks.

/** Streaming delta of the assistant's spoken-text transcript (GA or beta event name). */
export interface XAIResponseAudioTranscriptDelta {
    type: 'response.output_audio_transcript.delta' | 'response.audio_transcript.delta';
    delta: string;
    response_id?: string;
    item_id?: string;
}

/** Final assistant transcript for a turn (GA or beta event name). */
export interface XAIResponseAudioTranscriptDone {
    type: 'response.output_audio_transcript.done' | 'response.audio_transcript.done';
    transcript: string;
    response_id?: string;
    item_id?: string;
}

/**
 * One base64 PCM16 chunk of the agent's spoken output. The GA event is
 * `response.audio.delta`; the GA-output alias `response.output_audio.delta` is also accepted
 * so playback populates regardless of the model generation.
 */
export interface XAIResponseAudioDelta {
    type: 'response.audio.delta' | 'response.output_audio.delta';
    delta: string;
    response_id?: string;
    item_id?: string;
}

/** Final transcription of the user's spoken input for a turn. */
export interface XAIInputAudioTranscriptionCompleted {
    type: 'conversation.item.input_audio_transcription.completed';
    transcript: string;
    item_id?: string;
}

/** The model finished assembling a function (tool) call and wants it executed. */
export interface XAIFunctionCallArgumentsDone {
    type: 'response.function_call_arguments.done';
    call_id: string;
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
}

/** The provider detected the user starting to speak (barge-in). */
export interface XAIInputAudioBufferSpeechStarted {
    type: 'input_audio_buffer.speech_started';
}

/** A new response (turn) started — tracked so we never start a second overlapping response. */
export interface XAIResponseCreated {
    type: 'response.created';
}

/**
 * A full response (turn) completed — carries the usage payload for THIS response
 * (`input_tokens` / `output_tokens`), i.e. per-response DELTAS, exactly the `OnUsage`
 * contract shape.
 */
export interface XAIResponseDone {
    type: 'response.done';
    response?: { usage?: { input_tokens?: number; output_tokens?: number; [detail: string]: unknown } };
}

/** Provider-side error frame. */
export interface XAIErrorEvent {
    type: 'error';
    error?: { message?: string; code?: string };
}

/** Events whose `type` we don't explicitly handle still parse to this shape. */
export interface XAIUnknownEvent {
    type: string;
}

export type XAIRealtimeEvent =
    | XAIResponseAudioTranscriptDelta
    | XAIResponseAudioTranscriptDone
    | XAIResponseAudioDelta
    | XAIInputAudioTranscriptionCompleted
    | XAIFunctionCallArgumentsDone
    | XAIInputAudioBufferSpeechStarted
    | XAIResponseCreated
    | XAIResponseDone
    | XAIErrorEvent
    | XAIUnknownEvent;

// ── xAI Realtime CLIENT event interfaces (frames WE send) ──────────────────────

/** Applies the server-built session config (instructions + tools) to the live session. */
export interface XAISessionUpdateEvent {
    type: 'session.update';
    session: JSONObject;
}

/** A user or system `message` conversation item. */
export interface XAIMessageItem {
    type: 'message';
    role: 'user' | 'system';
    content: Array<{ type: 'input_text'; text: string }>;
}

/** The output of an executed function (tool) call, correlated by `call_id`. */
export interface XAIFunctionCallOutputItem {
    type: 'function_call_output';
    call_id: string;
    output: string;
}

/** Creates a conversation item (message or tool output). */
export interface XAIConversationItemCreateEvent {
    type: 'conversation.item.create';
    item: XAIMessageItem | XAIFunctionCallOutputItem;
}

/** Asks the model to produce a response, optionally with one-off instructions. */
export interface XAIResponseCreateEvent {
    type: 'response.create';
    response?: { instructions: string };
}

/** Cancels the model's in-flight response (generation stops; a response.done follows). */
export interface XAIResponseCancelEvent {
    type: 'response.cancel';
}

/** Appends one base64 PCM16 mic chunk to the provider's input audio buffer. */
export interface XAIInputAudioBufferAppendEvent {
    type: 'input_audio_buffer.append';
    audio: string;
}

export type XAIRealtimeClientEvent =
    | XAISessionUpdateEvent
    | XAIConversationItemCreateEvent
    | XAIResponseCreateEvent
    | XAIResponseCancelEvent
    | XAIInputAudioBufferAppendEvent;

// ── Structural transport seam (fakes in tests, native WebSocket in prod) ───────

/**
 * The minimal websocket surface this client depends on: assignable lifecycle handlers plus
 * `send`/`close`. Declaring the seam as an interface (rather than the platform `WebSocket`)
 * lets unit tests inject a fully in-memory fake that captures outbound frames and drives the
 * handlers with xAI-shaped events — no websocket, no network.
 */
export interface IxAIClientSocket {
    /** Invoked once the socket is open. */
    onopen: (() => void) | null;
    /** Invoked with each inbound frame's raw string payload. */
    onmessage: ((data: string) => void) | null;
    /** Invoked on a socket-level error (fatal). */
    onerror: ((message: string) => void) | null;
    /** Invoked when the socket closes (any reason). */
    onclose: (() => void) | null;
    /** Sends one JSON-serialized client frame. */
    send(data: string): void;
    /** Terminates the underlying connection. */
    close(): void;
}

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
 * It is the structural CROSS of the two sibling drivers:
 * - Like the AssemblyAI client driver, the transport is a WEBSOCKET and the audio plane is
 *   CLIENT-OWNED: mic PCM16 streams out as base64 frames via the shared {@link createPcmMicCapture}
 *   worklet, and the agent's base64 audio chunks feed the shared {@link RealtimePcmPlayback}
 *   engine ({@link IsAudioPlaying} comes from its playout clock). There is NO SDP handshake, NO
 *   peer connection, NO remote-audio sink element.
 * - Like the OpenAI client driver, the EVENT PROTOCOL is OpenAI-Realtime-API compatible: the
 *   same client events (session.update, conversation.item.create, response.create,
 *   response.cancel, input_audio_buffer.append) and the same server events
 *   (response.output_audio_transcript.delta and .done, response.audio.delta,
 *   conversation.item.input_audio_transcription.completed,
 *   response.function_call_arguments.done, response.created, response.done,
 *   input_audio_buffer.speech_started, error). The response state machine, narration-kind
 *   tagging, and tool-result queueing are identical to the OpenAI driver.
 *
 * Connect handshake: open the model-on-URL endpoint with the subprotocol auth → on socket open,
 * apply the server-authored `config.SessionConfig` via a `session.update` frame → build the
 * audio plane at the provider's FIXED 24 kHz PCM16 format → report `'listening'`. The
 * `'listening'` gate is the socket-open + session.update applied point (obligation #7): unlike
 * AssemblyAI there is no separate `session.ready` confirmation in this protocol, so applying the
 * config on open is the readiness boundary.
 */
@RegisterClass(BaseRealtimeClient, 'xai')
export class xAIRealtimeClient extends BaseRealtimeClient {
    // ── Transport / audio resources ────────────────────────────────────────────
    private socket: IxAIClientSocket | null = null;
    private micStream: MediaStream | null = null;
    private micCapture: IPcmMicCapture | null = null;
    private playback: IRealtimePcmPlayback | null = null;
    /**
     * The server-built session config applied verbatim via `session.update` once the socket
     * opens. Protected so test subclasses can seed it without a full Connect.
     */
    protected sessionConfig: JSONObject | null = null;

    // ── Response state machine (mirrors the OpenAI client driver) ──────────────
    /** Accumulates the in-flight assistant transcript across delta frames. */
    private pendingAssistantText = '';
    /** True while the model has a response in flight; gates narration + queues the tool result. */
    private responseActive = false;
    /** Set when a tool result is ready while a response is active; sent on the next response.done. */
    private pendingResultResponse = false;
    /**
     * Set by {@link RequestSpokenUpdate} just before it sends its `response.create`, and
     * CONSUMED by the very next `response.created` frame, which stamps
     * {@link activeResponseKind} for that turn.
     */
    private pendingNarrationKind = false;
    /**
     * The kind of the response currently in flight. Event ordering: `response.created` →
     * transcript deltas → `*_audio_transcript.done` → `response.done`. The transcript-done
     * frame therefore arrives while the kind is still set, letting {@link onAssistantDone}
     * classify the turn; `response.done` then resets the kind to `'normal'`.
     */
    private activeResponseKind: 'normal' | 'narration' = 'normal';
    /**
     * The client's own view of the session state — mirrors what {@link emitStateChange} last
     * reported, EXCEPT after a tool call is emitted: the host typically shows its own busy
     * indicator then, so the client silently leaves `'speaking'` (no emission) to preserve the
     * host's indicator until the result reply starts (see {@link handleEvent}).
     */
    private currentState: RealtimeClientState = 'closed';
    /** True once Disconnect ran — an expected socket close must not surface as fatal. */
    private closedByConsumer = false;

    // ── BaseRealtimeClient: connection lifecycle ───────────────────────────────

    /**
     * Opens the client-direct Grok Voice websocket: the model-on-URL endpoint with the
     * subprotocol auth, the server-authored `config.SessionConfig` applied via `session.update`
     * once the socket opens, then the audio plane at the provider's fixed 24 kHz format. Reports
     * `'listening'` only after all of that (obligation #7).
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.sessionConfig = config.SessionConfig;
        this.micStream = micStream;
        this.closedByConsumer = false;
        this.setState('connecting');

        let openSocket: (() => void) | null = null;
        let failOpen: ((error: Error) => void) | null = null;
        const opened = new Promise<void>((resolve, reject) => {
            openSocket = resolve;
            failOpen = reject;
        });

        const url = `${XAI_REALTIME_WS_URL}?model=${encodeURIComponent(config.Model)}`;
        const subprotocol = `${XAI_CLIENT_SECRET_SUBPROTOCOL_PREFIX}${config.EphemeralToken}`;
        const socket = this.createSocket(url, subprotocol);
        this.socket = socket;
        socket.onopen = () => openSocket?.();
        socket.onmessage = (data) => this.handleSocketMessage(data);
        socket.onerror = (message) => {
            failOpen?.(new Error(message));
            this.handleSocketError(message);
        };
        socket.onclose = () => {
            failOpen?.(new Error('xAI Grok Voice socket closed during connect'));
            this.handleSocketClose();
        };

        await opened;
        this.setState('connected');
        // The server-authored session config (the SessionConfig pact) is applied as the FIRST
        // frame — prompt and tool authority stay server-side (obligation #8). This protocol has
        // no separate readiness ack, so applying the config on open IS the readiness boundary.
        this.applySessionConfig();

        this.playback = this.createPlayback(XAI_PCM_SAMPLE_RATE);
        this.micCapture = await this.createMicCapture(micStream, XAI_PCM_SAMPLE_RATE, (base64Pcm16) =>
            this.sendMicChunk(base64Pcm16)
        );
        // Audio-activity capability (base obligation #9): agent side taps the playout engine's
        // master gain; user side meters the mic stream. Null-safe — test fakes / no-WebAudio
        // environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForStream(micStream));
        this.setState('listening');
    }

    /**
     * Tears down the socket, mic capture, mic tracks, and playout engine, resets the response
     * state machine, and emits a final `'closed'` (unless already `'error'`). Safe to call more
     * than once.
     */
    public async Disconnect(): Promise<void> {
        this.closedByConsumer = true;
        this.closeAudioMeters();
        this.micStream?.getTracks().forEach((track) => track.stop());
        this.micStream = null;
        this.micCapture?.Stop();
        this.micCapture = null;
        this.playback?.Close();
        this.playback = null;
        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                /* already closing */
            }
            this.socket = null;
        }
        this.sessionConfig = null;
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── BaseRealtimeClient: outbound actions ──────────────────────────────────

    /**
     * Injects typed text as a user-role `message` conversation item, then triggers a reply
     * through the SAME collision-safe path tool results use ({@link requestResultResponse}).
     * No-op when the socket isn't open.
     *
     * **SendText implies barge-in** (base-contract rule): an active spoken response is cancelled
     * via {@link CancelActiveResponse} before the text is injected, so the typed turn takes the
     * floor immediately instead of waiting behind stale speech. When nothing is active the cancel
     * is a no-op and the reply triggers immediately.
     */
    public SendText(text: string): void {
        if (!this.socket) {
            return;
        }
        this.CancelActiveResponse();
        this.sendEvent({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        });
        this.requestResultResponse();
    }

    /**
     * @inheritdoc
     *
     * Sends `response.cancel` (only when a response is actually in flight) and flushes the
     * locally-owned playout queue so already-generated speech stops coming out of the speaker
     * immediately. Resets the local response state machine (active flag, narration kind,
     * accumulated transcript) but PRESERVES any queued tool-result trigger: delegated work is
     * never affected by a floor-control cancel, and the queued trigger still fires on the
     * cancelled response's trailing `response.done`. No-op when idle or when the socket is gone.
     */
    public CancelActiveResponse(): void {
        if (!this.socket) {
            return;
        }
        if (!this.responseActive && !this.IsAudioPlaying) {
            return; // nothing active — no-op by contract
        }
        if (this.responseActive) {
            this.sendEvent({ type: 'response.cancel' });
            this.responseActive = false;
            this.pendingNarrationKind = false;
            this.activeResponseKind = 'normal';
            this.pendingAssistantText = '';
        }
        // The client OWNS the audio plane (websocket transport) — flush the local playout queue
        // so speech stops immediately (obligation #3), no provider clear frame is needed.
        this.playback?.Flush();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Injects a system-role context item the model can draw on the next time it speaks, WITHOUT
     * forcing a reply. Item creation is always safe mid-response, so it is sent immediately even
     * while a reply is in flight.
     *
     * NOTE: role must be 'system' — the OpenAI-compatible realtime API rejects 'developer' items.
     */
    public SendContextNote(text: string): void {
        if (!this.socket) {
            return;
        }
        this.sendEvent({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'system',
                content: [{ type: 'input_text', text }],
            },
        });
    }

    /**
     * Triggers ONE short spoken update with the given instructions. Marks the upcoming response
     * as `'narration'` (flag consumed by the next `response.created`) so its transcripts are
     * emitted with `Kind: 'narration'` — ephemeral by contract. Sets {@link responseActive}
     * eagerly so a tool result landing mid-narration queues instead of colliding.
     *
     * **Skips when busy** (base-contract collision rule — drivers MUST queue or skip): a
     * `response.create` sent while a response is in flight would be rejected/garbled by the
     * provider, and narration is disposable by contract, so the update is dropped with a debug
     * log rather than queued to come out late and stale. Hosts SHOULD still gate on
     * {@link IsBusy} / {@link IsAudioPlaying} for timing quality.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (!this.socket) {
            return;
        }
        if (this.responseActive) {
            console.debug('[xAIRealtimeClient] RequestSpokenUpdate skipped — a response is already in flight (narration is disposable).');
            return;
        }
        this.responseActive = true;
        this.pendingNarrationKind = true;
        this.sendEvent({ type: 'response.create', response: { instructions } });
    }

    /**
     * Sends the tool result back as a `function_call_output` conversation item, then triggers a
     * reply — immediately if the model is idle, otherwise queued until the current response
     * (e.g. a progress narration) finishes. Without the queueing the result's `response.create`
     * would collide with an in-flight narration and be dropped, leaving the model silent when
     * delegated work comes back.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (!this.socket) {
            return;
        }
        this.sendEvent({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callID,
                output: outputJson,
            },
        });
        this.requestResultResponse();
    }

    /**
     * Mutes / unmutes by toggling the mic tracks' `enabled` flag: the capture pipeline stays up
     * and streams SILENCE while muted (the provider's VAD sees a continuous stream and the
     * un-mute is glitch-free — same policy as the other client drivers).
     */
    public SetMuted(muted: boolean): void {
        const tracks = this.micStream?.getAudioTracks() ?? [];
        for (const track of tracks) {
            track.enabled = !muted;
        }
    }

    /** @inheritdoc */
    public get IsBusy(): boolean {
        return this.responseActive;
    }

    /**
     * @inheritdoc
     *
     * Computed directly from the playout engine's playhead clock — this client OWNS the output
     * buffer, so "audibly playing" is precisely "scheduled audio extends beyond the audio
     * context's current time".
     */
    public get IsAudioPlaying(): boolean {
        return this.playback?.IsPlaying ?? false;
    }

    // ── Overridable creation seams (tests inject fakes — no network / audio) ──

    /**
     * Creation seam for the realtime websocket. Production wraps the platform-global `WebSocket`
     * opened against the model-on-URL endpoint WITH the `xai-client-secret.<token>` subprotocol
     * (browser auth — no handshake header is possible); unit tests override this to return an
     * in-memory fake. Handlers are attached by {@link Connect} AFTER this returns, so the
     * implementation must not require them at construction time.
     */
    protected createSocket(url: string, subprotocol: string): IxAIClientSocket {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string | string[]) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('xAIRealtimeClient requires a global WebSocket (browser or Node 22+).');
        }
        const ws = new WS(url, subprotocol);
        const seam: IxAIClientSocket = {
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

    /**
     * Creation seam for the mic-capture pipeline at the provider's fixed 24 kHz rate. Production
     * delegates to the shared {@link createPcmMicCapture}; unit tests override this with a no-op
     * fake (and may capture `onPcmChunk` to simulate mic frames).
     */
    protected async createMicCapture(
        micStream: MediaStream,
        sampleRate: number,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IPcmMicCapture> {
        return createPcmMicCapture(micStream, sampleRate, onPcmChunk);
    }

    /**
     * Creation seam for the playout engine at the provider's fixed 24 kHz rate. Production
     * returns the shared {@link RealtimePcmPlayback}.
     */
    protected createPlayback(sampleRate: number): IRealtimePcmPlayback {
        return new RealtimePcmPlayback(sampleRate);
    }

    // ── Connection internals ───────────────────────────────────────────────────

    /**
     * Sends the server-controlled session config (instructions + tools) as a `session.update` so
     * the co-agent's identity and tool set apply. Skipped when the host supplied no config (e.g.
     * it failed to parse the server payload — the host already logged that; sending an EMPTY
     * `session.update` would be wrong).
     */
    private applySessionConfig(): void {
        if (!this.sessionConfig || Object.keys(this.sessionConfig).length === 0) {
            return;
        }
        this.sendEvent({ type: 'session.update', session: this.sessionConfig });
    }

    /** Streams one base64 PCM16 mic chunk as an `input_audio_buffer.append` frame. */
    private sendMicChunk(base64Pcm16: string): void {
        if (this.socket) {
            this.sendEvent({ type: 'input_audio_buffer.append', audio: base64Pcm16 });
        }
    }

    /** Surfaces a fatal socket error and marks the session unusable (obligation #6). */
    private handleSocketError(message: string): void {
        if (this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: `xAI Grok Voice realtime transport error: ${message}`, Fatal: true });
        this.setState('error');
    }

    /**
     * A socket close the CONSUMER didn't ask for is fatal: the provider hard-closes at token
     * expiry and when it ends the session itself, so an unexpected close is how credential /
     * session death reaches the host (obligation #6).
     */
    private handleSocketClose(): void {
        if (this.closedByConsumer || this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: 'xAI Grok Voice realtime connection closed unexpectedly', Fatal: true });
        this.setState('error');
    }

    // ── Inbound message translation ────────────────────────────────────────────

    /** Parses one raw socket payload; non-JSON frames are ignored. */
    private handleSocketMessage(data: string): void {
        let event: XAIRealtimeEvent;
        try {
            event = JSON.parse(data) as XAIRealtimeEvent;
        } catch {
            console.debug('[xAIRealtimeClient] ◀ inbound NON-JSON frame:', String(data).slice(0, 200));
            return; // non-JSON frame — ignore
        }
        if (event === null || typeof event !== 'object') {
            return; // valid JSON but not an event object (e.g. "null", a number) — ignore
        }
        // DIAGNOSTIC: log every inbound event type so a "connected but silent" session is debuggable —
        // surfaces error frames + any event whose name diverges from the OpenAI-compatible set (which
        // the handleEvent switch would otherwise drop silently). Error frames also log their payload.
        console.debug('[xAIRealtimeClient] ◀ inbound:', event.type,
            event.type === 'error' ? JSON.stringify(event).slice(0, 400) : '');
        this.handleEvent(event);
    }

    /** Dispatches a typed xAI realtime server event to the appropriate behavior. */
    private handleEvent(event: XAIRealtimeEvent): void {
        switch (event.type) {
            case 'response.output_audio_transcript.delta':
            case 'response.audio_transcript.delta':
                this.onAssistantDelta((event as XAIResponseAudioTranscriptDelta).delta);
                break;
            case 'response.output_audio_transcript.done':
            case 'response.audio_transcript.done':
                this.onAssistantDone((event as XAIResponseAudioTranscriptDone).transcript);
                break;
            case 'response.audio.delta':
            case 'response.output_audio.delta':
                this.onAudioDelta((event as XAIResponseAudioDelta).delta);
                break;
            case 'conversation.item.input_audio_transcription.completed':
                this.onUserTranscript((event as XAIInputAudioTranscriptionCompleted).transcript);
                break;
            case 'response.function_call_arguments.done':
                this.onToolCallFrame(event as XAIFunctionCallArgumentsDone);
                break;
            case 'input_audio_buffer.speech_started':
                this.onSpeechStarted();
                break;
            case 'response.created':
                this.responseActive = true;
                // Stamp the kind of THIS response: 'narration' only when the flag was set by
                // RequestSpokenUpdate immediately before its response.create (consumed here).
                this.activeResponseKind = this.pendingNarrationKind ? 'narration' : 'normal';
                this.pendingNarrationKind = false;
                break;
            case 'response.done':
                // A turn finished — release the lock and speak any queued tool result so the
                // model always voices the answer when delegated work comes back. The
                // transcript-done frame for this turn has already arrived (it precedes
                // response.done), so it's safe to reset the response kind here.
                this.responseActive = false;
                this.activeResponseKind = 'normal';
                this.emitResponseUsage(event as XAIResponseDone);
                this.flushPendingResultResponse();
                if (this.currentState === 'speaking') {
                    this.setState('listening');
                }
                break;
            case 'error':
                this.onErrorFrame(event as XAIErrorEvent);
                break;
            default:
                // Unhandled event types are expected (the provider emits many); no-op.
                break;
        }
    }

    /** Appends an assistant transcript delta, reflects `'speaking'`, and emits the delta. */
    private onAssistantDelta(delta: string): void {
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
        this.pendingAssistantText += delta;
        this.emitTranscript({ Role: 'Assistant', Text: delta, IsFinal: false, Kind: this.activeResponseKind });
    }

    /**
     * Finalizes the assistant turn: emits the final transcript tagged with the ACTIVE response
     * kind (the transcript-done frame arrives BEFORE `response.done`, so
     * {@link activeResponseKind} still reflects this turn), then returns to `'listening'`. Empty
     * turns emit nothing.
     */
    private onAssistantDone(transcript: string): void {
        const finalText = transcript || this.pendingAssistantText;
        this.pendingAssistantText = '';
        if (finalText.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: finalText, IsFinal: true, Kind: this.activeResponseKind });
        }
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Decodes one base64 PCM16 chunk of the agent's spoken output into the playout queue and
     * reflects `'speaking'`. The client OWNS the audio plane on this websocket transport (unlike
     * the WebRTC OpenAI driver where the peer connection plays the remote track), so agent audio
     * arrives as these deltas and is scheduled by the shared playout engine.
     */
    private onAudioDelta(deltaBase64: string): void {
        if (!deltaBase64) {
            return;
        }
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
        this.playback?.Enqueue(base64ToArrayBuffer(deltaBase64));
    }

    /** Emits the final transcription of the user's spoken input (always `Kind: 'normal'`). */
    private onUserTranscript(transcript: string): void {
        if (transcript && transcript.trim().length > 0) {
            this.emitTranscript({ Role: 'User', Text: transcript, IsFinal: true, Kind: 'normal' });
        }
    }

    /**
     * Surfaces a completed tool call to the host. Two deliberate behaviors mirror the OpenAI
     * driver: (1) the client silently leaves `'speaking'` (NO emission) so a host-rendered busy
     * indicator isn't clobbered by this turn's trailing `response.done` / playback frames
     * (obligation #1); (2) {@link responseActive} is CLEARED — the model has yielded the floor
     * pending the result, so a queued {@link SendToolResult} can never deadlock (obligation #2).
     */
    private onToolCallFrame(call: XAIFunctionCallArgumentsDone): void {
        if (this.currentState === 'speaking') {
            this.currentState = 'connected';
        }
        this.responseActive = false;
        this.emitToolCall({ CallID: call.call_id, ToolName: call.name, ArgumentsJson: call.arguments });
    }

    /**
     * The user started speaking. This is a TRUE barge-in only when it cut off active model output
     * (a response in flight or audio audibly playing) — a normal turn while the model is idle is
     * NOT an interruption, so the emission is gated (base-contract rule). On a true barge-in the
     * client OWNS the audio plane, so it flushes its own playout queue NOW (obligation #3),
     * surfaces the interruption, and returns the floor; the provider cancels its own turn and
     * emits a terminal `response.done`.
     */
    private onSpeechStarted(): void {
        if (!this.responseActive && !this.IsAudioPlaying) {
            this.setState('listening');
            return;
        }
        this.playback?.Flush();
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.emitInterruption();
        this.setState('listening');
    }

    /**
     * Emits the completed response's usage to the host as a DELTA (the `response.done` usage
     * payload covers exactly this response, so it is already incremental — the `OnUsage`
     * contract's preferred shape). Frames without a usage payload emit nothing.
     */
    private emitResponseUsage(event: XAIResponseDone): void {
        const usage = event.response?.usage;
        if (!usage) {
            return;
        }
        this.emitUsage({
            InputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
            OutputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
            Raw: usage,
        });
    }

    /** Surfaces a provider error frame (non-fatal; the session continues). */
    private onErrorFrame(event: XAIErrorEvent): void {
        this.emitError({
            Message: event.error?.message ?? 'Unknown provider error',
            Code: event.error?.code,
            Fatal: false,
        });
    }

    // ── Response state machine ─────────────────────────────────────────────────

    /**
     * Asks the model to speak (a tool result or typed-text reply) — immediately if it's idle,
     * otherwise queued until the current response finishes. An immediate trigger also CONSUMES
     * any queued trigger debt: every payload item is already in the conversation, so one
     * `response.create` voices everything (e.g. typed text barging in over a narration that had
     * tool results queued behind it).
     */
    private requestResultResponse(): void {
        if (!this.socket) {
            return;
        }
        if (this.responseActive) {
            this.pendingResultResponse = true;
            return;
        }
        this.pendingResultResponse = false;
        this.responseActive = true;
        this.sendEvent({ type: 'response.create' });
        this.setState('speaking');
    }

    /** On a turn completing, fire any queued tool-result response so the answer is spoken. */
    private flushPendingResultResponse(): void {
        if (!this.pendingResultResponse || !this.socket) {
            return;
        }
        this.pendingResultResponse = false;
        this.responseActive = true;
        this.sendEvent({ type: 'response.create' });
        this.setState('speaking');
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    private resetResponseState(): void {
        this.pendingAssistantText = '';
        this.responseActive = false;
        this.pendingResultResponse = false;
        this.pendingNarrationKind = false;
        this.activeResponseKind = 'normal';
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }

    /** JSON-serializes + sends a client event over the socket (only when open). */
    private sendEvent(event: XAIRealtimeClientEvent): void {
        // DIAGNOSTIC: log outbound control frames (skip the high-frequency mic audio) so we can see
        // session.update / conversation.item.create / response.create actually went out — the other
        // half of diagnosing a silent session.
        if (event.type !== 'input_audio_buffer.append') {
            console.debug('[xAIRealtimeClient] ▶ outbound:', event.type);
        }
        this.socket?.send(JSON.stringify(event));
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
