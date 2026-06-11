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

// ── Audio constants (Gemini Live wire formats) ─────────────────────────────────

/** Gemini Live expects client audio as 16-bit signed PCM, 16 kHz, mono. */
const GEMINI_INPUT_SAMPLE_RATE = 16000;
/** MIME type stamped on every streamed mic chunk. */
const GEMINI_INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';
/** Gemini Live emits model audio as 16-bit signed PCM, 24 kHz, mono. */
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

/** Registration name for the inline mic-capture worklet processor. */
const CAPTURE_WORKLET_NAME = 'mj-gemini-pcm16-capture';

/**
 * Inline AudioWorklet processor source (loaded via a Blob URL so the package ships no asset
 * files). Runs inside the audio rendering thread: forwards each 128-frame mono input block to
 * the main thread as a copied `Float32Array`. PCM16 conversion + base64 encoding happen on the
 * main thread to keep the render-thread callback minimal.
 */
const CAPTURE_WORKLET_SOURCE = `
class MJGeminiPcm16Capture extends AudioWorkletProcessor {
    process(inputs) {
        const channel = inputs[0] && inputs[0][0];
        if (channel && channel.length > 0) {
            this.port.postMessage(channel.slice(0));
        }
        return true;
    }
}
registerProcessor('${CAPTURE_WORKLET_NAME}', MJGeminiPcm16Capture);
`;

// ── Structural transport seams (typed subsets — fakes in tests, SDK in prod) ──

/**
 * The minimal subset of `@google/genai`'s `Session` this client depends on. Declaring the seam
 * as an interface (rather than the concrete SDK `Session`) lets unit tests inject a fully
 * in-memory fake that captures outbound sends and drives the registered message callback with
 * Gemini-shaped frames — no websocket, no network. (Mirrors the server driver's
 * `GeminiLiveSession` seam.)
 */
export interface GeminiLiveClientSession {
    /** Streams a realtime media frame (mic audio) to the model. */
    sendRealtimeInput(params: { audio?: GeminiBlob }): void;
    /** Appends client content (typed text, context notes, narration triggers). */
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
 */
export interface IGeminiMicCapture {
    /** Stops capture and releases the audio context / worklet resources. */
    Stop(): void;
}

/**
 * The playback seam: schedules raw PCM16 chunks for gapless playout and reports whether audio
 * is AUDIBLY playing. Production is {@link GeminiPcmPlayback} (Web Audio, playhead-clock
 * scheduling); tests inject a fake with a controllable `IsPlaying`.
 */
export interface IGeminiAudioPlayback {
    /** Schedules a raw PCM16 (24 kHz mono) chunk back-to-back after any already-queued audio. */
    Enqueue(pcm16: ArrayBuffer): void;
    /** Stops + clears every scheduled source (barge-in / interruption). */
    Flush(): void;
    /** `true` while scheduled audio is audibly playing (playhead ahead of the context clock). */
    readonly IsPlaying: boolean;
    /** Flushes and releases the underlying audio context. */
    Close(): void;
}

// ── Base64 / PCM helpers (atob/btoa are global in both browsers and Node 18+) ─

/** Decodes a base64 string into a freshly-allocated `ArrayBuffer`. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out.buffer;
}

/** Encodes raw bytes to base64 in chunks (avoids call-stack limits on large frames). */
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/** Converts a Float32 [-1, 1] sample block to PCM16 little-endian bytes, base64-encoded. */
function encodeFloat32ToPcm16Base64(samples: Float32Array): string {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return bytesToBase64(new Uint8Array(pcm.buffer));
}

/** Converts raw PCM16 little-endian bytes to Float32 samples (truncates a trailing odd byte). */
function pcm16ToFloat32(pcm: ArrayBuffer): Float32Array<ArrayBuffer> {
    const even = pcm.byteLength - (pcm.byteLength % 2);
    const ints = new Int16Array(pcm.slice(0, even));
    const out = new Float32Array(ints.length);
    for (let i = 0; i < ints.length; i++) {
        out[i] = ints[i] / 0x8000;
    }
    return out;
}

// ── Production playback engine ─────────────────────────────────────────────────

/**
 * Web Audio playout scheduler for Gemini's 24 kHz PCM16 model audio.
 *
 * Chunks are wrapped in `AudioBuffer`s and scheduled back-to-back against a **playhead clock**:
 * each chunk starts at `max(playheadTime, currentTime)` and advances the playhead by its
 * duration, producing gapless playout regardless of network jitter. {@link IsPlaying} is
 * computed directly from that clock — the playhead being ahead of `currentTime` (with live
 * sources) means audio is audibly coming out of the speaker. On interruption, {@link Flush}
 * stops every scheduled source and rewinds the playhead.
 */
export class GeminiPcmPlayback implements IGeminiAudioPlayback {
    private context: AudioContext;
    /** The absolute context time up to which audio has been scheduled. */
    private playheadTime = 0;
    /** Sources scheduled and not yet ended (so Flush can stop them). */
    private activeSources = new Set<AudioBufferSourceNode>();

    constructor() {
        this.context = new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE });
    }

    /** @inheritdoc */
    public Enqueue(pcm16: ArrayBuffer): void {
        const samples = pcm16ToFloat32(pcm16);
        if (samples.length === 0) {
            return;
        }
        const buffer = this.context.createBuffer(1, samples.length, GEMINI_OUTPUT_SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        source.onended = () => this.activeSources.delete(source);
        this.activeSources.add(source);
        const startAt = Math.max(this.playheadTime, this.context.currentTime);
        source.start(startAt);
        this.playheadTime = startAt + buffer.duration;
    }

    /** @inheritdoc */
    public Flush(): void {
        for (const source of this.activeSources) {
            try {
                source.stop();
            } catch {
                /* source never started or already stopped — fine */
            }
        }
        this.activeSources.clear();
        this.playheadTime = 0;
    }

    /** @inheritdoc */
    public get IsPlaying(): boolean {
        return this.activeSources.size > 0 && this.playheadTime > this.context.currentTime;
    }

    /** @inheritdoc */
    public Close(): void {
        this.Flush();
        void this.context.close();
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
 *   `turnComplete` → busy cleared + queued sends flushed, `usageMetadata` → ignored.
 * - **Busy mapping**: Gemini has no `response.created` frame, so `IsBusy` is set EAGERLY when
 *   this client triggers a response (text / narration / tool result) and on the first model
 *   output of a turn (audio part or output-transcription delta); cleared on `turnComplete`,
 *   and on a `toolCall` frame (the model has yielded the floor pending the tool result — so a
 *   slow `turnComplete` can never deadlock the queued result).
 * - **Collision safety**: ANY `sendClientContent` interrupts in-flight Gemini generation (per
 *   the Live API contract), so text / narration / context-note / tool-result sends issued
 *   while a turn is in flight are queued and flushed in order on `turnComplete` (the flush
 *   stops at the first send that starts a new response).
 * - **Narration tagging**: {@link RequestSpokenUpdate} has no per-response-instructions
 *   equivalent on Gemini, so it is emulated as a user turn carrying the instructions with
 *   `turnComplete: true`; the response kind is stamped `'narration'` at send time (sends ARE
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
        this.setState('listening');
    }

    /**
     * Tears down the session, mic capture, mic tracks, and playout engine, resets the response
     * state machine, and emits a final `'closed'` (unless already `'error'`). Safe to call
     * more than once.
     */
    public async Disconnect(): Promise<void> {
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
     * Injects typed text as a user turn with `turnComplete: true` (Gemini's "respond now"
     * trigger). No-op when the session is not open.
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
     */
    public SendContextNote(text: string): void {
        if (!this.session) {
            return;
        }
        this.enqueueOrRun(() => {
            this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false });
        });
    }

    /**
     * Triggers ONE short spoken update. Gemini has no per-response instructions (OpenAI's
     * `response.create.instructions`), so this is EMULATED: the instructions ride as a user
     * turn with `turnComplete: true`, and the resulting turn is stamped `Kind: 'narration'` at
     * send time (reset on `turnComplete`) — mirroring the OpenAI driver's narration semantics.
     * Queued behind any in-flight turn so it can never interrupt a pending reply.
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
     * Creation seam for the mic-capture pipeline: a 16 kHz `AudioContext`, the inline-Blob
     * capture worklet, and a zero-gain tail that keeps the graph pulled without audible
     * monitoring. Each worklet block is PCM16-encoded and handed to `onPcmChunk` as base64.
     * Unit tests override this with a no-op fake (and may capture `onPcmChunk` to simulate mic
     * frames).
     */
    protected async createMicCapture(
        micStream: MediaStream,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IGeminiMicCapture> {
        const context = new AudioContext({ sampleRate: GEMINI_INPUT_SAMPLE_RATE });
        await this.loadCaptureWorklet(context);
        const source = context.createMediaStreamSource(micStream);
        const worklet = new AudioWorkletNode(context, CAPTURE_WORKLET_NAME);
        worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
            onPcmChunk(encodeFloat32ToPcm16Base64(event.data));
        };
        source.connect(worklet);
        const muteTail = context.createGain();
        muteTail.gain.value = 0;
        worklet.connect(muteTail).connect(context.destination);
        return {
            Stop: () => {
                worklet.port.onmessage = null;
                source.disconnect();
                worklet.disconnect();
                muteTail.disconnect();
                void context.close();
            },
        };
    }

    /** Creation seam for the playout engine. Production returns {@link GeminiPcmPlayback}. */
    protected createPlayback(): IGeminiAudioPlayback {
        return new GeminiPcmPlayback();
    }

    // ── Connection internals ───────────────────────────────────────────────────

    /** Loads the inline capture worklet module from a Blob URL (no asset files shipped). */
    private async loadCaptureWorklet(context: AudioContext): Promise<void> {
        const blobUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' }));
        try {
            await context.audioWorklet.addModule(blobUrl);
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }

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
     * handlers. `usageMetadata` is intentionally ignored — usage accounting belongs to the
     * server-bridged topology.
     */
    private handleServerMessage(message: LiveServerMessage): void {
        if (message.serverContent) {
            this.handleServerContent(message.serverContent);
        }
        if (message.toolCall) {
            this.handleToolCallFrame(message.toolCall.functionCalls);
        }
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
        session.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
        this.responseActive = true;
        this.activeResponseKind = kind;
        if (emitSpeaking) {
            this.setState('speaking');
        }
    }

    /** Sends the tool response (Gemini continues the turn with it) and marks the model busy. */
    private sendToolResponseTurn(callID: string, name: string, outputJson: string): void {
        const session = this.session;
        if (!session) {
            return;
        }
        session.sendToolResponse({
            functionResponses: [{ id: callID, name, response: this.parseToolOutput(outputJson) }],
        });
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
