import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject, JSONValue } from '@memberjunction/ai';
import {
    GoogleGenAI,
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
     * Streams realtime user input to the model — mic audio frames AND mid-session text.
     * Text via realtime input is the Live API's "respond now" path for in-conversation
     * messages: native-audio models treat {@link sendClientContent} as history seeding
     * only and will NOT generate from it mid-call, but realtime text triggers immediately.
     */
    sendRealtimeInput(params: { audio?: GeminiBlob; text?: string }): void;
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
    // ── Transport / audio resources ────────────────────────────────────────────
    private session: GeminiLiveClientSession | null = null;
    private micStream: MediaStream | null = null;
    private micCapture: IGeminiMicCapture | null = null;
    private playback: IGeminiAudioPlayback | null = null;

    // ── Response state machine ─────────────────────────────────────────────────
    /** Accumulates the in-flight assistant transcript across delta frames. */
    private pendingAssistantText = '';
    /** Accumulates the in-flight user transcription across delta frames. */
    private pendingUserText = '';
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
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.micStream = micStream;
        this.setState('connecting');
        const { model, liveConfig } = this.parseSessionConfig(config);
        this.playback = this.createPlayback();
        this.session = await this.connectLiveSession({
            Model: model,
            Config: liveConfig,
            EphemeralToken: config.EphemeralToken,
            OnMessage: (message) => this.handleServerMessage(message),
            OnError: (event) => this.handleTransportError(event),
            OnClose: () => this.handleTransportClose(),
        });
        this.setState('connected');
        this.micCapture = await this.createMicCapture(micStream, (base64Pcm16) => this.sendMicChunk(base64Pcm16));
        // Audio-activity capability (base obligation #9): agent side taps the playout
        // engine's master gain; user side meters the mic stream. Null-safe — test fakes /
        // no-WebAudio environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
        this.setState('listening');
    }

    /**
     * Tears down the session, mic capture, mic tracks, and playout engine, resets the response
     * state machine, and emits a final `'closed'` (unless already `'error'`). Safe to call
     * more than once.
     */
    public async Disconnect(): Promise<void> {
        this.closeAudioMeters();
        this.micStream?.getTracks().forEach((track) => track.stop());
        this.micStream = null;
        this.micCapture?.Stop();
        this.micCapture = null;
        this.playback?.Close();
        this.playback = null;
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
        this.enqueueOrRun(() => this.sendToolResponseTurn(callID, name, outputJson));
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
        return this.responseActive;
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
    private parseSessionConfig(config: ClientRealtimeSessionConfig): { model: string; liveConfig: LiveConnectConfig } {
        const sessionConfig: JSONObject = config.SessionConfig ?? {};
        const model = typeof sessionConfig['model'] === 'string' ? sessionConfig['model'] : config.Model;
        const raw = sessionConfig['config'];
        const liveConfig =
            raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as LiveConnectConfig) : {};
        return { model, liveConfig };
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
        this.emitUsage({
            InputTokens: typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : undefined,
            OutputTokens: typeof usageMetadata.responseTokenCount === 'number' ? usageMetadata.responseTokenCount : undefined,
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
        }
        if (content.inputTranscription) {
            this.handleUserTranscription(content.inputTranscription);
        }
        if (content.outputTranscription) {
            this.handleAssistantTranscription(content.outputTranscription);
        }
        if (content.turnComplete) {
            this.handleTurnComplete();
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
        this.emitInterruption();
        this.setState('listening');
    }

    /** Decodes inline model-audio parts (base64 PCM16 @ 24 kHz) into the playout queue. */
    private handleModelAudio(modelTurn: Content): void {
        if (!modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            const data = part.inlineData?.data;
            if (data) {
                this.markGenerationStarted();
                this.playback?.Enqueue(base64ToArrayBuffer(data));
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
     * {@link SendToolResult}. Two deliberate behaviors mirror the OpenAI driver: (1) the client
     * silently leaves `'speaking'` (no emission) so a host-rendered busy indicator isn't
     * clobbered by this turn's trailing frames; (2) `responseActive` is CLEARED — the model has
     * yielded the floor pending the result, so a queued tool result can never deadlock waiting
     * for a `turnComplete` that may not arrive until after the result is sent.
     */
    private handleToolCallFrame(functionCalls: FunctionCall[] | undefined): void {
        if (!functionCalls || functionCalls.length === 0) {
            return;
        }
        if (this.currentState === 'speaking') {
            this.currentState = 'connected';
        }
        this.responseActive = false;
        for (const call of functionCalls) {
            const callID = call.id ?? '';
            const toolName = call.name ?? '';
            this.pendingToolCallNames.set(callID, toolName);
            this.emitToolCall({ CallID: callID, ToolName: toolName, ArgumentsJson: JSON.stringify(call.args ?? {}) });
        }
    }

    /**
     * Turn boundary: finalize any un-finished assistant transcript, release the busy lock,
     * reset the response kind to `'normal'`, drain queued sends (stopping at the first one
     * that starts a new turn), and return the floor to the user.
     */
    private handleTurnComplete(): void {
        this.finalizeAssistantTranscript();
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.openClientTurn = false; // the completed generation consumed any open client content
        this.flushQueuedSends();
        if (this.currentState === 'speaking') {
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
        this.activeResponseKind = kind;
        if (emitSpeaking) {
            this.setState('speaking');
        }
    }

    /**
     * Sends the tool response (Gemini continues the turn with it) and marks the model busy.
     *
     * When context notes have left a client content turn open ({@link openClientTurn}), the
     * tool response alone does NOT start generation — the Live API holds for more client input
     * until the turn is committed. The empty-turn commit (the SDK-documented
     * `sendClientContent({ turnComplete: true })` form) releases generation so the model
     * speaks the result immediately, matching the OpenAI driver's explicit `response.create`.
     */
    private sendToolResponseTurn(callID: string, name: string, outputJson: string): void {
        const session = this.session;
        if (!session) {
            return;
        }
        session.sendToolResponse({
            functionResponses: [{ id: callID, name, response: this.parseToolOutput(outputJson) }],
        });
        if (this.openClientTurn) {
            session.sendClientContent({ turnComplete: true });
            this.openClientTurn = false;
        }
        this.pendingToolCallNames.delete(callID);
        this.responseActive = true;
        this.activeResponseKind = 'normal';
        this.setState('speaking');
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

    /** Resets the per-session response state machine (used on Disconnect). */
    private resetResponseState(): void {
        this.pendingAssistantText = '';
        this.pendingUserText = '';
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.openClientTurn = false;
        this.queuedSends = [];
        this.pendingToolCallNames.clear();
    }

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
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
