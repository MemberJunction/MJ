import { RegisterClass } from '@memberjunction/global';
import {
    ClientRealtimeSessionConfig,
    JSONObject,
    JSONValue,
    RealtimeDiagLog,
    RealtimeIdleSignal,
    RealtimeToolBatchBarrier,
    RealtimeTrackDescriptor,
    ExtractToolSchedulingHint,
} from '@memberjunction/ai';
import {
    GoogleGenAI,
    FunctionResponseScheduling,
    type Blob as GeminiBlob,
    type Content,
    type FunctionCall,
    type FunctionResponse,
    type LiveConnectConfig,
    type LiveServerContent,
    type LiveServerMessage,
    type Transcription,
} from '@google/genai';
import { BaseRealtimeClient, RealtimeClientState } from '../generic/baseRealtimeClient';
import { base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { createPcmMicCapture, IPcmMicCapture } from '../audio/micCapture';
import { createStreamFrameCapture, IFrameCapture } from '../media/frameCapture';
import type { RealtimeUsageModalityDetail } from '@memberjunction/ai';

// ── Audio constants (Gemini Live wire formats) ─────────────────────────────────

/** Gemini Live expects client audio as 16-bit signed PCM, 16 kHz, mono. */
const GEMINI_INPUT_SAMPLE_RATE = 16000;
/** MIME type stamped on every streamed mic chunk. */
const GEMINI_INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';
/** Gemini Live emits model audio as 16-bit signed PCM, 24 kHz, mono. */
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// ── Structural transport seams (typed subsets — fakes in tests, SDK in prod) ──

/**
 * The minimal subset of `@google/genai`'s `Session` this client depends on. Declaring the seam
 * as an interface (rather than the concrete SDK `Session`) lets unit tests inject a fully
 * in-memory fake that captures outbound sends and drives the registered message callback with
 * Gemini-shaped frames — no websocket, no network. (Mirrors the server driver's
 * `GeminiLiveSession` seam.)
 */
export interface GeminiLiveClientSession {
    /**
     * Streams realtime user input to the model — mic audio frames, inbound video frames,
     * and mid-session text.
     */
    sendRealtimeInput(params: { audio?: GeminiBlob; text?: string; media?: GeminiBlob; video?: GeminiBlob }): void;
    /** Appends client content WITHOUT triggering generation (context notes, history seeding). */
    sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void;
    /** Replies to a server tool call with one or more function responses. */
    sendToolResponse(params: { functionResponses: FunctionResponse[] }): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/**
 * Arguments handed to {@link GeminiRealtimeClient.connectLiveSession}. Bundles the resolved
 * model + connect config (from the server-minted `SessionConfig`), the ephemeral token, and the
 * lifecycle callbacks so the seam owns the entire `live.connect` call and tests can substitute
 * it wholesale.
 */
export interface GeminiClientConnectArgs {
    /** The Gemini Live model id to open the session against. */
    Model: string;
    /** The server-built connect config (system instruction, tools, modalities, transcription). */
    Config: LiveConnectConfig;
    /** The server-minted ephemeral auth token (used as the API key on a `v1alpha` client). */
    EphemeralToken: string;
    /** Invoked for every {@link LiveServerMessage} the server emits over the session. */
    OnMessage: (message: LiveServerMessage) => void;
    /** Invoked on a websocket-level error (fatal). */
    OnError: (event: ErrorEvent) => void;
    /** Invoked when the websocket closes. */
    OnClose: (event: CloseEvent) => void;
}

/**
 * Handle returned by the mic-capture seam: the only operation the driver needs is teardown.
 * Production wraps an `AudioContext` + `AudioWorkletNode` pipeline; tests return a no-op fake.
 *
 * Back-compat alias for the shared {@link IPcmMicCapture} (the capture pipeline now lives in
 * `src/audio/micCapture.ts`, shared with the ElevenLabs driver).
 */
export type IGeminiMicCapture = IPcmMicCapture;

/**
 * The playback seam: schedules raw PCM16 chunks for gapless playout and reports whether audio
 * is AUDIBLY playing. Production is {@link GeminiPcmPlayback} (Web Audio, playhead-clock
 * scheduling); tests inject a fake with a controllable `IsPlaying`.
 *
 * Back-compat alias for the shared {@link IRealtimePcmPlayback} (the playout engine now lives
 * in `src/audio/pcmPlayback.ts`, shared with the ElevenLabs driver).
 */
export type IGeminiAudioPlayback = IRealtimePcmPlayback;

// ── Production playback engine ─────────────────────────────────────────────────

/**
 * Web Audio playout scheduler for Gemini's 24 kHz PCM16 model audio.
 *
 * A thin specialization of the shared {@link RealtimePcmPlayback} (playhead-clock scheduling,
 * gapless playout, honest `IsPlaying`) fixed at Gemini Live's 24 kHz output rate. Kept as a
 * named export for back-compat with existing consumers.
 */
export class GeminiPcmPlayback extends RealtimePcmPlayback {
    constructor() {
        super(GEMINI_OUTPUT_SAMPLE_RATE);
    }
}

// ── The driver ─────────────────────────────────────────────────────────────────

/**
 * Google Gemini implementation of {@link BaseRealtimeClient}: a **browser-direct** Gemini Live
 * websocket session authenticated with the server-minted ephemeral auth token (`v1alpha`
 * `auth_tokens` mechanism — the token is passed as the SDK `apiKey`).
 *
 * Registered with the ClassFactory under the key `'gemini'` — the `Provider` string the
 * server's `GeminiRealtime` driver stamps on its `ClientRealtimeSessionConfig` — so hosts
 * resolve it without referencing this class directly.
 *
 * Owns ALL Gemini wire concerns (the behavioral twin of {@link OpenAIRealtimeClient}, adapted
 * to Gemini's client-owned audio plane — there is no WebRTC here):
 * - **Audio in**: mic PCM16 @ 16 kHz captured via an inline-Blob `AudioWorklet`
 *   ({@link createMicCapture} seam) and streamed with `sendRealtimeInput`.
 * - **Audio out**: model PCM16 @ 24 kHz chunks scheduled through {@link GeminiPcmPlayback}
 *   ({@link createPlayback} seam); {@link IsAudioPlaying} is computed from the playout clock.
 * - **Event translation** (Gemini → contract): `inputTranscription` → User deltas/finals,
 *   `outputTranscription` → Assistant deltas/finals (accumulated like the OpenAI driver),
 *   `toolCall.functionCalls` → {@link OnToolCall} (callID→name cached for
 *   {@link SendToolResult}), `interrupted` → playback flush + `'listening'`,
 *   `turnComplete` → busy cleared + queued sends flushed, `usageMetadata` → {@link OnUsage}
 *   (per-turn prompt/response token deltas — see {@link handleUsageMetadata}).
 * - **Busy mapping**: Gemini has no `response.created` frame, so `IsBusy` is set EAGERLY when
 *   this client triggers a response (text / narration / tool result) and on the first model
 *   output of a turn (audio part or output-transcription delta); cleared on `turnComplete`,
 *   and on a `toolCall` frame (the model has yielded the floor pending the tool result — so a
 *   slow `turnComplete` can never deadlock the queued result).
 * - **Collision safety**: ANY `sendClientContent` interrupts in-flight Gemini generation (per
 *   the Live API contract), so text / narration / context-note / tool-result sends issued
 *   while a turn is in flight are queued and flushed in order on `turnComplete` (the flush
 *   stops at the first send that starts a new response).
 * - **Open-turn commit**: context notes ride as `turnComplete: false` client content, which
 *   tells the Live API MORE INPUT IS COMING — the server holds ALL generation (including the
 *   normally-automatic continuation after a tool response) until a `turnComplete: true`
 *   commit. {@link SendToolResult} therefore follows `sendToolResponse` with an empty-turn
 *   commit whenever a note left the turn open, so the model speaks the result immediately
 *   (the behavioral equivalent of the OpenAI driver's explicit `response.create`).
 - **Triggering turns ride realtime text**: typed text ({@link SendText}) and narration
 *   triggers ({@link RequestSpokenUpdate}) are sent via `sendRealtimeInput({ text })` — the
 *   Live API's documented in-conversation text path. Native-audio Live models treat
 *   `sendClientContent` as initial-history seeding only: a mid-call `turnComplete: true`
 *   client turn appends to history WITHOUT starting generation (the model stays silent until
 *   the user's next spoken turn), while realtime text triggers an immediate response on every
 *   model generation. Context notes stay on `sendClientContent` (`turnComplete: false`) — the
 *   silent history-append is exactly the contract they want.
 * - **Narration tagging**: {@link RequestSpokenUpdate} has no per-response-instructions
 *   equivalent on Gemini, so it is emulated as a realtime-text user turn carrying the
 *   instructions; the response kind is stamped `'narration'` at send time (sends ARE
 *   the turn triggers on Gemini, unlike OpenAI where `response.created` confirms) and reset to
 *   `'normal'` when the turn completes.
 */
@RegisterClass(BaseRealtimeClient, 'gemini')
export class GeminiRealtimeClient extends BaseRealtimeClient {
    public static readonly ASSISTANT_SAFETY_BACKSTOP_MS = 15000;

    // ── Transport / audio resources ────────────────────────────────────────────
    private session: GeminiLiveClientSession | null = null;
    private micStream: MediaStream | null = null;
    private cameraStream: MediaStream | null = null;
    private micCapture: IGeminiMicCapture | null = null;
    private cameraCapture: IFrameCapture | null = null;
    private playback: IGeminiAudioPlayback | null = null;
    private firstVideoSendTimestamp = 0;
    private lastVideoSendTimestamp = 0;
    protected videoFramesSent = 0;
    protected resumptionHandle: string | null = null;
    private lastConnectArgs: GeminiClientConnectArgs | null = null;

    /** Returns the latest session resumption handle reported by the server, if any. */
    public get ResumptionHandle(): string | null {
        return this.resumptionHandle;
    }

    /** Returns the count of video frames successfully sent over the established video track. */
    public get VideoFramesSent(): number {
        return this.videoFramesSent;
    }

    /** Returns the cumulative active video duration in seconds across sent video frames. */
    public get VideoSeconds(): number {
        if (this.firstVideoSendTimestamp === 0 || this.lastVideoSendTimestamp === 0) {
            return 0;
        }
        return Math.max(1, Math.round((this.lastVideoSendTimestamp - this.firstVideoSendTimestamp) / 1000) + 1);
    }

    // ── Model capability & profile state ───────────────────────────────────────
    private idleSignal: RealtimeIdleSignal = 'turnComplete';
    private supportsScheduling = true;
    private supportsBlocking = true;
    private interactionInProgress = false;
    private toolBatchBarrier = new RealtimeToolBatchBarrier();
    private assistantSafetyBackstopTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Whether the active model session enforces asynchronous non-blocking tool execution.
     * Derived from model tooling capability (!supportsBlocking), separated from the idle signal (Reviewer Item 19).
     */
    private get isNonBlocking(): boolean {
        return !this.supportsBlocking;
    }

    // ── Response state machine ─────────────────────────────────────────────────
    /** Accumulates the in-flight assistant transcript across delta frames. */
    private pendingAssistantText = '';
    /** Accumulates the in-flight user transcription across delta frames. */
    private pendingUserText = '';
    /** Accumulates in-flight thought text deltas until finalized on turn completion. */
    private pendingThoughtText = '';
    /** True while a model turn is in flight; gates (queues) client-triggered sends. */
    private responseActive = false;
    /** The kind of the turn currently in flight; stamped at send time, reset on turnComplete. */
    private activeResponseKind: 'normal' | 'narration' = 'normal';
    /** Sends deferred while a turn is in flight; drained in order on turnComplete. */
    private queuedSends: Array<() => void> = [];
    /**
     * Maps each pending tool call's `CallID` to its function name: Gemini's `sendToolResponse`
     * requires the function name, which the {@link SendToolResult} contract does not carry.
     */
    private pendingToolCallNames = new Map<string, string>();
    /**
     * True while client content sent with `turnComplete: false` (context notes) has not yet
     * been committed. Per the Live API, an open client turn tells the server MORE INPUT IS
     * COMING — clientContent-driven generation (notably the normally-automatic continuation
     * after a tool response) holds until a `turnComplete: true` arrives. Set by
     * {@link SendContextNote}; cleared by the empty-turn commit in
     * {@link sendToolResponseTurn} and on a model `turnComplete` (the generation consumed the
     * open content). Realtime-text triggers ({@link sendTriggeringUserTurn}) do NOT commit
     * client content and leave this flag untouched.
     */
    private openClientTurn = false;
    /**
     * The client's own view of the session state — mirrors what was last emitted, EXCEPT after
     * a tool call: the host typically shows its own busy indicator then, so the client silently
     * leaves `'speaking'` (no emission) until the result reply's first output re-asserts it.
     */
    private currentState: RealtimeClientState = 'closed';

    // ── BaseRealtimeClient: connection lifecycle ───────────────────────────────

    /**
     * Opens the client-direct Gemini Live session: creates the playout engine, connects with
     * the ephemeral token + the server-built `SessionConfig` (`{ model, config }` — the same
     * values the server LOCKED into the token, so tampering is ignored by the API), then wires
     * the mic-capture worklet. Reports `'listening'` once audio is flowing.
     */
    /**
     * Opens the client-direct Gemini Live session: creates the playout engine, connects with
     * the ephemeral token + the server-built `SessionConfig` (`{ model, config }` — the same
     * values the server LOCKED into the token, so tampering is ignored by the API), negotiates
     * tracks, then wires the mic-capture worklet and optional video capture.
     * Reports `'listening'` once audio is flowing.
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream, cameraStream?: MediaStream): Promise<void> {
        this.micStream = micStream;
        this.cameraStream = cameraStream ?? null;
        this.clearSafetyBackstop();
        this.toolBatchBarrier.Clear();
        this.firstVideoSendTimestamp = 0;
        this.lastVideoSendTimestamp = 0;
        this.videoFramesSent = 0;
        this.setState('connecting');
        const { model, liveConfig, idleSignal, supportsScheduling, supportsBlocking, requestedTracks } =
            this.parseSessionConfig(config);
        this.idleSignal = idleSignal;
        this.supportsScheduling = supportsScheduling;
        this.supportsBlocking = supportsBlocking;

        // Negotiate tracks:
        const isVideoModel = model.toLowerCase().startsWith('gemini-3.8-live');
        const supportedTracks: RealtimeTrackDescriptor[] = [
            { Modality: 'audio', Direction: 'inbound' },
            { Modality: 'audio', Direction: 'outbound' },
        ];
        if (isVideoModel) {
            supportedTracks.push({
                Modality: 'video',
                Direction: 'inbound',
                Encoding: 'image/jpeg',
                Rate: 1,
                UsageBasis: ['tokens', 'frames'] as const,
                RequiresConsent: true,
            });
        }
        this.negotiateTracks(requestedTracks, supportedTracks);

        this.playback = this.createPlayback();
        const connectArgs: GeminiClientConnectArgs = {
            Model: model,
            Config: liveConfig,
            EphemeralToken: config.EphemeralToken,
            OnMessage: (message) => this.handleServerMessage(message),
            OnError: (event) => this.handleTransportError(event),
            OnClose: () => this.handleTransportClose(),
        };
        this.lastConnectArgs = connectArgs;
        this.session = await this.connectLiveSession(connectArgs);
        this.setState('connected');
        this.micCapture = await this.createMicCapture(micStream, (base64Pcm16) => this.sendMicChunk(base64Pcm16));

        // Start camera capture if inbound video is established and cameraStream provided
        if (this.cameraStream && this.IsTrackEstablished('video', 'inbound')) {
            this.cameraCapture = createStreamFrameCapture(this.cameraStream, {
                Rate: 1,
                OnFrame: (frame) => this.SendVideoFrame(frame.data, frame.mimeType),
            });
        }

        // Audio-activity capability (base obligation #9): agent side taps the playout
        // engine's master gain; user side meters the mic stream. Null-safe — test fakes /
        // no-WebAudio environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
        this.setState('listening');
    }

    /**
     * Tears down the session, mic capture, mic tracks, camera capture, and playout engine,
     * resets the response state machine, and emits a final `'closed'` (unless already `'error'`).
     * Safe to call more than once.
     */
    public async Disconnect(): Promise<void> {
        this.closeAudioMeters();
        this.clearSafetyBackstop();
        this.toolBatchBarrier.Clear();
        this.micStream?.getTracks().forEach((track) => track.stop());
        this.micStream = null;
        this.cameraCapture?.Stop();
        this.cameraCapture = null;
        this.cameraStream?.getTracks().forEach((track) => track.stop());
        this.cameraStream = null;
        this.micCapture?.Stop();
        this.micCapture = null;
        this.playback?.Close();
        this.playback = null;
        this.resumptionHandle = null;
        this.firstVideoSendTimestamp = 0;
        this.lastVideoSendTimestamp = 0;
        this.videoFramesSent = 0;
        if (this.session) {
            try {
                this.session.close();
            } catch {
                /* already closing */
            }
            this.session = null;
        }
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── BaseRealtimeClient: outbound actions ──────────────────────────────────

    /**
     * Injects typed text as a realtime-text user turn (`sendRealtimeInput({ text })` —
     * Gemini's "respond now" trigger on every Live model generation, including native-audio
     * models that ignore mid-call `sendClientContent`). No-op when the session is not open.
     *
     * **SendText implies barge-in** (base-contract rule): an active spoken response is
     * cancelled via {@link CancelActiveResponse} first — playback flushed, turn marked
     * inactive, queued sends drained — so the typed turn takes the floor immediately. If a
     * drained queued send (e.g. a pending tool result) starts a new turn, the text queues
     * behind it, preserving the tool-result delivery invariant. On the wire, sending the
     * user turn itself interrupts any residual server-side generation (Gemini Live's
     * any-client-content-interrupts contract), so no explicit cancel frame exists or is
     * needed.
     */
    public SendText(text: string): void {
        if (!this.session) {
            return;
        }
        this.CancelActiveResponse();
        this.enqueueOrRun(() => this.sendTriggeringUserTurn(text, 'normal', true));
    }

    /**
     * Streams one base64 image frame over the established inbound video track.
     *
     * Enforces a 750ms minimum inter-frame spacing to serve as a backstop with deliberate jitter
     * headroom for upstream 1 fps (1000ms) pacers (such as `ChannelInboundVideoBridge`'s `setInterval`,
     * `frameCapture`, and screencast pumps). The upstream cadence generators are the primary enforcers
     * of the nominal 1 fps ceiling, while this 750ms gate absorbs event loop and async dispatch jitter
     * without dropping intended 1Hz frames, while preventing unpaced callers from bursting above 1.33 fps.
     *
     * If inbound video is not established, returns `false` without error or frame sends (fallback).
     *
     * @returns `true` if the frame was dispatched to the session; `false` if dropped (throttled
     *   or track unestablished).
     */
    public override SendVideoFrame(base64Image: string, mimeType: string = 'image/jpeg'): boolean {
        if (!this.IsTrackEstablished('video', 'inbound')) {
            return false;
        }
        const now = Date.now();
        if (this.lastVideoSendTimestamp > 0 && now - this.lastVideoSendTimestamp < 750) {
            return false; // Throttled: 750ms jitter headroom backstop for upstream 1 fps pacers (Reviewer Items 25, 30, 33)
        }
        this.lastVideoSendTimestamp = now;
        if (this.firstVideoSendTimestamp === 0) {
            this.firstVideoSendTimestamp = now;
        }
        this.videoFramesSent++;
        // Reviewer Item 31: Send `video` alone — do not populate sibling `media` slot to avoid duplicate bytes & billing
        this.session?.sendRealtimeInput({
            video: { data: base64Image, mimeType },
        });
        return true;
    }

    /**
     * @inheritdoc
     *
     * Gemini has no explicit cancel frame — the client OWNS the audio plane, so cancelling
     * means: flush the local playout queue ({@link GeminiPcmPlayback}) so speech stops
     * immediately, mark the in-flight turn inactive, and drain queued sends (a queued tool
     * result or context note takes the floor next — tool-result delivery is never dropped
     * by a cancel). Server-side, the next client content sent naturally interrupts any
     * residual generation per the Live API contract. The interrupted turn's accumulated
     * transcript is kept — the provider's trailing frames finalize what WAS spoken. No-op
     * when nothing is active.
     */
    public CancelActiveResponse(): void {
        if (!this.session) {
            return;
        }
        if (!this.responseActive && !this.IsAudioPlaying && !this.interactionInProgress) {
            return; // nothing active — no-op by contract
        }
        this.clearSafetyBackstop();
        this.playback?.Flush();
        this.responseActive = false;
        this.interactionInProgress = false;
        this.activeResponseKind = 'normal';
        this.flushQueuedSends();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Injects background context as a user turn with `turnComplete: false` — appended to the
     * conversation WITHOUT starting generation, so the model draws on it the next time it
     * speaks. Gemini Live turns have no system role, so the user role carries it (the host owns
     * prefixing policy). Queued while a turn is in flight because ANY client content interrupts
     * in-flight generation on Gemini (a divergence from the OpenAI driver, which can inject
     * items mid-response safely).
     *
     * SIDE EFFECT: `turnComplete: false` leaves the client content turn OPEN — the server
     * holds generation until a `turnComplete: true` commit arrives. {@link openClientTurn}
     * tracks this so {@link SendToolResult} can commit the turn and unblock the spoken reply.
     */
    public SendContextNote(text: string): void {
        if (!this.session) {
            return;
        }
        this.enqueueOrRun(() => {
            this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false });
            this.openClientTurn = true;
        });
    }

    /**
     * Triggers ONE short spoken update. Gemini has no per-response instructions (OpenAI's
     * `response.create.instructions`), so this is EMULATED: the instructions ride as a
     * realtime-text user turn (`sendRealtimeInput({ text })` — the path that triggers
     * generation on native-audio models, where mid-call `sendClientContent` is inert), and
     * the resulting turn is stamped `Kind: 'narration'` at send time (reset on
     * `turnComplete`) — mirroring the OpenAI driver's narration semantics. Queued behind any
     * in-flight turn so it can never interrupt a pending reply.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (!this.session) {
            return;
        }
        this.enqueueOrRun(() => this.sendTriggeringUserTurn(instructions, 'narration', false));
    }

    /**
     * Feeds an executed tool's result back via `sendToolResponse`, supplying the function name
     * cached from the originating tool call (Gemini requires it; the contract only carries the
     * callID). Sent immediately when idle — Gemini speaks the result as its next turn —
     * otherwise queued until the in-flight turn (e.g. a progress narration) completes.
     *
     * If context notes left a client content turn OPEN (`turnComplete: false`), the tool
     * response is followed by an empty-turn commit (`sendClientContent({ turnComplete: true })`)
     * — without it the server keeps waiting for more client input and NEVER starts the spoken
     * reply (observed live as the model staying silent after a delegated agent's result).
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (!this.session) {
            return;
        }
        const name = this.pendingToolCallNames.get(callID) ?? '';
        if (this.isNonBlocking) {
            this.sendToolResponseTurn(callID, name, outputJson);
        } else {
            this.enqueueOrRun(() => this.sendToolResponseTurn(callID, name, outputJson));
        }
    }

    /**
     * Mutes / unmutes by toggling the mic tracks' `enabled` flag: the capture pipeline stays
     * up and streams SILENCE while muted (chosen over gating the worklet send so the provider's
     * VAD sees a continuous stream and the un-mute is glitch-free — same policy as the OpenAI
     * client driver).
     */
    public SetMuted(muted: boolean): void {
        const tracks = this.micStream?.getAudioTracks() ?? [];
        for (const track of tracks) {
            track.enabled = !muted;
        }
    }

    /** @inheritdoc */
    public get IsBusy(): boolean {
        if (this.isNonBlocking) {
            return (
                this.responseActive ||
                this.interactionInProgress ||
                !this.toolBatchBarrier.IsEmpty
            );
        }
        return this.responseActive || this.interactionInProgress;
    }

    /**
     * @inheritdoc
     *
     * Computed directly from the playout engine's playhead clock — this client OWNS the output
     * buffer (no WebRTC playback events exist on Gemini), so "audibly playing" is precisely
     * "scheduled audio extends beyond the audio context's current time".
     */
    public get IsAudioPlaying(): boolean {
        return this.playback?.IsPlaying ?? false;
    }

    // ── Overridable creation seams (tests inject fakes — no network / audio) ──

    /**
     * Creation seam for the Gemini Live session. Production constructs a `GoogleGenAI` client
     * with the **ephemeral token as the API key** on the `v1alpha` API version (the only
     * version that accepts `auth_tokens`), then opens `live.connect` with the server-built
     * model + config. Unit tests override this to return an in-memory fake.
     */
    protected async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        const ai = new GoogleGenAI({ apiKey: args.EphemeralToken, httpOptions: { apiVersion: 'v1alpha' } });
        return ai.live.connect({
            model: args.Model,
            config: args.Config,
            callbacks: {
                onmessage: args.OnMessage,
                onerror: args.OnError,
                onclose: args.OnClose,
            },
        });
    }

    /**
     * Creation seam for the mic-capture pipeline. Production delegates to the shared
     * {@link createPcmMicCapture} (a 16 kHz `AudioContext`, inline-Blob capture worklet, and a
     * zero-gain tail; each worklet block is PCM16-encoded and handed to `onPcmChunk` as base64).
     * Unit tests override this with a no-op fake (and may capture `onPcmChunk` to simulate mic
     * frames).
     */
    protected async createMicCapture(
        micStream: MediaStream,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IGeminiMicCapture> {
        return createPcmMicCapture(micStream, GEMINI_INPUT_SAMPLE_RATE, onPcmChunk);
    }

    /** Creation seam for the playout engine. Production returns {@link GeminiPcmPlayback}. */
    protected createPlayback(): IGeminiAudioPlayback {
        return new GeminiPcmPlayback();
    }

    // ── Connection internals ───────────────────────────────────────────────────

    /**
     * Extracts the model + Live connect config from the server-minted `SessionConfig`
     * (shaped `{ model, config }` by the server's `GeminiRealtime.CreateClientSession`).
     * Falls back to the top-level `Model` / an empty config if a field is missing — the
     * server locked the real config into the token, so the session still behaves correctly.
     */
    private parseSessionConfig(config: ClientRealtimeSessionConfig): {
        model: string;
        liveConfig: LiveConnectConfig;
        idleSignal: RealtimeIdleSignal;
        supportsScheduling: boolean;
        supportsBlocking: boolean;
        requestedTracks?: readonly RealtimeTrackDescriptor[];
    } {
        const sessionConfig: JSONObject = config.SessionConfig ?? {};
        const model = typeof sessionConfig['model'] === 'string' ? sessionConfig['model'] : config.Model;
        const raw = sessionConfig['config'];
        const liveConfig =
            raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as LiveConnectConfig) : {};
        const rawIdle = sessionConfig['idleSignal'];
        const idleSignal: RealtimeIdleSignal =
            rawIdle === 'interactionStatus' ? 'interactionStatus' : 'turnComplete';
        const supportsScheduling = sessionConfig['supportsScheduling'] !== false;
        const supportsBlocking = sessionConfig['supportsBlocking'] !== false;
        const rawRequestedTracks = sessionConfig['requestedTracks'];
        let requestedTracks: readonly RealtimeTrackDescriptor[] | undefined = undefined;
        if (Array.isArray(rawRequestedTracks)) {
            const list: RealtimeTrackDescriptor[] = [];
            for (const item of rawRequestedTracks) {
                if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                    const modality = typeof item['Modality'] === 'string' ? item['Modality'] : undefined;
                    const direction = item['Direction'];
                    if (modality && (direction === 'inbound' || direction === 'outbound')) {
                        list.push({
                            Modality: modality,
                            Direction: direction,
                            Encoding: typeof item['Encoding'] === 'string' ? item['Encoding'] : undefined,
                            Rate: typeof item['Rate'] === 'number' ? item['Rate'] : undefined,
                            RequiresConsent:
                                typeof item['RequiresConsent'] === 'boolean' ? item['RequiresConsent'] : undefined,
                        });
                    }
                }
            }
            requestedTracks = list;
        }
        return { model, liveConfig, idleSignal, supportsScheduling, supportsBlocking, requestedTracks };
    }

    /** Streams one base64 PCM16 mic chunk to the model (no-op once the session is gone). */
    private sendMicChunk(base64Pcm16: string): void {
        this.session?.sendRealtimeInput({
            audio: { data: base64Pcm16, mimeType: GEMINI_INPUT_AUDIO_MIME_TYPE },
        });
    }

    /** Surfaces a fatal websocket error and marks the session unusable. */
    private handleTransportError(event: ErrorEvent): void {
        this.emitError({ Message: `Gemini Live transport error: ${event.message || 'unknown'}`, Fatal: true });
        this.setState('error');
    }

    /** Reflects a provider-side close (unless the session already ended in error). */
    private handleTransportClose(): void {
        if (this.currentState !== 'error' && this.currentState !== 'closed') {
            this.setState('closed');
        }
    }

    // ── Inbound message translation ────────────────────────────────────────────

    /**
     * Entry point for every inbound {@link LiveServerMessage}; fans out to per-concern
     * handlers, including `usageMetadata` → {@link emitUsage}.
     */
    private handleServerMessage(message: LiveServerMessage): void {
        this.checkInteractionStatus(message);

        // Session continuity: track resumption token updates (F7)
        if (message.sessionResumptionUpdate) {
            if (message.sessionResumptionUpdate.resumable === false) {
                this.resumptionHandle = null;
            } else if (message.sessionResumptionUpdate.newHandle) {
                this.resumptionHandle = message.sessionResumptionUpdate.newHandle;
            }
        }

        // Server approaching timeout / abort: reconnect seamlessly using resumption handle (F7)
        if (message.goAway) {
            if (this.resumptionHandle) {
                void this.resumeSession(this.resumptionHandle);
            }
        }

        if (message.serverContent) {
            this.handleServerContent(message.serverContent);
        }
        if (message.toolCall) {
            this.handleToolCallFrame(message.toolCall.functionCalls);
        }
        if (message.usageMetadata) {
            this.handleUsageMetadata(message.usageMetadata);
        }
    }

    /**
     * Resumes the live session using a previously captured session resumption handle (F7).
     */
    protected async resumeSession(handle: string): Promise<void> {
        if (!this.lastConnectArgs) {
            return;
        }
        try {
            const reconnectArgs: GeminiClientConnectArgs = {
                ...this.lastConnectArgs,
                Config: {
                    ...this.lastConnectArgs.Config,
                    sessionResumption: { handle },
                },
            };
            const oldSession = this.session;
            const newSession = await this.connectLiveSession(reconnectArgs);
            this.session = newSession;
            this.lastConnectArgs = reconnectArgs;
            try {
                oldSession?.close();
            } catch {
                /* safe */
            }
        } catch (err) {
            RealtimeDiagLog(
                `[GeminiRealtimeClient] Session resumption failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    /**
     * Inspects inbound frames for the untyped `interaction_status` / `interactionStatus` wire field
     * documented for Gemini Live Extended Thinking (V3). Narrowed via null-safe object/string helpers.
     */
    private checkInteractionStatus(message: LiveServerMessage): void {
        const msgObj = GeminiRealtimeClient.readObject(message);
        const contentObj = GeminiRealtimeClient.readObject(message.serverContent);
        const rawStatus =
            GeminiRealtimeClient.readString(msgObj?.['interaction_status']) ??
            GeminiRealtimeClient.readString(msgObj?.['interactionStatus']) ??
            GeminiRealtimeClient.readString(contentObj?.['interaction_status']) ??
            GeminiRealtimeClient.readString(contentObj?.['interactionStatus']);

        if (!rawStatus) {
            return;
        }

        const status = rawStatus.toUpperCase();
        if (status === 'IN_PROGRESS') {
            this.interactionInProgress = true;
            this.responseActive = true;
            if (this.idleSignal === 'interactionStatus') {
                this.scheduleSafetyBackstop();
            }
        } else if (status === 'IDLE') {
            this.clearSafetyBackstop();
            if (this.idleSignal === 'interactionStatus') {
                this.handleIdleTerminal();
            } else {
                this.interactionInProgress = false;
            }
        }
    }

    /**
     * Emits a usage update from a server message's `usageMetadata`.
     *
     * **Delta-vs-cumulative (verified against the `@google/genai` SDK types):** `UsageMetadata`
     * documents `promptTokenCount` as "Number of tokens in the prompt" and `responseTokenCount`
     * as "Total number of tokens across all the generated response candidates" — i.e. PER-RESPONSE
     * counts for the turn this message reports, NOT a session-cumulative running total. Each
     * emission is therefore already a delta, matching the `OnUsage` contract — and matching how
     * the server-bridged `GeminiRealtime` driver forwards the same payload to `IRealtimeSession.OnUsage`.
     */
    private handleUsageMetadata(usageMetadata: NonNullable<LiveServerMessage['usageMetadata']>): void {
        let inputDetails: RealtimeUsageModalityDetail | undefined;
        if (usageMetadata.promptTokensDetails && Array.isArray(usageMetadata.promptTokensDetails)) {
            for (const detail of usageMetadata.promptTokensDetails) {
                if (typeof detail.tokenCount === 'number') {
                    inputDetails = inputDetails ?? {};
                    const mod = String(detail.modality ?? '').toUpperCase();
                    if (mod === 'AUDIO') {
                        inputDetails.AudioTokens = (inputDetails.AudioTokens ?? 0) + detail.tokenCount;
                    } else if (mod === 'TEXT') {
                        inputDetails.TextTokens = (inputDetails.TextTokens ?? 0) + detail.tokenCount;
                    } else if (mod === 'IMAGE') {
                        inputDetails.ImageTokens = (inputDetails.ImageTokens ?? 0) + detail.tokenCount;
                    }
                }
            }
        }
        /**
         * Cost Attribution Note (F6 & Reviewer Item 29):
         * Inbound video frames are sent as individual JPEG images (V5) and billed on the video pricing tier
         * ($0.002 / min, or $1.00 / 1M tokens). The Gemini Live API reports token consumption via
         * usageMetadata.promptTokensDetails partitioned into AUDIO, TEXT, and IMAGE (where video frame tokens
         * are accounted under IMAGE).
         *
         * We expose two candidate cost and telemetry signals:
         * 1. Authoritative Vendor Signal: InputTokenDetails.ImageTokens from promptTokensDetails represents
         *    the actual token consumption billed by the Google inference provider.
         * 2. Track-Level Video Telemetry: VideoFrames (cumulative frames sent) and VideoSeconds (cumulative
         *    active video duration) client-side counters provide fine-grained telemetry and rate attribution.
         *
         * Logging both signals enables operational drift detection: divergence between client-sent VideoFrames
         * and provider-received ImageTokens immediately surfaces frame drops or network throttling in production.
         */
        if (this.videoFramesSent > 0) {
            inputDetails = inputDetails ?? {};
            inputDetails.VideoFrames = this.videoFramesSent;
            inputDetails.VideoSeconds = this.VideoSeconds;
        }
        this.emitUsage({
            InputTokens: typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : undefined,
            OutputTokens: typeof usageMetadata.responseTokenCount === 'number' ? usageMetadata.responseTokenCount : undefined,
            ...(inputDetails ? { InputTokenDetails: inputDetails } : {}),
            ...(this.videoFramesSent > 0 ? {
                VideoFrames: this.videoFramesSent,
                VideoSeconds: this.VideoSeconds,
            } : {}),
            Raw: usageMetadata,
        });
    }

    /** Translates one {@link LiveServerContent} frame in provider-documented signal order. */
    private handleServerContent(content: LiveServerContent): void {
        if (content.interrupted) {
            this.handleInterruption();
        }
        if (content.modelTurn) {
            this.handleModelAudio(content.modelTurn);
            this.handleModelThoughts(content.modelTurn);
        }
        if (content.inputTranscription) {
            this.handleUserTranscription(content.inputTranscription);
        }
        if (content.outputTranscription) {
            this.handleAssistantTranscription(content.outputTranscription);
        }
        if (content.generationComplete) {
            this.handleGenerationComplete();
        }
        if (content.turnComplete) {
            this.handleTurnComplete();
        }
    }

    /**
     * generationComplete: indicates the model has finished generating all tokens for the turn.
     * Playout may still be active (the delay between generationComplete and turnComplete).
     *
     * Per Reviewer Item 20: Draining the queue happens on turnComplete or true IDLE, not prematurely
     * on generationComplete. We set responseActive = false so busy state reflects token completion.
     */
    private handleGenerationComplete(): void {
        if (this.idleSignal === 'turnComplete') {
            this.responseActive = false;
        }
    }

    /**
     * Barge-in: the provider stopped generating because the user spoke. Flush every scheduled
     * playout source (per the Live API contract, `interrupted` is the signal to empty the
     * client's audio queue), surface the TRUE barge-in to the host (Gemini only emits
     * `interrupted` when user input actually cut off in-flight generation — no extra gating
     * needed), and give the floor back. The interrupted turn's accumulated transcript is
     * kept — the following `turnComplete` finalizes what WAS spoken.
     */
    private handleInterruption(): void {
        this.playback?.Flush();
        this.finalizeThoughtTranscript();
        this.emitInterruption();
        this.setState('listening');
    }

    /** Decodes inline model-audio parts (base64 PCM16 @ 24 kHz) into the playout queue. */
    private handleModelAudio(modelTurn: Content): void {
        if (!modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            if (part.thought) {
                continue; // Thoughts are reasoning summaries, never spoken audio
            }
            const data = part.inlineData?.data;
            if (data) {
                this.markGenerationStarted();
                this.playback?.Enqueue(base64ToArrayBuffer(data));
            }
        }
    }

    /**
     * Extracts thought parts (`part.thought === true`) from model turns and emits them
     * as narration transcript deltas (`Kind: 'narration'`). Thought summaries are reasoning
     * notes, never synthesized as assistant speech.
     */
    private handleModelThoughts(modelTurn: Content): void {
        if (!modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            if (part.thought && part.text) {
                this.pendingThoughtText += part.text;
                this.emitTranscript({
                    Role: 'Assistant',
                    Text: part.text,
                    IsFinal: false,
                    Kind: 'narration',
                    IsThought: true,
                });
            }
        }
    }

    /**
     * User transcription: each frame's `text` is an incremental DELTA (emitted with
     * `IsFinal: false`); the accumulated turn text is finalized on the `finished` flag — or,
     * because the user's turn is over once the model starts answering, by
     * {@link markGenerationStarted}.
     */
    private handleUserTranscription(transcription: Transcription): void {
        if (transcription.text) {
            this.pendingUserText += transcription.text;
            this.emitTranscript({ Role: 'User', Text: transcription.text, IsFinal: false, Kind: 'normal' });
        }
        if (transcription.finished) {
            this.finalizeUserTranscript();
        }
    }

    /**
     * Assistant transcription: deltas accumulate (like the OpenAI driver) and are emitted with
     * the ACTIVE response kind so narration turns are tagged correctly; the turn finalizes on
     * the `finished` flag, with {@link handleTurnComplete} as the fallback.
     */
    private handleAssistantTranscription(transcription: Transcription): void {
        this.markGenerationStarted();
        if (transcription.text) {
            this.pendingAssistantText += transcription.text;
            this.emitTranscript({
                Role: 'Assistant',
                Text: transcription.text,
                IsFinal: false,
                Kind: this.activeResponseKind,
            });
        }
        if (transcription.finished) {
            this.finalizeAssistantTranscript();
        }
    }

    /**
     * Surfaces the model's tool calls to the host and caches each callID→name for
     * {@link SendToolResult}.
     *
     * In synchronous BLOCKING mode (e.g. 3.1 preview), the model yields the floor pending
     * the tool result: `responseActive` is cleared so the tool response can take the floor,
     * and the client silently leaves 'speaking'.
     *
     * In asynchronous NON_BLOCKING mode (Extended Thinking and 3.8 default), the model keeps
     * generating and reasoning in the background. We must NOT set `responseActive = false`,
     * as the model is not idle and still generating. The tool batch barrier tracks the call.
     */
    private handleToolCallFrame(functionCalls: FunctionCall[] | undefined): void {
        if (!functionCalls || functionCalls.length === 0) {
            return;
        }
        if (!this.isNonBlocking) {
            if (this.currentState === 'speaking') {
                this.currentState = 'connected';
            }
            this.responseActive = false;
        }
        for (const call of functionCalls) {
            const callID = call.id ?? '';
            const toolName = call.name ?? '';
            this.pendingToolCallNames.set(callID, toolName);
            this.toolBatchBarrier.TrackPendingCall(callID, () => {
                this.handleToolBatchTimeout();
            });
            this.emitToolCall({ CallID: callID, ToolName: toolName, ArgumentsJson: JSON.stringify(call.args ?? {}) });
        }
    }

    /**
     * Turn boundary: finalize any un-finished assistant transcript.
     * Under 'turnComplete' idle signal, release the busy lock, reset response kind,
     * drain queued sends, and return the floor to the user.
     * Under 'interactionStatus' (Extended Thinking), turnComplete does NOT indicate idle:
     * background reasoning or async tool calls may still be in flight, so the busy lock
     * and queued sends remain held until the true IDLE signal lands.
     */
    private handleTurnComplete(): void {
        this.finalizeAssistantTranscript();
        this.finalizeThoughtTranscript();
        if (this.idleSignal === 'turnComplete') {
            this.responseActive = false;
            this.activeResponseKind = 'normal';
            this.openClientTurn = false; // the completed generation consumed any open client content
            this.flushQueuedSends();
            if (this.currentState === 'speaking') {
                this.setState('listening');
            }
        } else {
            // Extended Thinking: turn complete within active interaction — re-arm liveness guard
            this.scheduleSafetyBackstop();
        }
    }

    /**
     * Reached when the server emits true IDLE (interactionStatus) or the safety backstop fires.
     * Releases busy state, commits any deferred open client turns without cutting off generation,
     * drains queued sends, and returns the floor.
     */
    private handleIdleTerminal(): void {
        this.clearSafetyBackstop();
        this.interactionInProgress = false;
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.finalizeThoughtTranscript();
        if (this.openClientTurn) {
            this.session?.sendClientContent({ turnComplete: true });
            this.openClientTurn = false;
        }
        this.flushQueuedSends();
        if (this.currentState === 'speaking' && !this.IsAudioPlaying) {
            this.setState('listening');
        }
    }

    /**
     * First model output of a turn (audio part or transcription delta): the user's turn is
     * over (finalize their pending transcript), the model is busy, and the client is audibly /
     * imminently `'speaking'`.
     */
    private markGenerationStarted(): void {
        this.finalizeUserTranscript();
        this.responseActive = true;
        if (this.idleSignal === 'interactionStatus') {
            this.interactionInProgress = true;
            this.scheduleSafetyBackstop();
        }
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
    }

    /** Emits the accumulated user turn as final (if non-empty) and clears the accumulator. */
    private finalizeUserTranscript(): void {
        const text = this.pendingUserText;
        this.pendingUserText = '';
        if (text.trim().length > 0) {
            this.emitTranscript({ Role: 'User', Text: text, IsFinal: true, Kind: 'normal' });
        }
    }

    /** Emits the accumulated assistant turn as final (if non-empty), tagged with its kind. */
    private finalizeAssistantTranscript(): void {
        const text = this.pendingAssistantText;
        this.pendingAssistantText = '';
        if (text.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: text, IsFinal: true, Kind: this.activeResponseKind });
        }
    }

    /** Emits the accumulated thought turn as final (if non-empty) with Kind: 'narration' and IsThought: true. */
    private finalizeThoughtTranscript(): void {
        const text = this.pendingThoughtText;
        this.pendingThoughtText = '';
        if (text.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: text, IsFinal: true, Kind: 'narration', IsThought: true });
        }
    }

    // ── Collision-safe send machinery ──────────────────────────────────────────

    /**
     * Runs a send immediately when no turn is in flight; otherwise queues it for the next
     * `turnComplete`. This is Gemini's equivalent of the OpenAI driver's
     * queue-behind-active-response rule — stricter here because ANY client content interrupts
     * in-flight generation on the Live API.
     */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            return;
        }
        send();
    }

    /**
     * Drains queued sends in order on a turn boundary, stopping as soon as one starts a new
     * turn (sets {@link responseActive}) — the rest wait for that turn's completion.
     */
    private flushQueuedSends(): void {
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /**
     * Sends a user turn that TRIGGERS generation (`turnComplete: true`), stamping the upcoming
     * turn's kind at send time and eagerly marking the model busy. `emitSpeaking` mirrors the
     * OpenAI driver: typed-text / tool-result replies reflect `'speaking'` immediately;
     * narration waits for the first model output.
     */
    private sendTriggeringUserTurn(text: string, kind: 'normal' | 'narration', emitSpeaking: boolean): void {
        const session = this.session;
        if (!session) {
            return;
        }
        // REALTIME text, not clientContent: native-audio Live models only honor clientContent
        // for history seeding — a mid-call `turnComplete: true` user turn lands in history but
        // does NOT start generation (the model stays silent until the user's next spoken turn
        // commits via VAD). `sendRealtimeInput({ text })` is the documented in-conversation
        // text path and triggers an immediate response on every Live model generation.
        // NOTE: realtime text does NOT commit an open clientContent turn (context notes), so
        // `openClientTurn` is left as-is — the model `turnComplete` that follows clears it.
        session.sendRealtimeInput({ text });
        this.responseActive = true;
        if (this.idleSignal === 'interactionStatus') {
            this.interactionInProgress = true;
            this.scheduleSafetyBackstop();
        }
        this.activeResponseKind = kind;
        if (emitSpeaking) {
            this.setState('speaking');
        }
    }

    /**
     * Sends the tool response (Gemini continues the turn with it) and marks the model busy.
     *
     * In BLOCKING mode (legacy 3.1), if context notes have left a client content turn open
     * ({@link openClientTurn}), the tool response alone does NOT start generation — the Live API
     * holds for more client input until the turn is committed. The empty-turn commit
     * (`sendClientContent({ turnComplete: true })`) releases generation.
     *
     * In NON_BLOCKING mode (Extended Thinking and 3.8 default), setting `turnComplete: true`
     * unconditionally interrupts active model generation mid-sentence. We must NOT commit
     * openClientTurn here; it is deferred until true IDLE (or a subsequent user turn commit).
     */
    /**
     * Extracts scheduling hints (`__mj_scheduling` or legacy `scheduling`) from the tool output,
     * strips both keys so they do not leak into the model's response payload, resolves the scheduling
     * directive accepting both 'INTERRUPT' and 'INTERRUPTED', and warns on unrecognized values or
     * unsupported models (delegates normalization to Core `ExtractToolSchedulingHint`).
     */
    private resolveFunctionScheduling(
        parsed: Record<string, unknown>,
        toolName: string
    ): FunctionResponseScheduling | undefined {
        const hint = ExtractToolSchedulingHint(parsed, toolName, 'GeminiRealtimeClient');
        if (!hint) {
            return undefined;
        }

        const schedStr = hint === 'silent' ? 'SILENT' : hint === 'whenIdle' ? 'WHEN_IDLE' : 'INTERRUPT';
        if (!this.supportsScheduling) {
            console.warn(
                `[GeminiRealtimeClient] Dropping scheduling hint "${schedStr}" for tool "${toolName}": ` +
                `function scheduling is only supported on gemini-3.8-live.`
            );
            return undefined;
        }

        switch (hint) {
            case 'silent':
                return FunctionResponseScheduling.SILENT;
            case 'whenIdle':
                return FunctionResponseScheduling.WHEN_IDLE;
            case 'interrupt':
                return FunctionResponseScheduling.INTERRUPT;
        }
    }

    private sendToolResponseTurn(callID: string, name: string, outputJson: string): void {
        const session = this.session;
        if (!session) {
            return;
        }
        this.toolBatchBarrier.RecordResult(callID);
        const parsed = this.parseToolOutput(outputJson);
        const sched = this.resolveFunctionScheduling(parsed as Record<string, unknown>, name);
        const functionResponse: FunctionResponse = {
            id: callID,
            name,
            response: parsed,
            ...(sched ? { scheduling: sched } : {}),
        };

        session.sendToolResponse({
            functionResponses: [functionResponse],
        });

        if (!this.isNonBlocking) {
            if (this.openClientTurn) {
                session.sendClientContent({ turnComplete: true });
                this.openClientTurn = false;
            }
            this.responseActive = true;
            this.activeResponseKind = 'normal';
            this.setState('speaking');
        }

        this.pendingToolCallNames.delete(callID);
    }

    /**
     * Parses a JSON-stringified tool result into the structured object Gemini's
     * function-response slot expects, wrapping non-object output as `{ result: <value> }` so a
     * free-text result still round-trips (same fallback as the server driver).
     */
    private parseToolOutput(output: string): JSONObject {
        try {
            const parsed: unknown = JSON.parse(output);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as JSONObject;
            }
            return { result: parsed as JSONValue };
        } catch {
            return { result: output };
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private scheduleSafetyBackstop(delayMs = GeminiRealtimeClient.ASSISTANT_SAFETY_BACKSTOP_MS): void {
        this.clearSafetyBackstop();
        this.assistantSafetyBackstopTimer = setTimeout(() => {
            this.assistantSafetyBackstopTimer = null;
            this.handleSafetyBackstopTrigger();
        }, delayMs);
    }

    private clearSafetyBackstop(): void {
        if (this.assistantSafetyBackstopTimer) {
            clearTimeout(this.assistantSafetyBackstopTimer);
            this.assistantSafetyBackstopTimer = null;
        }
    }

    private handleSafetyBackstopTrigger(): void {
        this.handleIdleTerminal();
    }

    private handleToolBatchTimeout(): void {
        if (this.idleSignal === 'turnComplete') {
            this.flushQueuedSends();
        }
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    private resetResponseState(): void {
        this.pendingAssistantText = '';
        this.pendingUserText = '';
        this.pendingThoughtText = '';
        this.responseActive = false;
        this.interactionInProgress = false;
        this.activeResponseKind = 'normal';
        this.openClientTurn = false;
        this.queuedSends = [];
        this.pendingToolCallNames.clear();
        this.toolBatchBarrier.Clear();
        this.clearSafetyBackstop();
    }

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }

    private static readObject(value: unknown): Record<string, unknown> | undefined {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    }

    private static readString(value: unknown): string | undefined {
        if (typeof value !== 'string') {
            return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link GeminiRealtimeClient} is
 * instantiated dynamically through the ClassFactory, so a consumer must call this no-op
 * to create a static code path that keeps the `@RegisterClass` side effect alive.
 */
export function LoadGeminiRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
