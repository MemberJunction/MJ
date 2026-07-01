import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient, RealtimeClientState } from '../generic/baseRealtimeClient';
import { base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { createPcmMicCapture, IPcmMicCapture } from '../audio/micCapture';

// ── Audio constants ────────────────────────────────────────────────────────────

/**
 * Default PCM16 sample rate (mono) both directions, used when the server pact omits `sampleRate`.
 * Matches the server driver's {@link HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE}.
 */
export const HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE = 24000;

// ── Inbound OpenAI-Realtime wire events (only the fields this client reads are typed) ──

/** A parsed inbound frame from the OpenAI-Realtime-compatible endpoint (discriminated by `type`). */
export interface HuggingFaceClientServerEvent {
    type?: string;
    /** `response.output_audio.delta` / `*_audio_transcript.delta` / input-transcription delta. */
    delta?: string;
    /** `*_audio_transcript.done` — the finalized assistant transcript. */
    transcript?: string;
    /** `response.function_call_arguments.done` — the tool name. */
    name?: string;
    /** `response.function_call_arguments.done` — correlation id the result must echo. */
    call_id?: string;
    /** `response.function_call_arguments.done` — JSON-encoded tool arguments (a STRING). */
    arguments?: string;
    /** `response.done` — usage payload for the completed response. */
    response?: { usage?: { input_tokens?: number; output_tokens?: number } };
    /** `error` — the provider error payload. */
    error?: { message?: string; code?: string };
}

// ── Structural transport seam (fakes in tests, native WebSocket in prod) ───────

/** The minimal websocket surface this client depends on (mirrors the other websocket drivers). */
export interface IHuggingFaceClientSocket {
    onopen: (() => void) | null;
    onmessage: ((data: string) => void) | null;
    onerror: ((message: string) => void) | null;
    onclose: (() => void) | null;
    send(data: string): void;
    close(): void;
}

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
 * OpenAI ordering: the session config is applied via `session.update` only AFTER the endpoint's
 * `session.created` frame (sending it earlier is dropped), and `'listening'` is reported at that point
 * (obligation #7). Because the audio plane is a raw websocket (not WebRTC), the client OWNS playback —
 * `IsAudioPlaying` reflects the local playout clock, and barge-in/cancel flush it locally.
 */
@RegisterClass(BaseRealtimeClient, 'huggingface')
export class HuggingFaceRealtimeClient extends BaseRealtimeClient {
    // ── Transport ──────────────────────────────────────────────────────────────
    protected socket: IHuggingFaceClientSocket | null = null;
    private playback: IRealtimePcmPlayback | null = null;
    private micCapture: IPcmMicCapture | null = null;
    private micStream: MediaStream | null = null;

    /** The OpenAI-Realtime `session` object applied via `session.update` on `session.created`. */
    private sessionObject: JSONObject = {};
    /** Resolver for the in-flight Connect's `session.created` wait (null outside Connect). */
    private onSessionCreated: (() => void) | null = null;

    // ── Response state machine (mirrors the OpenAI WebRTC client) ──────────────
    private pendingAssistantText = '';
    private responseActive = false;
    private pendingResultResponse = false;
    private pendingNarrationKind = false;
    private activeResponseKind: 'normal' | 'narration' = 'normal';
    private currentState: RealtimeClientState = 'closed';
    private closedByConsumer = false;

    // ── BaseRealtimeClient: connection lifecycle ───────────────────────────────

    /**
     * Opens the browser-direct websocket to the proxy URL (`config.EphemeralToken`), waits for the
     * endpoint's `session.created`, applies the server-built session config, builds the PCM audio plane
     * at the pact's sample rate, and reports `'listening'`.
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.setState('connecting');
        this.sessionObject = HuggingFaceRealtimeClient.parseSessionObject(config);
        const sampleRate = HuggingFaceRealtimeClient.parseSampleRate(config);
        this.micStream = micStream;

        const opened = this.buildSignal((resolve) => (this.onOpen = resolve));
        const created = this.buildSignal((resolve) => (this.onSessionCreated = resolve));

        this.socket = this.createSocket(config.EphemeralToken);
        this.socket.onopen = () => this.onOpen?.();
        this.socket.onmessage = (data) => this.handleSocketMessage(data);
        this.socket.onerror = (message) => this.handleSocketError(message);
        this.socket.onclose = () => this.handleSocketClose();

        await opened;
        this.setState('connected');
        await created;

        this.applySessionConfig();
        this.playback = this.createPlayback(sampleRate);
        this.micCapture = await this.createMicCapture(micStream, sampleRate, (b64) => this.sendInput(b64));
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
        this.setState('listening');
    }

    /** Tears down the audio plane + socket and resets the response state machine. */
    public async Disconnect(): Promise<void> {
        this.closedByConsumer = true;
        this.closeAudioMeters();
        this.micCapture?.Stop();
        this.micCapture = null;
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.micStream = null;
        this.playback?.Close();
        this.playback = null;
        if (this.socket) {
            try { this.socket.close(); } catch { /* already closing */ }
            this.socket = null;
        }
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── BaseRealtimeClient: outbound actions ──────────────────────────────────

    /**
     * Injects typed text as a user-role message, then triggers a reply through the same collision-safe
     * path tool results use. SendText implies barge-in — an active spoken response is cancelled first.
     */
    public SendText(text: string): void {
        if (!this.socket) {
            return;
        }
        this.CancelActiveResponse();
        this.sendFrame({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
        });
        this.requestResultResponse();
    }

    /**
     * Cancels the model's in-flight response (only when one is active) and flushes local playback so
     * already-buffered speech stops immediately. Preserves any queued tool-result trigger. No-op when idle.
     */
    public CancelActiveResponse(): void {
        if (!this.socket) {
            return;
        }
        const playing = this.playback?.IsPlaying ?? false;
        if (!this.responseActive && !playing) {
            return;
        }
        if (this.responseActive) {
            this.sendFrame({ type: 'response.cancel' });
            this.responseActive = false;
            this.pendingNarrationKind = false;
            this.activeResponseKind = 'normal';
            this.pendingAssistantText = '';
        }
        this.playback?.Flush();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /** Injects a system-role context item the model can draw on next time it speaks, WITHOUT a reply. */
    public SendContextNote(text: string): void {
        if (!this.socket) {
            return;
        }
        this.sendFrame({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
        });
    }

    /**
     * Triggers ONE short spoken update; marks the upcoming response `'narration'` so its transcripts are
     * ephemeral. Skipped while a response is in flight (narration is disposable by contract).
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (!this.socket || this.responseActive) {
            return;
        }
        this.responseActive = true;
        this.pendingNarrationKind = true;
        this.sendFrame({ type: 'response.create', response: { instructions } });
    }

    /**
     * Sends the tool result as a `function_call_output` item, then triggers a reply — immediately if idle,
     * otherwise queued until the current response finishes (so the model always voices delegated results).
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (!this.socket) {
            return;
        }
        this.sendFrame({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: callID, output: outputJson },
        });
        this.requestResultResponse();
    }

    /** Mute / unmute by toggling the mic tracks' `enabled` flag (transport stays up). */
    public SetMuted(muted: boolean): void {
        for (const t of this.micStream?.getAudioTracks() ?? []) {
            t.enabled = !muted;
        }
    }

    /** @inheritdoc */
    public get IsBusy(): boolean {
        return this.responseActive;
    }

    /** @inheritdoc */
    public get IsAudioPlaying(): boolean {
        return this.playback?.IsPlaying ?? false;
    }

    // ── Overridable creation seams (tests inject fakes — no network / WebAudio) ──

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

    /** Creation seam for the mic-capture pipeline. Production delegates to the shared {@link createPcmMicCapture}. */
    protected async createMicCapture(
        micStream: MediaStream,
        sampleRate: number,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IPcmMicCapture> {
        return createPcmMicCapture(micStream, sampleRate, onPcmChunk);
    }

    /** Creation seam for the playout engine. Production returns the shared {@link RealtimePcmPlayback}. */
    protected createPlayback(sampleRate: number): IRealtimePcmPlayback {
        return new RealtimePcmPlayback(sampleRate);
    }

    // ── Connection internals ───────────────────────────────────────────────────

    /** Resolver for the in-flight Connect's socket-open wait. */
    private onOpen: (() => void) | null = null;

    /** Extracts the wire-shaped `session` object from the server pact (`{ session, sampleRate }`). */
    private static parseSessionObject(config: ClientRealtimeSessionConfig): JSONObject {
        const sessionConfig: JSONObject = config.SessionConfig ?? {};
        const raw = sessionConfig['session'];
        return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JSONObject) : {};
    }

    /** Extracts the PCM sample rate from the server pact, defaulting to 24 kHz. */
    private static parseSampleRate(config: ClientRealtimeSessionConfig): number {
        const raw = config.SessionConfig?.['sampleRate'];
        return typeof raw === 'number' && raw > 0 ? raw : HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE;
    }

    /** Creates a one-shot signal promise, handing its resolver to the supplied setter. */
    private buildSignal(assign: (resolve: () => void) => void): Promise<void> {
        return new Promise<void>((resolve) => assign(resolve));
    }

    /** Sends the server-built session config once the session exists (skipped when empty). */
    private applySessionConfig(): void {
        if (Object.keys(this.sessionObject).length === 0) {
            return;
        }
        this.sendFrame({ type: 'session.update', session: this.sessionObject });
    }

    /** Streams one base64 PCM16 mic frame as an `input_audio_buffer.append`. */
    private sendInput(base64Pcm16: string): void {
        this.sendFrame({ type: 'input_audio_buffer.append', audio: base64Pcm16 });
    }

    // ── Inbound event translation ──────────────────────────────────────────────

    /** Parses an inbound frame and dispatches it. */
    private handleSocketMessage(data: string): void {
        let event: HuggingFaceClientServerEvent;
        try {
            event = JSON.parse(data) as HuggingFaceClientServerEvent;
        } catch {
            return; // non-JSON frame — ignore
        }
        if (event === null || typeof event !== 'object') {
            return;
        }
        this.handleEvent(event);
    }

    /** Dispatches a typed OpenAI-Realtime server event to the appropriate behavior. */
    private handleEvent(event: HuggingFaceClientServerEvent): void {
        switch (event.type) {
            case 'session.created':
                this.onSessionCreated?.();
                this.onSessionCreated = null;
                break;
            case 'response.output_audio.delta':
            case 'response.audio.delta':
                this.handleAudioDelta(event.delta);
                break;
            case 'response.output_audio_transcript.delta':
            case 'response.audio_transcript.delta':
                this.onAssistantDelta(event.delta ?? '');
                break;
            case 'response.output_audio_transcript.done':
            case 'response.audio_transcript.done':
                this.onAssistantDone(event.transcript ?? '');
                break;
            case 'conversation.item.input_audio_transcription.completed':
                this.emitTranscript({ Role: 'User', Text: event.transcript ?? '', IsFinal: true, Kind: 'normal' });
                break;
            case 'response.function_call_arguments.done':
                this.onToolCallFrame(event);
                break;
            case 'input_audio_buffer.speech_started':
                this.handleSpeechStarted();
                break;
            case 'response.created':
                this.responseActive = true;
                this.activeResponseKind = this.pendingNarrationKind ? 'narration' : 'normal';
                this.pendingNarrationKind = false;
                break;
            case 'response.done':
                this.handleResponseDone(event);
                break;
            case 'error':
                this.emitError({ Message: event.error?.message ?? 'Unknown provider error', Code: event.error?.code, Fatal: false });
                break;
            default:
                break;
        }
    }

    /** Enqueues one base64 audio chunk for playout and reflects `'speaking'`. */
    private handleAudioDelta(deltaBase64: string | undefined): void {
        if (!deltaBase64) {
            return;
        }
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
        this.playback?.Enqueue(base64ToArrayBuffer(deltaBase64));
    }

    /** Appends an assistant transcript delta and emits it (tagged with the active response kind). */
    private onAssistantDelta(delta: string): void {
        if (!delta) {
            return;
        }
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
        this.pendingAssistantText += delta;
        this.emitTranscript({ Role: 'Assistant', Text: delta, IsFinal: false, Kind: this.activeResponseKind });
    }

    /** Finalizes the assistant turn (empty turns emit nothing). */
    private onAssistantDone(transcript: string): void {
        const finalText = transcript || this.pendingAssistantText;
        this.pendingAssistantText = '';
        if (finalText.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: finalText, IsFinal: true, Kind: this.activeResponseKind });
        }
    }

    /**
     * Surfaces a completed tool call. Silently leaves `'speaking'` (no emission) so a host busy indicator
     * isn't clobbered, and clears the busy flag (deadlock guard — obligation #2). `arguments` is already a
     * JSON string on the wire.
     */
    private onToolCallFrame(event: HuggingFaceClientServerEvent): void {
        if (this.currentState === 'speaking') {
            this.currentState = 'connected';
        }
        this.responseActive = false;
        this.emitToolCall({
            CallID: event.call_id ?? '',
            ToolName: event.name ?? '',
            ArgumentsJson: typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments ?? {}),
        });
    }

    /**
     * True barge-in ONLY: the user started speaking over active model output (a response in flight or audio
     * audibly playing). Flushes local playback, emits the interruption, returns to `'listening'`.
     */
    private handleSpeechStarted(): void {
        const playing = this.playback?.IsPlaying ?? false;
        if (this.responseActive || playing) {
            this.playback?.Flush();
            this.emitInterruption();
        }
        this.setState('listening');
    }

    /** Response boundary: release the lock, emit usage, fire any queued tool-result reply, return to listening. */
    private handleResponseDone(event: HuggingFaceClientServerEvent): void {
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        const usage = event.response?.usage;
        if (usage) {
            this.emitUsage({ InputTokens: usage.input_tokens, OutputTokens: usage.output_tokens, Raw: usage });
        }
        this.flushPendingResultResponse();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    // ── Response state machine ─────────────────────────────────────────────────

    /** Triggers a reply immediately when idle, else queues it until the current response finishes. */
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
        this.sendFrame({ type: 'response.create' });
        this.setState('speaking');
    }

    /** On a turn completing, fire any queued tool-result response so the answer is spoken. */
    private flushPendingResultResponse(): void {
        if (!this.pendingResultResponse || !this.socket) {
            return;
        }
        this.pendingResultResponse = false;
        this.responseActive = true;
        this.sendFrame({ type: 'response.create' });
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

    // ── Transport error / close ────────────────────────────────────────────────

    /** A socket-level error is fatal — the transport is gone (obligation #6). */
    private handleSocketError(message: string): void {
        this.emitError({ Message: message, Fatal: true });
        this.setState('error');
    }

    /** A close is silent when consumer-initiated; otherwise reported as a terminal `'closed'`. */
    private handleSocketClose(): void {
        if (this.closedByConsumer) {
            return;
        }
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }

    /** JSON-serializes and sends one client frame (no-op when the socket is closed). */
    private sendFrame(frame: JSONObject): void {
        this.socket?.send(JSON.stringify(frame));
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
