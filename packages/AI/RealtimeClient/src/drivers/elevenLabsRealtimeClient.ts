import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject, JSONValue } from '@memberjunction/ai';
import { BaseRealtimeClient, RealtimeClientState } from '../generic/baseRealtimeClient';
import { base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { createPcmMicCapture, IPcmMicCapture } from '../audio/micCapture';

// ── Audio constants (ElevenLabs Agents wire formats) ───────────────────────────

/**
 * Fallback PCM16 sample rate used when the `conversation_initiation_metadata` carries no
 * parseable `pcm_<rate>` format (the platform default for both directions is `pcm_16000`).
 */
const ELEVENLABS_DEFAULT_SAMPLE_RATE = 16000;

// ── Wire-event shapes (snake_case, exactly as the Agents websocket emits) ──────

/** A parsed inbound websocket frame. The Agents protocol multiplexes on `type`. */
export interface ElevenLabsServerEvent {
    type?: string;
    conversation_initiation_metadata_event?: {
        conversation_id?: string;
        agent_output_audio_format?: string;
        user_input_audio_format?: string;
    };
    audio_event?: { audio_base_64?: string; event_id?: number };
    user_transcription_event?: { user_transcript?: string };
    agent_response_event?: { agent_response?: string };
    agent_response_correction_event?: { original_agent_response?: string; corrected_agent_response?: string };
    client_tool_call?: { tool_name?: string; tool_call_id?: string; parameters?: JSONObject };
    interruption_event?: { event_id?: number };
    ping_event?: { event_id?: number; ping_ms?: number };
    vad_score_event?: { vad_score?: number };
}

// ── Structural transport seam (fakes in tests, native WebSocket in prod) ───────

/**
 * The minimal websocket surface this client depends on: assignable lifecycle handlers plus
 * `send`/`close`. Declaring the seam as an interface (rather than the platform `WebSocket`)
 * lets unit tests inject a fully in-memory fake that captures outbound frames and drives the
 * handlers with ElevenLabs-shaped events — no websocket, no network.
 */
export interface IElevenLabsClientSocket {
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
 * {@link ElevenLabsRealtimeClient.createSocket} seam (typed structurally so the package
 * compiles independent of DOM lib configuration).
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
 * ElevenLabs Agents implementation of {@link BaseRealtimeClient}: a **browser-direct**
 * conversation websocket authenticated with the server-minted SIGNED URL (the
 * `EphemeralToken` IS the `wss://…&token=…` URL — no API key ever reaches the browser).
 *
 * Registered with the ClassFactory under the key `'elevenlabs'` — the `Provider` string the
 * server's `ElevenLabsRealtime` driver stamps on its `ClientRealtimeSessionConfig`.
 *
 * Owns ALL ElevenLabs wire concerns (the behavioral twin of the Gemini client driver — the
 * audio plane is client-owned over a websocket, no WebRTC):
 * - **Connect handshake**: open the signed-URL socket → send
 *   `conversation_initiation_client_data` carrying the server-authored prompt override (from
 *   the `SessionConfig` pact) → wait for `conversation_initiation_metadata` → negotiate the
 *   PCM rates from `user_input_audio_format` / `agent_output_audio_format` → build the audio
 *   plane → `'listening'`. The state is gated on the metadata (driver obligation #7): only
 *   then has the platform confirmed the session — including the per-session system prompt —
 *   is applied.
 * - **Audio in**: mic PCM16 at the negotiated input rate via the shared
 *   {@link createPcmMicCapture} worklet pipeline, streamed as base64 `user_audio_chunk`
 *   frames (note: a bare-key frame, not a `type`d one — that is the wire contract).
 * - **Audio out**: `audio` events decoded into the shared {@link RealtimePcmPlayback} at the
 *   negotiated output rate; {@link IsAudioPlaying} comes from its playout clock.
 * - **Transcripts are FINAL-only**: the Agents socket emits whole-utterance
 *   `user_transcript` / `agent_response` events (no interim deltas), so every transcript this
 *   driver emits has `IsFinal: true`. `agent_response_correction` (post-barge-in truncation)
 *   re-finalizes the assistant turn with the text that was ACTUALLY spoken — hosts persisting
 *   transcripts should treat a final assistant transcript arriving right after an
 *   interruption as the authoritative replacement of the previous one.
 * - **Busy mapping**: `IsBusy` is set on the first `audio` / `agent_response` of a turn (and
 *   eagerly when this client triggers a response) and cleared on `agent_response_complete`,
 *   on `interruption`, and on a `client_tool_call` frame (the agent has yielded the floor
 *   pending the result — deadlock guard, obligation #2).
 * - **Narration**: ElevenLabs has no per-response-instructions channel, so
 *   {@link RequestSpokenUpdate} is EMULATED Gemini-style — the instructions ride as a
 *   `user_message` and the response kind is stamped `'narration'` AT SEND TIME (sends are the
 *   turn triggers; there is no `response.created`-style confirmation frame to stamp on), then
 *   reset on the response boundary. Fidelity caveat: the instruction enters the conversation
 *   as a user turn, so the agent may occasionally reference it; hosts should phrase narration
 *   instructions accordingly.
 * - **Cancel**: the protocol has no server-side cancel frame. {@link CancelActiveResponse}
 *   flushes the locally-owned playout queue (speech stops immediately) and marks the response
 *   inactive; residual server-side generation for a cancelled turn is simply not played.
 *   Spoken barge-in is handled by the platform's own VAD (which emits `interruption`), and a
 *   typed {@link SendText} takes the floor server-side as a fresh user turn.
 * - **No usage telemetry**: the Conversational AI socket exposes no token-usage events, so
 *   this driver NEVER emits {@link OnUsage} (registering a handler is safe; it just never
 *   fires — usage accounting for ElevenLabs sessions happens platform-side).
 */
@RegisterClass(BaseRealtimeClient, 'elevenlabs')
export class ElevenLabsRealtimeClient extends BaseRealtimeClient {
    // ── Transport / audio resources ────────────────────────────────────────────
    private socket: IElevenLabsClientSocket | null = null;
    private micStream: MediaStream | null = null;
    private micCapture: IPcmMicCapture | null = null;
    private playback: IRealtimePcmPlayback | null = null;

    // ── Response state machine ─────────────────────────────────────────────────
    /** True while an agent response is in flight; gates (queues) client-triggered sends. */
    private responseActive = false;
    /** The kind of the response currently in flight; stamped at send time, reset on boundary. */
    private activeResponseKind: 'normal' | 'narration' = 'normal';
    /** Sends deferred while a response is in flight; drained in order at the next boundary. */
    private queuedSends: Array<() => void> = [];
    /**
     * Nudge guard for tool results delivered AFTER the platform closed the turn (a long
     * delegation outlasting the agent's last utterance): {@link sendToolResultFrame}
     * optimistically marks a response active, but if NO model output actually arrives within
     * this window, the platform has silently absorbed the result — the timer fires a
     * user_message nudge so the outcome is always voiced (live finding).
     */
    private toolResultNudgeTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * Tool calls awaiting their result — used to make {@link SendToolResult} EXACTLY-ONCE:
     * the id is consumed when the result is accepted (queued or sent), so a duplicate send
     * for the same call is dropped with a warning instead of confusing the conversation.
     */
    private pendingToolCallIds = new Set<string>();
    /** True once Disconnect ran — an expected socket close must not surface as fatal. */
    private closedByConsumer = false;
    /**
     * The client's own view of the session state — mirrors what was last emitted, EXCEPT after
     * a tool call: the host typically shows its own busy indicator then, so the client silently
     * leaves `'speaking'` (no emission) until the result reply's first output re-asserts it.
     */
    private currentState: RealtimeClientState = 'closed';

    // ── BaseRealtimeClient: connection lifecycle ───────────────────────────────

    /**
     * Opens the client-direct conversation: socket to the signed URL, the initiation frame
     * carrying the server-authored prompt override, then — once the metadata confirms the
     * session config is applied — the audio plane at the NEGOTIATED sample rates. Reports
     * `'listening'` only after all of that (obligation #7).
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.micStream = micStream;
        this.closedByConsumer = false;
        this.setState('connecting');
        const overrides = this.parseOverrides(config);

        let openSocket: (() => void) | null = null;
        let failOpen: ((error: Error) => void) | null = null;
        let confirmMetadata: ((event: ElevenLabsServerEvent) => void) | null = null;
        let failMetadata: ((error: Error) => void) | null = null;
        const opened = new Promise<void>((resolve, reject) => {
            openSocket = resolve;
            failOpen = reject;
        });
        const metadata = new Promise<ElevenLabsServerEvent>((resolve, reject) => {
            confirmMetadata = resolve;
            failMetadata = reject;
        });
        // When the socket dies BEFORE open, Connect throws at `await opened` and never awaits
        // `metadata` — pre-consume its rejection so it can't surface as an unhandled rejection.
        metadata.catch(() => undefined);
        this.onInitiationMetadata = confirmMetadata;
        const failConnect = (error: Error) => {
            failOpen?.(error);
            failMetadata?.(error);
        };

        const socket = this.createSocket(config.EphemeralToken);
        this.socket = socket;
        socket.onopen = () => openSocket?.();
        socket.onmessage = (data) => this.handleSocketMessage(data);
        socket.onerror = (message) => {
            failConnect(new Error(message));
            this.handleSocketError(message);
        };
        socket.onclose = () => {
            failConnect(new Error('ElevenLabs conversation socket closed during connect'));
            this.handleSocketClose();
        };

        await opened;
        this.setState('connected');
        // The server-authored prompt override (the SessionConfig pact) is applied via the
        // initiation frame — the managed agent's platform settings enable exactly this field.
        this.sendFrame({ type: 'conversation_initiation_client_data', conversation_config_override: overrides });

        const metadataEvent = await metadata;
        const formats = metadataEvent.conversation_initiation_metadata_event;
        const outputRate = ElevenLabsRealtimeClient.ParsePcmRate(formats?.agent_output_audio_format, 'output');
        const inputRate = ElevenLabsRealtimeClient.ParsePcmRate(formats?.user_input_audio_format, 'input');
        this.playback = this.createPlayback(outputRate);
        this.micCapture = await this.createMicCapture(micStream, inputRate, (base64Pcm16) =>
            this.sendMicChunk(base64Pcm16)
        );
        // Audio-activity capability (base obligation #9): agent side taps the playout
        // engine's master gain; user side meters the mic stream. Null-safe — test fakes /
        // no-WebAudio environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForStream(micStream));
        this.setState('listening');
    }

    /**
     * Tears down the socket, mic capture, mic tracks, and playout engine, resets the response
     * state machine, and emits a final `'closed'` (unless already `'error'`). Safe to call
     * more than once.
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
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── BaseRealtimeClient: outbound actions ──────────────────────────────────

    /**
     * Injects typed text as a `user_message` (the platform's "respond to this" trigger).
     * No-op when the session is not open.
     *
     * **SendText implies barge-in** (base-contract rule): an active spoken response is
     * cancelled via {@link CancelActiveResponse} first — playback flushed, response marked
     * inactive, queued sends drained — so the typed turn takes the floor immediately. If a
     * drained queued send (e.g. a pending tool result) starts a new response, the text queues
     * behind it, preserving the tool-result delivery invariant. Server-side the fresh user
     * turn takes the floor on its own; no explicit cancel frame exists or is needed.
     */
    public SendText(text: string): void {
        if (!this.socket) {
            return;
        }
        this.CancelActiveResponse();
        this.enqueueOrRun(() => this.sendUserMessage(text, 'normal', true));
    }

    /**
     * @inheritdoc
     *
     * ElevenLabs has no cancel frame — the client OWNS the audio plane, so cancelling means:
     * flush the local playout queue (speech stops immediately), mark the in-flight response
     * inactive, and drain queued sends (a queued tool result takes the floor next — delivery
     * is never dropped by a cancel). Residual server-side generation for the cancelled turn is
     * simply never played; the platform's own VAD handles SPOKEN barge-in (emitting
     * `interruption`). No-op when nothing is active.
     */
    public CancelActiveResponse(): void {
        if (!this.socket) {
            return;
        }
        if (!this.responseActive && !this.IsAudioPlaying) {
            return; // nothing active — no-op by contract
        }
        this.playback?.Flush();
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.flushQueuedSends();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Injects background context via `contextual_update` — NATIVE on this provider: the
     * platform's purpose-built non-interrupting context channel. Sent immediately even while
     * a response is in flight (the platform guarantees it never triggers or disturbs
     * generation), so unlike the Gemini driver no queueing applies.
     */
    public SendContextNote(text: string): void {
        if (!this.socket) {
            return;
        }
        this.sendFrame({ type: 'contextual_update', text });
    }

    /**
     * Triggers ONE short spoken update. EMULATED as a `user_message` carrying the
     * instructions, with the resulting response stamped `Kind: 'narration'` at send time
     * (reset on the response boundary) — see the class-level fidelity caveat. Queued behind
     * any in-flight response (a `user_message` sent mid-response would barge in on it), per
     * the base contract's collision rule.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (!this.socket) {
            return;
        }
        this.enqueueOrRun(() => this.sendUserMessage(instructions, 'narration', false));
    }

    /**
     * Feeds an executed tool's result back via `client_tool_result`, correlated by the
     * platform's `tool_call_id`. EXACTLY-ONCE: the pending id is consumed when the result is
     * accepted, and a duplicate (or unknown) callID is dropped with a warning. Sent
     * immediately when idle — the platform speaks the result as the turn's continuation —
     * otherwise queued behind the in-flight response (e.g. a progress narration) so the
     * trigger is never lost.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (!this.socket) {
            return;
        }
        if (!this.pendingToolCallIds.has(callID)) {
            console.warn(
                `ElevenLabsRealtimeClient.SendToolResult: no pending tool call '${callID}' — duplicate or unknown result dropped.`
            );
            return;
        }
        this.pendingToolCallIds.delete(callID);
        this.enqueueOrRun(() => this.sendToolResultFrame(callID, outputJson));
    }

    /**
     * Mutes / unmutes by toggling the mic tracks' `enabled` flag: the capture pipeline stays
     * up and streams SILENCE while muted (the provider's VAD sees a continuous stream and the
     * un-mute is glitch-free — same policy as the OpenAI and Gemini client drivers).
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
     * Computed directly from the playout engine's playhead clock — this client OWNS the
     * output buffer, so "audibly playing" is precisely "scheduled audio extends beyond the
     * audio context's current time".
     */
    public get IsAudioPlaying(): boolean {
        return this.playback?.IsPlaying ?? false;
    }

    // ── Overridable creation seams (tests inject fakes — no network / audio) ──

    /**
     * Creation seam for the conversation websocket. Production wraps the platform-global
     * `WebSocket` opened against the signed URL; unit tests override this to return an
     * in-memory fake. Handlers are attached by {@link Connect} AFTER this returns, so the
     * implementation must not require them at construction time.
     */
    protected createSocket(signedUrl: string): IElevenLabsClientSocket {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('ElevenLabsRealtimeClient requires a global WebSocket (browser or Node 22+).');
        }
        const ws = new WS(signedUrl);
        const seam: IElevenLabsClientSocket = {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send: (data) => ws.send(data),
            close: () => ws.close(),
        };
        ws.onopen = () => seam.onopen?.();
        ws.onmessage = (event) => seam.onmessage?.(String(event.data));
        ws.onerror = () => seam.onerror?.('ElevenLabs conversation websocket error');
        ws.onclose = () => seam.onclose?.();
        return seam;
    }

    /**
     * Creation seam for the mic-capture pipeline at the NEGOTIATED input rate. Production
     * delegates to the shared {@link createPcmMicCapture}; unit tests override this with a
     * no-op fake (and may capture `onPcmChunk` to simulate mic frames).
     */
    protected async createMicCapture(
        micStream: MediaStream,
        sampleRate: number,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IPcmMicCapture> {
        return createPcmMicCapture(micStream, sampleRate, onPcmChunk);
    }

    /**
     * Creation seam for the playout engine at the NEGOTIATED output rate. Production returns
     * the shared {@link RealtimePcmPlayback}.
     */
    protected createPlayback(sampleRate: number): IRealtimePcmPlayback {
        return new RealtimePcmPlayback(sampleRate);
    }

    // ── Connection internals ───────────────────────────────────────────────────

    /** Resolver for the in-flight Connect's metadata wait (null outside Connect). */
    private onInitiationMetadata: ((event: ElevenLabsServerEvent) => void) | null = null;

    /**
     * Extracts the wire-shaped `conversation_config_override` from the server-minted
     * `SessionConfig` pact (`{ agentId, overrides, config }` — authored by the server's
     * `ElevenLabsRealtime.CreateClientSession`). Falls back to an empty override when absent
     * (the managed agent then runs on its stored base prompt).
     */
    private parseOverrides(config: ClientRealtimeSessionConfig): JSONObject {
        const sessionConfig: JSONObject = config.SessionConfig ?? {};
        const raw = sessionConfig['overrides'];
        return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JSONObject) : {};
    }

    /**
     * Parses a `pcm_<rate>` audio-format tag from the initiation metadata. Non-PCM formats
     * (e.g. `ulaw_8000` — a telephony-only configuration) are not playable/encodable by the
     * shared PCM pipeline; the driver warns and falls back to the platform default so the
     * session degrades loudly rather than throwing.
     */
    public static ParsePcmRate(format: string | undefined, direction: 'input' | 'output'): number {
        const match = /^pcm_(\d+)$/.exec(format ?? '');
        if (match) {
            return Number(match[1]);
        }
        if (format) {
            console.warn(
                `ElevenLabsRealtimeClient: unsupported ${direction} audio format '${format}' — only pcm_<rate> is ` +
                `supported; falling back to pcm_${ELEVENLABS_DEFAULT_SAMPLE_RATE}. Configure the agent for PCM audio.`
            );
        }
        return ELEVENLABS_DEFAULT_SAMPLE_RATE;
    }

    /** Streams one base64 PCM16 mic chunk as a bare-key `user_audio_chunk` frame. */
    private sendMicChunk(base64Pcm16: string): void {
        if (this.socket) {
            this.sendFrame({ user_audio_chunk: base64Pcm16 });
        }
    }

    /** Surfaces a fatal socket error and marks the session unusable (obligation #6). */
    private handleSocketError(message: string): void {
        if (this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: `ElevenLabs realtime transport error: ${message}`, Fatal: true });
        this.setState('error');
    }

    /**
     * A socket close the CONSUMER didn't ask for is fatal: ElevenLabs hard-closes at signed-URL
     * expiry and when the agent itself ends the conversation, so an unexpected close is how
     * credential / conversation death reaches the host (obligation #6).
     */
    private handleSocketClose(): void {
        if (this.closedByConsumer || this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: 'ElevenLabs conversation closed unexpectedly', Fatal: true });
        this.setState('error');
    }

    // ── Inbound message translation ────────────────────────────────────────────

    /** Parses one raw socket payload; non-JSON frames are ignored. */
    private handleSocketMessage(data: string): void {
        let event: ElevenLabsServerEvent;
        try {
            event = JSON.parse(data) as ElevenLabsServerEvent;
        } catch {
            return;
        }
        this.handleServerEvent(event);
    }

    /** Multiplexes one inbound frame to the focused per-concern handlers. */
    private handleServerEvent(event: ElevenLabsServerEvent): void {
        switch (event.type) {
            case 'conversation_initiation_metadata':
                this.onInitiationMetadata?.(event);
                this.onInitiationMetadata = null;
                break;
            case 'audio':
                this.handleAudio(event.audio_event?.audio_base_64);
                break;
            case 'user_transcript':
                this.handleUserTranscript(event.user_transcription_event?.user_transcript);
                break;
            case 'agent_response':
                this.handleAgentResponse(event.agent_response_event?.agent_response);
                break;
            case 'agent_response_correction':
                this.handleAgentResponseCorrection(event.agent_response_correction_event?.corrected_agent_response);
                break;
            case 'agent_response_complete':
                this.handleResponseComplete();
                break;
            case 'client_tool_call':
                this.handleClientToolCall(event.client_tool_call);
                break;
            case 'interruption':
                this.handleInterruption();
                break;
            case 'ping':
                this.sendFrame({ type: 'pong', event_id: event.ping_event?.event_id ?? 0 });
                break;
            case 'vad_score':
                break; // continuous voice-activity telemetry — deliberately ignored
            case 'guardrail_triggered':
                console.warn('ElevenLabsRealtimeClient: agent guardrail triggered', event);
                break;
            default:
                break; // unknown / future frame types are ignored
        }
    }

    /** Decodes one base64 model-audio frame into the playout queue and marks generation live. */
    private handleAudio(audioBase64: string | undefined): void {
        if (!audioBase64) {
            return;
        }
        this.markGenerationStarted();
        this.playback?.Enqueue(base64ToArrayBuffer(audioBase64));
    }

    /** User transcript: whole-utterance FINAL (this provider emits no interim deltas). */
    private handleUserTranscript(text: string | undefined): void {
        if (text && text.trim().length > 0) {
            this.emitTranscript({ Role: 'User', Text: text, IsFinal: true, Kind: 'normal' });
        }
    }

    /**
     * Agent response: the turn's complete text, emitted FINAL with the ACTIVE response kind so
     * narration turns are tagged correctly (stamp-at-send — see the class doc).
     */
    private handleAgentResponse(text: string | undefined): void {
        this.markGenerationStarted();
        if (text && text.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: text, IsFinal: true, Kind: this.activeResponseKind });
        }
    }

    /**
     * Post-barge-in correction: re-finalizes the assistant turn with the text that was
     * ACTUALLY spoken before the interruption cut it off. Emitted as a fresh FINAL assistant
     * transcript, `Kind: 'normal'` (the interruption already reset the response kind; a
     * truncated narration's correction is still just what was audibly said).
     */
    private handleAgentResponseCorrection(correctedText: string | undefined): void {
        if (correctedText && correctedText.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: correctedText, IsFinal: true, Kind: 'normal' });
        }
    }

    /**
     * Response boundary: release the busy lock, reset the response kind, drain queued sends
     * (stopping at the first one that starts a new response), and return the floor.
     */
    private handleResponseComplete(): void {
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.flushQueuedSends();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Surfaces the agent's tool call to the host. Two deliberate behaviors mirror the other
     * drivers: (1) the client silently leaves `'speaking'` (no emission) so a host-rendered
     * busy indicator isn't clobbered by the turn's trailing frames (obligation #1); (2)
     * `responseActive` is CLEARED — the agent has yielded the floor pending the result, so a
     * queued send can never deadlock (obligation #2). The queue is NOT drained here: a queued
     * narration must not inject a user turn between the tool call and its result.
     */
    private handleClientToolCall(call: { tool_name?: string; tool_call_id?: string; parameters?: JSONObject } | undefined): void {
        if (!call) {
            return;
        }
        if (this.currentState === 'speaking') {
            this.currentState = 'connected';
        }
        this.responseActive = false;
        const callID = call.tool_call_id ?? '';
        this.pendingToolCallIds.add(callID);
        this.emitToolCall({ CallID: callID, ToolName: call.tool_name ?? '', ArgumentsJson: JSON.stringify(call.parameters ?? {}) });
    }

    /**
     * True barge-in: the platform's VAD detected the user cutting off active agent output
     * (ElevenLabs only emits `interruption` for actual barge-ins, but the emission is still
     * gated on something genuinely being active — a spurious frame while idle is NOT an
     * interruption per the base contract). Flush playout, surface it, reset the response
     * machine, give the floor back. The queue is NOT drained — the user has the floor; queued
     * sends flush at the next response boundary.
     */
    private handleInterruption(): void {
        this.cancelToolResultNudge();
        if (!this.responseActive && !this.IsAudioPlaying) {
            return;
        }
        this.playback?.Flush();
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.emitInterruption();
        this.setState('listening');
    }

    /**
     * First model output of a response (audio or the response text): the agent is busy and
     * the client is audibly / imminently `'speaking'`.
     */
    private markGenerationStarted(): void {
        this.cancelToolResultNudge();
        this.responseActive = true;
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
    }

    // ── Collision-safe send machinery ──────────────────────────────────────────

    /**
     * Runs a send immediately when no response is in flight; otherwise queues it for the next
     * boundary (`agent_response_complete`). A `user_message` sent mid-response barges in on
     * it, so deferral is the safe default — mirroring the Gemini driver's rule.
     */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            return;
        }
        send();
    }

    /**
     * Drains queued sends in order at a response boundary, stopping as soon as one starts a
     * new response (sets {@link responseActive}) — the rest wait for that response to finish.
     */
    private flushQueuedSends(): void {
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /**
     * Sends a `user_message` that triggers a response, stamping the upcoming response's kind
     * at send time and eagerly marking the agent busy. `emitSpeaking` mirrors the other
     * drivers: typed text reflects `'speaking'` immediately; narration waits for the first
     * model output.
     */
    private sendUserMessage(text: string, kind: 'normal' | 'narration', emitSpeaking: boolean): void {
        if (!this.socket) {
            return;
        }
        this.sendFrame({ type: 'user_message', text });
        this.responseActive = true;
        this.activeResponseKind = kind;
        if (emitSpeaking) {
            this.setState('speaking');
        }
    }

    /**
     * Sends the `client_tool_result` frame (the platform speaks the result as the turn's
     * continuation — no explicit generation trigger exists or is needed) and eagerly marks
     * the agent busy so a queued narration can't slip in before the spoken result.
     */
    private sendToolResultFrame(callID: string, outputJson: string): void {
        if (!this.socket) {
            return;
        }
        this.sendFrame({
            type: 'client_tool_result',
            tool_call_id: callID,
            result: ElevenLabsRealtimeClient.ParseToolOutput(outputJson),
            is_error: false,
        });
        this.responseActive = true;
        this.activeResponseKind = 'normal';
        this.setState('speaking');
        this.armToolResultNudge();
    }

    /** How long to wait for real model output after a tool result before nudging. */
    private static readonly ToolResultNudgeMs = 1600;

    /** Arms the absorbed-tool-result nudge (see {@link toolResultNudgeTimer}). */
    private armToolResultNudge(): void {
        this.cancelToolResultNudge();
        this.toolResultNudgeTimer = setTimeout(() => {
            this.toolResultNudgeTimer = null;
            // No audio / response text arrived — the platform closed the turn before the
            // result landed and won't speak it on its own. Clear the optimistic busy mark
            // and explicitly ask for the outcome.
            this.responseActive = false;
            this.sendUserMessage(
                'The delegated work you were waiting on has just finished and its result has been ' +
                'delivered to you. Tell the user the outcome now, in your own first-person voice.',
                'normal',
                false
            );
        }, ElevenLabsRealtimeClient.ToolResultNudgeMs);
    }

    /** Cancels the nudge — real model output arrived (or the session is resetting). */
    private cancelToolResultNudge(): void {
        if (this.toolResultNudgeTimer) {
            clearTimeout(this.toolResultNudgeTimer);
            this.toolResultNudgeTimer = null;
        }
    }

    /**
     * Parses a JSON-stringified tool result into a structured value for the `result` slot,
     * falling back to the raw string so a free-text result still round-trips.
     */
    public static ParseToolOutput(output: string): JSONValue {
        try {
            return JSON.parse(output) as JSONValue;
        } catch {
            return output;
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** JSON-serializes and sends one client frame (no-op once the socket is gone). */
    private sendFrame(frame: JSONObject): void {
        this.socket?.send(JSON.stringify(frame));
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    private resetResponseState(): void {
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.queuedSends = [];
        this.pendingToolCallIds.clear();
        this.onInitiationMetadata = null;
    }

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link ElevenLabsRealtimeClient} is
 * instantiated dynamically through the ClassFactory, so a consumer must call this no-op
 * to create a static code path that keeps the `@RegisterClass` side effect alive.
 */
export function LoadElevenLabsRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
