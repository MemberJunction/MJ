import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient, RealtimeClientState } from './baseRealtimeClient';
import { base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { createPcmMicCapture, IPcmMicCapture } from '../audio/micCapture';

// ── OpenAI-protocol SERVER event interfaces (discriminated union by `type`) ────
// The one shared model of the OpenAI Realtime client-facing frame set, consumed by every
// OpenAI-protocol client driver (OpenAI WebRTC, xAI websocket, HuggingFace websocket). Only the
// fields the drivers read are typed; provider payloads are larger, but there are no `any` leaks.

/** Streaming delta of the assistant's spoken-text transcript (GA or beta event name). */
export interface OAIProtocolTranscriptDelta {
    type: 'response.output_audio_transcript.delta' | 'response.audio_transcript.delta';
    delta: string;
    response_id?: string;
    item_id?: string;
}

/** Final assistant transcript for a turn (GA or beta event name). */
export interface OAIProtocolTranscriptDone {
    type: 'response.output_audio_transcript.done' | 'response.audio_transcript.done';
    transcript: string;
    response_id?: string;
    item_id?: string;
}

/** One base64 PCM16 chunk of the agent's spoken output (websocket transports only). */
export interface OAIProtocolAudioDelta {
    type: 'response.audio.delta' | 'response.output_audio.delta';
    delta: string;
    response_id?: string;
    item_id?: string;
}

/** Final transcription of the user's spoken input for a turn. */
export interface OAIProtocolInputTranscriptionCompleted {
    type: 'conversation.item.input_audio_transcription.completed';
    transcript: string;
    item_id?: string;
}

/** The model finished assembling a function (tool) call and wants it executed. */
export interface OAIProtocolFunctionCallArgumentsDone {
    type: 'response.function_call_arguments.done';
    call_id: string;
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
}

/** The provider detected the user starting to speak (barge-in). */
export interface OAIProtocolSpeechStarted {
    type: 'input_audio_buffer.speech_started';
}

/** A new response (turn) started — tracked so we never start a second overlapping response. */
export interface OAIProtocolResponseCreated {
    type: 'response.created';
}

/** The endpoint confirmed the session exists (used by deferring transports as the config gate). */
export interface OAIProtocolSessionCreated {
    type: 'session.created';
}

/**
 * A full response (turn) completed — carries the usage payload for THIS response
 * (`input_tokens` / `output_tokens`), i.e. per-response DELTAS, exactly the `OnUsage`
 * contract shape.
 */
export interface OAIProtocolResponseDone {
    type: 'response.done';
    response?: { usage?: { input_tokens?: number; output_tokens?: number; [detail: string]: unknown } };
}

/**
 * WebRTC-only playback events: the provider-managed client audio buffer started/stopped
 * PLAYING. Websocket transports own their playback locally and never receive these.
 */
export interface OAIProtocolOutputAudioBufferStarted {
    type: 'output_audio_buffer.started';
}
export interface OAIProtocolOutputAudioBufferStopped {
    type: 'output_audio_buffer.stopped' | 'output_audio_buffer.cleared';
}

/** Provider-side error frame. */
export interface OAIProtocolErrorEvent {
    type: 'error';
    error?: { message?: string; code?: string };
}

/** Events whose `type` we don't explicitly handle still parse to this shape. */
export interface OAIProtocolUnknownEvent {
    type: string;
}

export type OpenAIProtocolServerEvent =
    | OAIProtocolTranscriptDelta
    | OAIProtocolTranscriptDone
    | OAIProtocolAudioDelta
    | OAIProtocolInputTranscriptionCompleted
    | OAIProtocolFunctionCallArgumentsDone
    | OAIProtocolSpeechStarted
    | OAIProtocolResponseCreated
    | OAIProtocolSessionCreated
    | OAIProtocolResponseDone
    | OAIProtocolOutputAudioBufferStarted
    | OAIProtocolOutputAudioBufferStopped
    | OAIProtocolErrorEvent
    | OAIProtocolUnknownEvent;

// ── OpenAI-protocol CLIENT event interfaces (frames WE send) ───────────────────

/** Applies the server-built session config (instructions + tools) to the live session. */
export interface OAIProtocolSessionUpdateEvent {
    type: 'session.update';
    session: JSONObject;
}

/** A user or system `message` conversation item. */
export interface OAIProtocolMessageItem {
    type: 'message';
    role: 'user' | 'system';
    content: Array<{ type: 'input_text'; text: string }>;
}

/** The output of an executed function (tool) call, correlated by `call_id`. */
export interface OAIProtocolFunctionCallOutputItem {
    type: 'function_call_output';
    call_id: string;
    output: string;
}

/** Creates a conversation item (message or tool output). */
export interface OAIProtocolConversationItemCreateEvent {
    type: 'conversation.item.create';
    item: OAIProtocolMessageItem | OAIProtocolFunctionCallOutputItem;
}

/** Asks the model to produce a response, optionally with one-off instructions. */
export interface OAIProtocolResponseCreateEvent {
    type: 'response.create';
    response?: { instructions: string };
}

/** Cancels the model's in-flight response (generation stops; a response.done follows). */
export interface OAIProtocolResponseCancelEvent {
    type: 'response.cancel';
}

/** WebRTC-only: stops + clears the provider-managed output audio buffer immediately. */
export interface OAIProtocolOutputAudioBufferClearEvent {
    type: 'output_audio_buffer.clear';
}

/** Appends one base64 PCM16 mic chunk to the provider's input audio buffer (websocket transports). */
export interface OAIProtocolInputAudioBufferAppendEvent {
    type: 'input_audio_buffer.append';
    audio: string;
}

export type OpenAIProtocolClientEvent =
    | OAIProtocolSessionUpdateEvent
    | OAIProtocolConversationItemCreateEvent
    | OAIProtocolResponseCreateEvent
    | OAIProtocolResponseCancelEvent
    | OAIProtocolOutputAudioBufferClearEvent
    | OAIProtocolInputAudioBufferAppendEvent;

// ── Layer 1: the protocol brain ─────────────────────────────────────────────────

/**
 * The shared **OpenAI-protocol brain** for realtime CLIENT drivers — the transport-agnostic
 * middle layer between {@link BaseRealtimeClient} and the per-provider drivers.
 *
 * Every OpenAI-protocol provider (OpenAI itself over WebRTC, xAI Grok Voice and self-hosted
 * HuggingFace over websockets) shares the exact same event vocabulary and turn discipline, so
 * this class owns — ONCE — the pieces that were previously cloned per driver:
 *
 * - **Inbound event dispatch** ({@link handleEvent}): GA + beta transcript names, input
 *   transcription, tool calls, barge-in gating, playback-buffer events, provider error frames.
 * - **The response state machine**: `responseActive` set on `response.created` / cleared on
 *   `response.done`; tool-result `response.create`s queued while a response is in flight and
 *   flushed on `response.done` so the model ALWAYS voices delegated results.
 * - **Narration-kind tagging**: {@link RequestSpokenUpdate} marks the NEXT response as
 *   `'narration'` so its transcripts are emitted with `Kind: 'narration'` (ephemeral).
 * - **The outbound actions**: {@link SendText} (implies barge-in), {@link SendContextNote},
 *   {@link SendToolResult}, {@link CancelActiveResponse}, {@link SetMuted}.
 *
 * Transport specifics stay in subclasses through a small set of seams: {@link canSendEvents} /
 * {@link sendProtocolEvent} (the wire), {@link stopAudioOutput} (how already-generated speech is
 * silenced), {@link handleAudioDeltaFrame} (websocket transports enqueue PCM; WebRTC ignores —
 * audio rides the peer connection), and per-provider behavioral overrides
 * ({@link onUserTranscriptFrame}, {@link onSpeechStartedFrame}, {@link releasesBusyFlagOnToolCall}).
 */
export abstract class OpenAIProtocolRealtimeClient extends BaseRealtimeClient {
    // ── Response state machine (shared verbatim across the protocol family) ────
    /** Accumulates the in-flight assistant transcript across delta frames. */
    protected pendingAssistantText = '';
    /** True while the model has a response in flight; gates narration + queues the tool result. */
    protected responseActive = false;
    /** Set when a tool result is ready while a response is active; sent on the next response.done. */
    protected pendingResultResponse = false;
    /**
     * Set by {@link RequestSpokenUpdate} just before it sends its `response.create`, and
     * CONSUMED by the very next `response.created` frame, which stamps
     * {@link activeResponseKind} for that turn. Narration is only requested while the model is
     * idle (hosts gate on {@link IsBusy}), so under normal ordering the next `response.created`
     * is ours.
     */
    protected pendingNarrationKind = false;
    /**
     * The kind of the response currently in flight. Event ordering (confirmed against the live
     * OpenAI API): `response.created` → transcript deltas → `*_audio_transcript.done` →
     * `response.done`. The transcript-done frame therefore arrives while the kind is still set,
     * letting {@link onAssistantDone} classify the turn; `response.done` then resets it.
     */
    protected activeResponseKind: 'normal' | 'narration' = 'normal';
    /**
     * The client's own view of the session state — mirrors what `emitStateChange` last
     * reported, EXCEPT after a tool call is emitted: the host typically shows its own busy
     * state then, so the client silently leaves `'speaking'` (no emission) to preserve the
     * host's indicator until the result reply starts (see {@link onToolCallFrame}).
     */
    protected currentState: RealtimeClientState = 'closed';
    /** The mic stream owned by the current connection (used by the shared {@link SetMuted}). */
    protected micStream: MediaStream | null = null;

    // ── Abstract transport seams ────────────────────────────────────────────────

    /** Whether the transport can currently deliver client events (channel/socket open). */
    protected abstract canSendEvents(): boolean;
    /** Delivers one protocol client event over the transport (only called when {@link canSendEvents}). */
    protected abstract sendProtocolEvent(event: OpenAIProtocolClientEvent): void;
    /**
     * Silences already-generated speech during a cancel: websocket transports flush their local
     * playout queue; the WebRTC transport asks the provider to clear its managed output buffer.
     */
    protected abstract stopAudioOutput(): void;

    // ── Virtual per-provider behavior seams (sensible OpenAI defaults) ─────────

    /** Debug label used in the shared console diagnostics. */
    protected get providerDebugLabel(): string {
        return this.constructor.name;
    }

    /**
     * Handles one base64 PCM16 audio delta. Default: no-op — on the WebRTC transport the agent's
     * audio rides the peer connection's remote track, not data-channel frames. Websocket
     * transports override to enqueue into their local playout engine.
     */
    protected handleAudioDeltaFrame(_deltaBase64: string): void {
        // WebRTC: audio arrives on the remote media track, not as protocol frames.
    }

    /**
     * Emits the user's spoken-input transcription. Default (OpenAI/HuggingFace): each
     * `.completed` frame is one final caption. Providers that STREAM the completed event
     * (Grok re-sends the full growing text each time) override to collapse the stream into a
     * single in-place-updating bubble.
     */
    protected onUserTranscriptFrame(transcript: string): void {
        this.emitTranscript({ Role: 'User', Text: transcript, IsFinal: true, Kind: 'normal' });
    }

    /**
     * The user started speaking. TRUE barge-in only when it cut off active model output (a
     * response in flight or audio audibly playing) — a normal turn while the model is idle is
     * NOT an interruption, so the emission is gated (base-contract rule). Transports that own
     * their playback override to also flush the local playout queue.
     */
    protected onSpeechStartedFrame(): void {
        if (this.responseActive || this.IsAudioPlaying) {
            this.emitInterruption();
        }
        this.setState('listening');
    }

    /**
     * Whether a completed tool call CLEARS {@link responseActive}. WebRTC keeps the flag (the
     * provider reliably follows with `response.done`); websocket transports clear it as a
     * deadlock guard so a queued {@link SendToolResult} can never wedge if the endpoint skips
     * the trailing frame.
     */
    protected get releasesBusyFlagOnToolCall(): boolean {
        return false;
    }

    /** Hook for transports that gate on the endpoint's `session.created` frame. Default: no-op. */
    protected onSessionCreatedFrame(): void {
        // Only deferring transports care.
    }

    /** Diagnostic hook for each parsed inbound event. Default: silent. */
    protected logInboundEvent(_event: OpenAIProtocolServerEvent): void {
        // Overridden by drivers that need wire diagnostics.
    }

    /** Diagnostic hook for each non-JSON inbound frame. Default: silent. */
    protected onNonJsonFrame(_raw: string): void {
        // Overridden by drivers that need wire diagnostics.
    }

    /** Diagnostic hook for each outbound event. Default: silent. */
    protected logOutboundEvent(_event: OpenAIProtocolClientEvent): void {
        // Overridden by drivers that need wire diagnostics.
    }

    // ── BaseRealtimeClient: shared outbound actions ────────────────────────────

    /**
     * Injects typed text as a user-role `message` conversation item, then triggers a reply
     * through the SAME collision-safe path tool results use ({@link requestResultResponse}).
     * No-op when the transport isn't open.
     *
     * **SendText implies barge-in** (base-contract rule): an active spoken response is
     * cancelled via {@link CancelActiveResponse} before the text is injected, so the typed
     * turn takes the floor immediately instead of waiting behind stale speech. When nothing is
     * active the cancel is a no-op and the reply triggers immediately.
     */
    public SendText(text: string): void {
        if (!this.canSendEvents()) {
            return;
        }
        this.CancelActiveResponse();
        this.sendEvent({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
        });
        this.requestResultResponse();
    }

    /**
     * @inheritdoc
     *
     * Sends `response.cancel` (only when a response is actually in flight) and silences
     * already-generated speech via the transport's {@link stopAudioOutput}. Resets the local
     * response state machine (active flag, narration kind, accumulated transcript) but
     * PRESERVES any queued tool-result trigger: delegated work is never affected by a
     * floor-control cancel, and the queued trigger still fires on the cancelled response's
     * trailing `response.done`. No-op when idle or when the transport is not open.
     */
    public CancelActiveResponse(): void {
        if (!this.canSendEvents()) {
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
        this.stopAudioOutput();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Injects a system-role context item the model can draw on the next time it speaks,
     * WITHOUT forcing a reply. Item creation is always safe mid-response.
     *
     * NOTE: role must be 'system' — gpt-realtime (and the compatible endpoints) reject
     * 'developer' items ("Developer messages are only supported for quicksilver sessions").
     */
    public SendContextNote(text: string): void {
        if (!this.canSendEvents()) {
            return;
        }
        this.sendEvent({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
        });
    }

    /**
     * Triggers ONE short spoken update with the given instructions. Marks the upcoming
     * response as `'narration'` (flag consumed by the next `response.created`) so its
     * transcripts are emitted with `Kind: 'narration'` — ephemeral by contract. Sets
     * {@link responseActive} eagerly so a tool result landing mid-narration queues instead of
     * colliding.
     *
     * **Skips when busy** (base-contract collision rule — drivers MUST queue or skip): a
     * `response.create` sent while a response is in flight would be rejected/garbled by the
     * provider, and narration is disposable by contract, so the update is dropped with a debug
     * log rather than queued to come out late and stale. Hosts SHOULD still gate on
     * {@link IsBusy} / {@link IsAudioPlaying} for timing quality.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (!this.canSendEvents()) {
            return;
        }
        if (this.responseActive) {
            console.debug(`[${this.providerDebugLabel}] RequestSpokenUpdate skipped — a response is already in flight (narration is disposable).`);
            return;
        }
        this.responseActive = true;
        this.pendingNarrationKind = true;
        this.sendEvent({ type: 'response.create', response: { instructions } });
    }

    /**
     * Sends the tool result back as a `function_call_output` conversation item, then triggers
     * a reply — immediately if the model is idle, otherwise queued until the current response
     * (e.g. a progress narration) finishes. Without the queueing the result's `response.create`
     * would collide with an in-flight narration and be dropped, leaving the model silent when
     * delegated work comes back.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (!this.canSendEvents()) {
            return;
        }
        this.sendEvent({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: callID, output: outputJson },
        });
        this.requestResultResponse();
    }

    /**
     * Mutes / unmutes by toggling the mic tracks' `enabled` flag: the transport stays up and
     * streams SILENCE while muted (the provider's VAD sees a continuous stream and the un-mute
     * is glitch-free — the same policy across the client driver family).
     */
    public SetMuted(muted: boolean): void {
        for (const track of this.micStream?.getAudioTracks() ?? []) {
            track.enabled = !muted;
        }
    }

    /** @inheritdoc */
    public get IsBusy(): boolean {
        return this.responseActive;
    }

    // ── Inbound event translation (the shared dispatcher) ──────────────────────

    /**
     * Parses one raw inbound payload and dispatches it. Non-JSON frames and non-object JSON
     * values are ignored (with the {@link onNonJsonFrame} diagnostic hook for the former).
     */
    protected handleProtocolMessage(raw: string): void {
        let event: OpenAIProtocolServerEvent;
        try {
            event = JSON.parse(raw) as OpenAIProtocolServerEvent;
        } catch {
            this.onNonJsonFrame(raw);
            return;
        }
        if (event === null || typeof event !== 'object') {
            return; // valid JSON but not an event object (e.g. "null", a number) — ignore
        }
        this.logInboundEvent(event);
        this.handleEvent(event);
    }

    /** Dispatches a typed OpenAI-protocol server event to the appropriate behavior. */
    protected handleEvent(event: OpenAIProtocolServerEvent): void {
        switch (event.type) {
            case 'session.created':
                this.onSessionCreatedFrame();
                break;
            case 'response.output_audio_transcript.delta':
            case 'response.audio_transcript.delta':
                this.onAssistantDelta((event as OAIProtocolTranscriptDelta).delta);
                break;
            case 'response.output_audio_transcript.done':
            case 'response.audio_transcript.done':
                this.onAssistantDone((event as OAIProtocolTranscriptDone).transcript);
                break;
            case 'response.audio.delta':
            case 'response.output_audio.delta':
                this.onAudioDelta((event as OAIProtocolAudioDelta).delta);
                break;
            case 'conversation.item.input_audio_transcription.completed':
                this.onUserTranscriptFrame((event as OAIProtocolInputTranscriptionCompleted).transcript);
                break;
            case 'response.function_call_arguments.done':
                this.onToolCallFrame(event as OAIProtocolFunctionCallArgumentsDone);
                break;
            case 'input_audio_buffer.speech_started':
                this.onSpeechStartedFrame();
                break;
            case 'response.created':
                this.responseActive = true;
                // Stamp the kind of THIS response: 'narration' only when the flag was set by
                // RequestSpokenUpdate immediately before its response.create (consumed here).
                this.activeResponseKind = this.pendingNarrationKind ? 'narration' : 'normal';
                this.pendingNarrationKind = false;
                break;
            case 'output_audio_buffer.started':
                this.onOutputAudioBufferStarted();
                break;
            case 'output_audio_buffer.stopped':
            case 'output_audio_buffer.cleared':
                this.onOutputAudioBufferStopped();
                break;
            case 'response.done':
                // A turn finished — release the lock and speak any queued tool result so the
                // model always voices the answer when delegated work comes back. The
                // transcript-done frame for this turn has already arrived (it precedes
                // response.done), so it's safe to reset the response kind here.
                this.responseActive = false;
                this.activeResponseKind = 'normal';
                this.emitResponseUsage(event as OAIProtocolResponseDone);
                this.flushPendingResultResponse();
                if (this.currentState === 'speaking') {
                    this.setState('listening');
                }
                break;
            case 'error':
                this.onErrorFrame(event as OAIProtocolErrorEvent);
                break;
            default:
                // Unhandled event types are expected (the provider emits many); no-op.
                break;
        }
    }

    /** WebRTC-only playback-buffer hooks; websocket transports never receive these frames. */
    protected onOutputAudioBufferStarted(): void {
        // Only the WebRTC transport tracks provider-managed playback.
    }
    protected onOutputAudioBufferStopped(): void {
        // Only the WebRTC transport tracks provider-managed playback.
    }

    /** Reflects `'speaking'` on the first audio delta, then hands the chunk to the transport. */
    private onAudioDelta(deltaBase64: string): void {
        if (!deltaBase64) {
            return;
        }
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
        this.handleAudioDeltaFrame(deltaBase64);
    }

    /** Appends an assistant transcript delta, reflects `'speaking'`, and emits the delta. */
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

    /**
     * Finalizes the assistant turn: emits the final transcript tagged with the ACTIVE response
     * kind (the transcript-done frame arrives BEFORE `response.done`, so
     * {@link activeResponseKind} still reflects this turn), then returns to `'listening'`.
     * Empty turns emit nothing.
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
     * Surfaces a completed tool call to the host. The client silently leaves the `'speaking'`
     * state (NO emission) so a host-rendered busy indicator (e.g. "thinking") isn't clobbered
     * by this turn's trailing `response.done` / playback-stopped frames. Websocket transports
     * additionally clear the busy flag ({@link releasesBusyFlagOnToolCall}) as a deadlock guard.
     */
    private onToolCallFrame(call: OAIProtocolFunctionCallArgumentsDone): void {
        if (this.currentState === 'speaking') {
            this.currentState = 'connected';
        }
        if (this.releasesBusyFlagOnToolCall) {
            this.responseActive = false;
        }
        this.emitToolCall({ CallID: call.call_id, ToolName: call.name, ArgumentsJson: call.arguments });
    }

    /**
     * Emits the completed response's usage to the host as a DELTA (the `response.done` usage
     * payload covers exactly this response, so it is already incremental — the `OnUsage`
     * contract's preferred shape). Frames without a usage payload emit nothing.
     */
    private emitResponseUsage(event: OAIProtocolResponseDone): void {
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
    private onErrorFrame(event: OAIProtocolErrorEvent): void {
        this.emitError({
            Message: event.error?.message ?? 'Unknown provider error',
            Code: event.error?.code,
            Fatal: false,
        });
    }

    // ── Response state machine helpers ─────────────────────────────────────────

    /**
     * Asks the model to speak (a tool result or typed-text reply) — immediately if it's idle,
     * otherwise queued until the current response finishes. An immediate trigger also
     * CONSUMES any queued trigger debt: every payload item is already in the conversation, so
     * one `response.create` voices everything (e.g. typed text barging in over a narration
     * that had tool results queued behind it).
     */
    protected requestResultResponse(): void {
        if (!this.canSendEvents()) {
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
    protected flushPendingResultResponse(): void {
        if (!this.pendingResultResponse || !this.canSendEvents()) {
            return;
        }
        this.pendingResultResponse = false;
        this.responseActive = true;
        this.sendEvent({ type: 'response.create' });
        this.setState('speaking');
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    protected resetResponseState(): void {
        this.pendingAssistantText = '';
        this.responseActive = false;
        this.pendingResultResponse = false;
        this.pendingNarrationKind = false;
        this.activeResponseKind = 'normal';
    }

    // ── Shared helpers ─────────────────────────────────────────────────────────

    /** Updates the client's own state view and emits the change to the host. */
    protected setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }

    /** Logs (diagnostic hook) and delivers one client event when the transport is open. */
    protected sendEvent(event: OpenAIProtocolClientEvent): void {
        if (!this.canSendEvents()) {
            return;
        }
        this.logOutboundEvent(event);
        this.sendProtocolEvent(event);
    }
}

// ── Layer 2: the shared websocket + PCM transport ───────────────────────────────

/**
 * The minimal websocket surface the websocket-transport drivers depend on: assignable lifecycle
 * handlers plus `send`/`close`. Declaring the seam as an interface (rather than the platform
 * `WebSocket`) lets unit tests inject a fully in-memory fake — no websocket, no network.
 */
export interface IOpenAIProtocolClientSocket {
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
 * The shared **websocket + client-owned-PCM transport** for OpenAI-protocol client drivers
 * (xAI Grok Voice, self-hosted HuggingFace). Extends the protocol brain with everything the
 * websocket drivers previously each owned:
 *
 * - The socket lifecycle: wire-up, open/created gating (profile-driven via
 *   {@link waitsForSessionCreated}), fatal error / unexpected-close handling.
 * - The PCM audio plane: shared mic-capture worklet streaming `input_audio_buffer.append`
 *   frames up, shared playout engine scheduling base64 deltas down, audio meters both ways.
 * - The transport implementations of the brain's seams: {@link sendProtocolEvent} /
 *   {@link canSendEvents} over the socket, {@link stopAudioOutput} → local playout flush,
 *   {@link handleAudioDeltaFrame} → playout enqueue, `IsAudioPlaying` → the playout clock.
 *
 * Concrete drivers supply only: the socket target ({@link openProviderSocket}), the session
 * object + sample rate resolution from the server pact ({@link resolveSessionObject} /
 * {@link resolveSampleRate}), and any provider behavior overrides (streamed user transcripts,
 * close semantics).
 */
export abstract class OpenAIProtocolWebSocketRealtimeClient extends OpenAIProtocolRealtimeClient {
    /** The live socket (null when disconnected). Protected so test subclasses can inspect. */
    protected socket: IOpenAIProtocolClientSocket | null = null;
    /** The local playout engine (client-owned audio plane). */
    protected playback: IRealtimePcmPlayback | null = null;
    /** The mic-capture pipeline streaming PCM16 up to the provider. */
    protected micCapture: IPcmMicCapture | null = null;
    /**
     * The wire-shaped session object applied via `session.update` at the readiness boundary.
     * Protected so test subclasses can seed it without a full Connect.
     */
    protected sessionObject: JSONObject = {};
    /** True once Disconnect ran — an expected socket close must not surface as fatal. */
    protected closedByConsumer = false;
    /** Resolver for the in-flight Connect's `session.created` wait (deferring providers only). */
    private sessionCreatedResolver: (() => void) | null = null;

    // ── Per-provider transport hooks ────────────────────────────────────────────

    /** Opens the provider socket for this connection (drivers own URL/auth specifics). */
    protected abstract openProviderSocket(config: ClientRealtimeSessionConfig): IOpenAIProtocolClientSocket;
    /** Extracts the wire-shaped `session` object from the server pact. Default: the pact itself. */
    protected resolveSessionObject(config: ClientRealtimeSessionConfig): JSONObject {
        return config.SessionConfig ?? {};
    }
    /** Resolves the PCM sample rate for the audio plane (both directions). */
    protected abstract resolveSampleRate(config: ClientRealtimeSessionConfig): number;
    /**
     * Whether the readiness boundary waits for the endpoint's `session.created` frame before
     * applying the session config (HuggingFace) or applies it on socket open (xAI — the
     * protocol has no separate readiness ack there).
     */
    protected get waitsForSessionCreated(): boolean {
        return false;
    }

    // ── Connection lifecycle ────────────────────────────────────────────────────

    /**
     * Opens the websocket, gates on open (and `session.created` when the provider defers),
     * applies the server-authored session config as the FIRST frame (prompt + tool authority
     * stay server-side), builds the PCM audio plane at the provider's rate, and reports
     * `'listening'` only after all of that (obligation #7).
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.sessionObject = this.resolveSessionObject(config);
        this.micStream = micStream;
        this.closedByConsumer = false;
        this.setState('connecting');

        let openSocket: (() => void) | null = null;
        let failOpen: ((error: Error) => void) | null = null;
        const opened = new Promise<void>((resolve, reject) => {
            openSocket = resolve;
            failOpen = reject;
        });
        const created = this.waitsForSessionCreated
            ? new Promise<void>((resolve) => {
                  this.sessionCreatedResolver = resolve;
              })
            : null;

        const socket = this.openProviderSocket(config);
        this.socket = socket;
        socket.onopen = () => openSocket?.();
        socket.onmessage = (data) => this.handleProtocolMessage(data);
        socket.onerror = (message) => {
            failOpen?.(new Error(message));
            this.handleSocketError(message);
        };
        socket.onclose = () => {
            failOpen?.(new Error(`${this.providerDebugLabel} socket closed during connect`));
            this.handleSocketClose();
        };

        await opened;
        this.setState('connected');
        if (created) {
            await created;
        }
        // The server-authored session config (the SessionConfig pact) is applied as the FIRST
        // frame — prompt and tool authority stay server-side (obligation #8).
        this.applySessionConfig();

        const sampleRate = this.resolveSampleRate(config);
        this.playback = this.createPlayback(sampleRate);
        this.micCapture = await this.createMicCapture(micStream, sampleRate, (base64Pcm16) => this.sendMicChunk(base64Pcm16));
        // Audio-activity capability (base obligation #9): agent side taps the playout engine's
        // master gain; user side meters the mic stream. Null-safe — test fakes / no-WebAudio
        // environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
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
        this.sessionObject = {};
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── Brain seam implementations ─────────────────────────────────────────────

    /** @inheritdoc */
    protected canSendEvents(): boolean {
        return this.socket !== null;
    }

    /** @inheritdoc */
    protected sendProtocolEvent(event: OpenAIProtocolClientEvent): void {
        this.socket?.send(JSON.stringify(event));
    }

    /** @inheritdoc — the client OWNS the audio plane, so a cancel flushes the local queue. */
    protected stopAudioOutput(): void {
        this.playback?.Flush();
    }

    /** @inheritdoc — enqueues one base64 PCM16 chunk into the local playout engine. */
    protected override handleAudioDeltaFrame(deltaBase64: string): void {
        this.playback?.Enqueue(base64ToArrayBuffer(deltaBase64));
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

    /**
     * @inheritdoc — websocket transports flush their local playout on TRUE barge-in
     * (obligation #3); the provider cancels its own turn and emits a terminal `response.done`.
     */
    protected override onSpeechStartedFrame(): void {
        if (this.responseActive || this.IsAudioPlaying) {
            this.playback?.Flush();
            this.emitInterruption();
        }
        this.setState('listening');
    }

    /** @inheritdoc — deadlock guard: compat endpoints may skip `response.done` after a tool call. */
    protected override get releasesBusyFlagOnToolCall(): boolean {
        return true;
    }

    /** @inheritdoc — releases a deferring Connect's `session.created` gate. */
    protected override onSessionCreatedFrame(): void {
        this.sessionCreatedResolver?.();
        this.sessionCreatedResolver = null;
    }

    // ── Transport internals ─────────────────────────────────────────────────────

    /**
     * Sends the server-controlled session config (instructions + tools) as a `session.update`
     * so the co-agent's identity and tool set apply. Skipped when the pact carried no config
     * (e.g. the host failed to parse the server payload — it already logged that; sending an
     * EMPTY `session.update` would be wrong).
     */
    protected applySessionConfig(): void {
        if (Object.keys(this.sessionObject).length === 0) {
            return;
        }
        this.sendEvent({ type: 'session.update', session: this.sessionObject });
    }

    /** Streams one base64 PCM16 mic chunk as an `input_audio_buffer.append` frame. */
    protected sendMicChunk(base64Pcm16: string): void {
        if (this.socket) {
            this.sendEvent({ type: 'input_audio_buffer.append', audio: base64Pcm16 });
        }
    }

    /** Formats a socket-level error message for the host. Providers brand this (see xAI). */
    protected formatTransportError(message: string): string {
        return message;
    }

    /** The fatal-error message surfaced when the socket closes unexpectedly. Providers brand this. */
    protected get unexpectedCloseMessage(): string {
        return `${this.providerDebugLabel} connection closed unexpectedly`;
    }

    /** Surfaces a fatal socket error and marks the session unusable (obligation #6). */
    protected handleSocketError(message: string): void {
        if (this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: this.formatTransportError(message), Fatal: true });
        this.setState('error');
    }

    /**
     * A socket close the CONSUMER didn't ask for. Default: FATAL — providers hard-close at
     * token expiry and when they end the session themselves, so an unexpected close is how
     * credential / session death reaches the host (obligation #6). Providers with benign
     * close semantics (a self-hosted proxy hop) override.
     */
    protected handleSocketClose(): void {
        if (this.closedByConsumer || this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: this.unexpectedCloseMessage, Fatal: true });
        this.setState('error');
    }

    // ── Overridable creation seams (tests inject fakes — no audio stack) ───────

    /**
     * Creation seam for the mic-capture pipeline at the provider's rate. Production delegates
     * to the shared {@link createPcmMicCapture}; unit tests override this with a no-op fake
     * (and may capture `onPcmChunk` to simulate mic frames).
     */
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
}
