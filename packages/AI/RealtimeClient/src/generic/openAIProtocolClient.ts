import { ClientRealtimeSessionConfig, JSONObject, MapRealtimeUsageModalityDetail, RealtimeDiagLog, RealtimeMemorySeed, RealtimeReconnectFailureCode, RealtimeReconnectReason, RenderLateToolResultNote, RenderRealtimeMemorySeed, ResolveResponseDoneUsage } from '@memberjunction/ai';
import { BaseRealtimeClient, RealtimeClientReconnectContext, RealtimeClientState, ToProviderSessionConfig } from './baseRealtimeClient';
import { Base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { CreatePcmMicCapture, IPcmMicCapture } from '../audio/micCapture';

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

/**
 * The provider committed the user's audio buffer as a conversation item. It arrives in conversation order, before the
 * response the turn starts, while the item's transcription may finish only after that response.
 */
export interface OAIProtocolInputAudioBufferCommitted {
    type: 'input_audio_buffer.committed';
    item_id?: string;
    previous_item_id?: string | null;
}

/** The provider could not transcribe a committed user audio item, so no transcript will come for it. */
export interface OAIProtocolInputTranscriptionFailed {
    type: 'conversation.item.input_audio_transcription.failed';
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
    item_id?: string;
}

/** A new response (turn) started — tracked so we never start a second overlapping response. */
export interface OAIProtocolResponseCreated {
    type: 'response.created';
}

/** The endpoint confirmed the session exists (used by deferring transports as the config gate). */
export interface OAIProtocolSessionCreated {
    type: 'session.created';
}

/** The usage payload carried by a `response.done` frame — per-response DELTAS on every provider. */
export interface OAIProtocolUsage {
    input_tokens?: number;
    output_tokens?: number;
    [detail: string]: unknown;
}

/**
 * A full response (turn) completed — carries the usage payload for THIS response
 * (`input_tokens` / `output_tokens`), i.e. per-response DELTAS, exactly the `OnUsage`
 * contract shape.
 *
 * **The payload's LOCATION is provider-specific**, which is why both slots are declared:
 * - OpenAI (`gpt-realtime`) populates `response.usage` and sends no top-level `usage`.
 * - xAI (Grok Voice) populates a TOP-LEVEL `usage` and sends `response.usage` as an EMPTY
 *   object — captured live off `wss://api.x.ai/v1/realtime`.
 *
 * {@link ResolveResponseDoneUsage} picks whichever slot actually carries token counts.
 */
export interface OAIProtocolResponseDone {
    type: 'response.done';
    response?: { usage?: OAIProtocolUsage };
    /** xAI puts usage HERE, as a sibling of `response`. */
    usage?: OAIProtocolUsage;
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
    | OAIProtocolInputAudioBufferCommitted
    | OAIProtocolInputTranscriptionFailed
    | OAIProtocolFunctionCallArgumentsDone
    | OAIProtocolSpeechStarted
    | OAIProtocolResponseCreated
    | OAIProtocolSessionCreated
    | OAIProtocolResponseDone
    | OAIProtocolOutputAudioBufferStarted
    | OAIProtocolOutputAudioBufferStopped
    | OAIProtocolErrorEvent
    | OAIProtocolUnknownEvent;

/**
 * How long one user utterance may hold a soft-window reconnect without a closing event, counted from its latest
 * `speech_started` or `committed` frame. A safety net: an utterance whose transcription is off, or whose closing
 * frame never comes, must not push every move to the hard deadline. The hard deadline stays the absolute bound (or,
 * when an answer was in progress at it, the controller's last call shortly before the provider limit).
 */
export const PENDING_USER_UTTERANCE_MAX_AGE_MS = 15_000;

/** Key for an utterance whose frames carry no `item_id`. */
const UNIDENTIFIED_UTTERANCE_KEY = '';

// ── OpenAI-protocol CLIENT event interfaces (frames WE send) ───────────────────

/** Applies the server-built session config (instructions + tools) to the live session. */
export interface OAIProtocolSessionUpdateEvent {
    type: 'session.update';
    session: JSONObject;
}

/** A user, assistant, or system `message` conversation item. */
export interface OAIProtocolMessageItem {
    type: 'message';
    role: 'user' | 'assistant' | 'system';
    content: Array<{ type: 'input_text' | 'output_text'; text: string }>;
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
    /** Typed user turns sent while the call moves to a new connection; see {@link SendText}. */
    private textHeldDuringReconnect: string[] = [];
    /** Tool results sent while the call moves to a new connection; see {@link SendToolResult}. */
    private toolResultsHeldDuringReconnect: Array<{ CallID: string; OutputJson: string }> = [];
    /**
     * True while {@link deliverHeldInput} sends the held items, so each item's reply request is collected into one
     * `response.create` sent after the last item (see {@link responseOwedByHeldInput}).
     */
    private deliveringHeldInput = false;
    /** Set by {@link requestResultResponse} while {@link deliveringHeldInput}: a held item asked for a reply. */
    private responseOwedByHeldInput = false;
    /**
     * Whether the current call went live (`'listening'`) and has not ended since. A lost transport is recovered only
     * then; see {@link recoverLostTransport}.
     */
    private callWentLive = false;
    /**
     * Set by {@link seedConversationAfterMove} when the move cut off an answer the seed still owes the user, so
     * {@link onReconnected} asks the new connection for it. One move asks once; the next move decides afresh.
     */
    private answerOwedAfterMove = false;
    /**
     * User utterances, by `item_id`, that only the current connection knows about: from `speech_started` until the
     * model takes the floor for them (`response.created`) or their transcript settles in conversation memory
     * (`input_audio_transcription.completed` / `.failed` after the commit). A move in that gap would strand the audio
     * on the closing connection: no answer, and no transcript for the seed. See {@link isTurnActiveForReconnect}.
     */
    private readonly pendingUserUtterances = new Map<string, { Committed: boolean; Expiry: ReturnType<typeof setTimeout> }>();
    /** True while the model has a response in flight; gates narration + queues the tool result. */
    protected responseActive = false;
    /** Set when a tool result is ready while a response is active; sent on the next response.done. */
    protected pendingResultResponse = false;
    /**
     * Count of locally-initiated `response.create`s whose `response.created` echo has not arrived
     * yet. While non-zero, a `response.done` belongs to an EARLIER (typically just-cancelled)
     * response — it must not clear the busy flag, flush the queued trigger, or flip the state for
     * the response we just started (usage is still emitted). Consumed by `response.created`.
     */
    protected pendingLocalResponseCreates = 0;
    /**
     * True while a response the provider has CONFIRMED (`response.created` seen, `response.done` not
     * yet) is in flight. Distinct from {@link responseActive}, which is set EAGERLY before a local
     * `response.create` is even sent: if the provider REJECTS that create (an `error` frame with no
     * `response.created`), `responseActive` would otherwise stay stuck true forever. This flag lets
     * {@link onErrorFrame} tell "the eager flag is a phantom for a rejected create" (no confirmed
     * response) from "a real response is genuinely active" (e.g. a concurrent VAD turn), so it clears
     * the phantom without disturbing a live turn. Set on `response.created`, cleared on `response.done`.
     */
    protected confirmedResponseActive = false;
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
    protected onUserTranscriptFrame(transcript: string, itemId?: string): void {
        this.emitTranscript({
            Role: 'User',
            Text: transcript,
            IsFinal: true,
            Kind: 'normal',
            ...(itemId !== undefined ? { ItemId: itemId } : {}),
        });
    }

    /**
     * The user started speaking. TRUE barge-in only when it cut off active model output (a
     * response in flight or audio audibly playing) — a normal turn while the model is idle is
     * NOT an interruption, so the emission is gated (base-contract rule). Transports that own
     * their playback override to also flush the local playout queue.
     */
    protected onSpeechStartedFrame(): void {
        if (this.responseActive || this.IsAudioPlaying) {
            // The user took the floor. Drop the queued AUTO-trigger: the tool-result item is
            // already in the conversation, so the user's next turn (server-VAD response) voices
            // it contextually instead of a queued response.create stomping the fresh user turn.
            this.pendingResultResponse = false;
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
        // During a move the old transport is still open but is closed as soon as the new one takes over, so text sent
        // on it is lost: it is held and goes out on the new connection once the move completes (onReconnected).
        if (this.IsReconnecting) {
            this.textHeldDuringReconnect.push(text);
            return;
        }
        this.deliverUserText(text);
    }

    /**
     * @inheritdoc
     *
     * During a move a result is held, like typed text, and goes out once the call is live again: on the new connection
     * after the swap ({@link onReconnected}), or on the old one when a planned move goes back to it
     * ({@link ResumeOnOldConnection}). Sent on now, it would be lost: a lost transport cannot carry it, and a closing
     * one takes it along after the seed for the new connection was built. It is recorded into memory when it goes out,
     * so it reaches the model and the seed of a later move exactly once.
     */
    public override SendToolResult(callID: string, outputJson: string): void {
        if (this.IsReconnecting) {
            this.toolResultsHeldDuringReconnect.push({ CallID: callID, OutputJson: outputJson });
            return;
        }
        super.SendToolResult(callID, outputJson);
    }

    /**
     * Sends one typed user turn and records it in conversation memory. The provider sends no input transcription for a
     * text item (only for audio), so without the record a later reseed would drop the turn. It is recorded when sent,
     * not when held, so a held turn is not also in the seed of the move it waited for.
     */
    private deliverUserText(text: string): void {
        if (!this.canSendEvents()) {
            return;
        }
        this.CancelActiveResponse();
        this.sendEvent({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
        });
        this.ConversationMemory.Record({ Kind: 'user', Text: text });
        this.requestResultResponse();
    }

    /**
     * The move has started, so the holds it waited on are spent: the utterances belong to the connection being left,
     * and the next connection's speech starts holds of its own.
     */
    protected override onReconnecting(reason: RealtimeReconnectReason): void {
        this.forgetUserUtterances();
        this.answerOwedAfterMove = false;
        super.onReconnecting(reason);
    }

    /**
     * Sends the input held during the move to the new connection, after the seed, and asks for one answer covering it
     * and an answer the move cut off (see {@link seedConversationAfterMove}). After `super`, so a result for a call
     * from before a reseed goes out as a late-result note.
     */
    protected override onReconnected(usedNativeResumption: boolean): void {
        super.onReconnected(usedNativeResumption);
        const answerOwed = this.answerOwedAfterMove;
        this.answerOwedAfterMove = false;
        if (answerOwed) {
            RealtimeDiagLog(`[${this.providerDebugLabel}] the move cut off an answer; asking the new connection for it`);
        }
        this.deliverHeldInput(answerOwed);
    }

    /**
     * Sends the tool results, then the typed text, held during a move, oldest first, and then ONE `response.create`
     * when any of them (or `answerOwed`) asks for a reply. One request answers every item, and it comes after the
     * last one: a reply requested per item would be cancelled by the next typed turn (text implies barge-in).
     */
    private deliverHeldInput(answerOwed: boolean): void {
        const results = this.toolResultsHeldDuringReconnect;
        const texts = this.textHeldDuringReconnect;
        this.toolResultsHeldDuringReconnect = [];
        this.textHeldDuringReconnect = [];
        this.deliveringHeldInput = true;
        this.responseOwedByHeldInput = false;
        try {
            for (const result of results) {
                super.SendToolResult(result.CallID, result.OutputJson);
            }
            for (const text of texts) {
                this.deliverUserText(text);
            }
        } finally {
            this.deliveringHeldInput = false;
        }
        const owed = answerOwed || this.responseOwedByHeldInput;
        this.responseOwedByHeldInput = false;
        if (owed) {
            this.requestResultResponse();
        }
    }

    /**
     * A planned move's attempt failed and the old transport is still open: the call goes on there until the next
     * attempt. The state the move replaced is reported again, and the text and tool results held for the move go out
     * on it now instead of waiting for (or being dropped with) the cycle. `false` when the old transport is gone too.
     */
    protected override ResumeOnOldConnection(): boolean {
        if (!this.canSendEvents() || this.currentState === 'error' || this.currentState === 'closed') {
            return false;
        }
        const restore = this.StateToRestoreOnOldConnection;
        if (restore) {
            this.setState(restore);
        }
        this.deliverHeldInput(false);
        return true;
    }

    /** The move failed and the call is over, so the held input has no connection to go to. */
    protected override onReconnectFailed(error: Error, code: RealtimeReconnectFailureCode): void {
        this.dropInputHeldDuringReconnect('the reconnect failed');
        super.onReconnectFailed(error, code);
    }

    /** Drops the text and tool results held for a move that will not complete, logging how many and why. */
    protected dropInputHeldDuringReconnect(why: string): void {
        const texts = this.textHeldDuringReconnect.length;
        const results = this.toolResultsHeldDuringReconnect.length;
        this.textHeldDuringReconnect = [];
        this.toolResultsHeldDuringReconnect = [];
        if (texts === 0 && results === 0) {
            return;
        }
        RealtimeDiagLog(
            `[${this.providerDebugLabel}] dropping ${texts} typed turn(s) and ${results} tool result(s) held during a reconnect: ${why}`
        );
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
        this.ConversationMemory.Record({ Kind: 'note', Text: text });
        if (!this.canSendEvents()) {
            return;
        }
        this.sendEvent({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
        });
    }

    /**
     * Resets the response bookkeeping for a connection that has just replaced the old one, and returns whether an
     * answer was in flight (or queued) on the old one. Every count and flag here describes the old connection: a
     * `response.create` it never confirmed would otherwise make the new connection's real `response.done` look stale
     * and leave {@link IsBusy} stuck.
     */
    protected resetResponseStateForNewConnection(): boolean {
        const answerWasInFlight = this.responseActive || this.pendingResultResponse;
        this.responseActive = false;
        this.confirmedResponseActive = false;
        this.pendingResultResponse = false;
        this.pendingLocalResponseCreates = 0;
        this.pendingNarrationKind = false;
        this.activeResponseKind = 'normal';
        this.pendingAssistantText = '';
        return answerWasInFlight;
    }

    /**
     * Seeds the new connection after a move (when `sendsSeed`; a natively resumed one already has the history) and
     * notes whether the move cut off an answer the user is still owed: one was in flight on the old connection
     * (`answerWasInFlight`, from {@link resetResponseStateForNewConnection}) and the conversation ends with what it
     * answers (a user turn or a tool result), not counting the context notes after it. Neither a seeded nor a resumed
     * session replies by itself, so without this the question sits unanswered in every later seed. An answer that
     * completed is in memory as an assistant turn and is not asked for again.
     */
    protected seedConversationAfterMove(
        context: RealtimeClientReconnectContext,
        answerWasInFlight: boolean,
        sendsSeed: boolean
    ): void {
        if (sendsSeed) {
            this.seedConversationHistory(context.ConversationSeed);
        }
        this.answerOwedAfterMove = answerWasInFlight && OpenAIProtocolRealtimeClient.endsAwaitingAnswer(context.Seed);
    }

    /** Whether the conversation's last entry other than a context note is a user turn or a tool result. */
    private static endsAwaitingAnswer(seed: RealtimeMemorySeed): boolean {
        for (let i = seed.Entries.length - 1; i >= 0; i--) {
            const kind = seed.Entries[i].Kind;
            if (kind !== 'note') {
                return kind === 'user' || kind === 'toolResult';
            }
        }
        return false;
    }

    /**
     * Seeds bounded conversation history turns into a freshly reconnected OpenAI-protocol session.
     */
    protected seedConversationHistory(seed: RealtimeMemorySeed | null): void {
        if (!seed || seed.Entries.length === 0) {
            return;
        }
        const turns = RenderRealtimeMemorySeed(seed);
        for (const turn of turns) {
            const role: 'user' | 'assistant' = turn.Role === 'model' ? 'assistant' : 'user';
            const contentType = role === 'assistant' ? 'output_text' : 'input_text';
            this.sendEvent({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role,
                    content: turn.Texts.map((text) => ({ type: contentType, text })),
                },
            });
        }
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
     *
     * The wire frame is built by {@link buildSpokenUpdateEvent}, which is where the identity
     * rule lives — see that method for why the caller's direction is never sent on its own.
     */
    public RequestSpokenUpdate(instructions: string): void {
        this.requestInstructedResponse(instructions, 'narration');
    }

    /** A spoken TURN: the same response.create as the update, with the reply kept `normal` (MJ#4591). */
    public RequestSpokenTurn(instructions: string): void {
        this.requestInstructedResponse(instructions, 'normal');
    }

    /**
     * The one trigger behind both spoken requests, so the two cannot drift: same skip rule, same
     * frame. `kind` decides only how the reply is tagged.
     */
    private requestInstructedResponse(instructions: string, kind: 'normal' | 'narration'): void {
        if (!this.canSendEvents()) {
            return;
        }
        if (this.responseActive) {
            const method = kind === 'narration' ? 'RequestSpokenUpdate' : 'RequestSpokenTurn';
            const why = kind === 'narration' ? ' (narration is disposable)' : '';
            console.debug(`[${this.providerDebugLabel}] ${method} skipped — a response is already in flight${why}.`);
            return;
        }
        this.responseActive = true;
        this.pendingNarrationKind = kind === 'narration';
        this.pendingLocalResponseCreates++;
        this.sendEvent(this.buildSpokenUpdateEvent(instructions));
    }

    /**
     * The `response.create` frame for one spoken update — **carrying the session identity, not
     * replacing it.**
     *
     * ⚠️ `response.instructions` IS A FULL OVERRIDE OF THE SESSION SYSTEM PROMPT for that one
     * response, not an addition to it. That is the whole reason this method exists. The
     * server-side twin of this driver (`openAIRealtime.ts`) already states the rule and guards
     * the BLANK case on it — forwarding `''` "would wipe the co-agent identity framing" — but the
     * NON-blank case was never guarded, so every caller that supplied a real direction wiped it
     * just as thoroughly and much less visibly.
     *
     * What that cost, live: the one turn that rides this method had no persona, so the model fell
     * back to its vendor default and opened a hiring interview with *"I'm ChatGPT, your friendly
     * voice companion"* while every other turn in the same session correctly said *"I'm Sam
     * Rivera, Support Team Lead"* (bizapps-caliber#397 / MJ#4591). Every commentary-style caller
     * is exposed the same way — an opening turn, a silence check-in, a delegation narration — and
     * none of them should have to restate an identity the session already carries.
     *
     * Three cases, and the middle one is the fix:
     *
     *  - **Blank direction** → a bare `response.create`. "Respond now, under the session prompt"
     *    (the meeting-mode bridge trigger passes `''`). Matches the server twin exactly.
     *  - **Direction + session instructions** → `identity, then direction`. The identity leads
     *    because it is context, and the direction is LAST because it is the thing being asked for
     *    now — the most recent line is the one a model weights hardest.
     *  - **Direction, no session instructions** → the direction alone. A session minted without
     *    instructions has no identity to lose, and prefixing a blank line would be noise.
     */
    protected buildSpokenUpdateEvent(instructions: string): OAIProtocolResponseCreateEvent {
        const direction = instructions?.trim() ?? '';
        if (direction.length === 0) {
            return { type: 'response.create' };
        }
        const identity = this.currentSessionInstructions();
        return {
            type: 'response.create',
            response: { instructions: identity === null ? direction : `${identity}\n\n${direction}` },
        };
    }

    /**
     * The session-level instructions currently in force — the co-agent's identity, persona and
     * standing directives, as applied by `session.update`.
     *
     * A SEAM, not a field read, because the pact lives in a different place per transport: the
     * websocket subclass keeps it in `sessionObject`, the WebRTC driver in its own `sessionConfig`.
     * The base holds no copy of either, so it answers "no identity on record" and each transport
     * overrides with the one it actually applied. A transport that forgets to override loses only
     * the carry — {@link buildSpokenUpdateEvent} still sends the caller's direction — which is the
     * old behaviour rather than a new failure.
     *
     * Null rather than `''` for "this session carries no identity", so {@link buildSpokenUpdateEvent}
     * can tell "nothing to preserve" from "preserve this".
     */
    protected currentSessionInstructions(): string | null {
        return null;
    }

    /** Reads a session pact's `instructions`, or null when it carries none worth preserving. */
    protected static readInstructions(pact: JSONObject | null | undefined): string | null {
        const value = pact?.['instructions'];
        return typeof value === 'string' && value.trim().length > 0 ? value : null;
    }

    /**
     * Sends the tool result back as a `function_call_output` conversation item, then triggers
     * a reply — immediately if the model is idle, otherwise queued until the current response
     * (e.g. a progress narration) finishes. Without the queueing the result's `response.create`
     * would collide with an in-flight narration and be dropped, leaving the model silent when
     * delegated work comes back.
     */
    protected override doSendToolResult(callID: string, outputJson: string): boolean | void {
        if (!this.canSendEvents()) {
            return false;
        }
        const name = this.resolveToolName(callID);
        if (this.callsFromBeforeReseed.delete(callID)) {
            this.sendEvent({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: RenderLateToolResultNote(name, outputJson) }],
                },
            });
            this.requestResultResponse();
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

    /**
     * @inheritdoc
     *
     * Adds the user's pending utterances: the controller's turn opens only on `response.created`, and the input meter
     * sees speech only at the instant it is read (not in a pause between words, nor after the commit).
     */
    protected override isTurnActiveForReconnect(): boolean {
        return this.pendingUserUtterances.size > 0 || super.isTurnActiveForReconnect();
    }

    /** Starts (or restarts the max age of) the hold for one user utterance. */
    private trackUserUtterance(itemId: string | undefined, committed: boolean): void {
        const key = itemId ?? UNIDENTIFIED_UTTERANCE_KEY;
        const existing = this.pendingUserUtterances.get(key);
        if (existing) {
            clearTimeout(existing.Expiry);
        }
        const expiry = setTimeout(() => {
            RealtimeDiagLog(
                `[${this.providerDebugLabel}] user utterance ${key || '(no id)'} held the reconnect for ${PENDING_USER_UTTERANCE_MAX_AGE_MS} ms with no answer or transcript; releasing it`
            );
            this.releaseUserUtterances((_utterance, k) => k === key);
        }, PENDING_USER_UTTERANCE_MAX_AGE_MS);
        this.pendingUserUtterances.set(key, { Committed: committed || (existing?.Committed ?? false), Expiry: expiry });
    }

    /**
     * The provider committed the utterance's audio. Its `speech_started` may have carried no id (then that entry takes
     * this id), and a commit with no `speech_started` (a manual commit) is still audio only this connection holds.
     */
    private markUserUtteranceCommitted(itemId: string | undefined): void {
        if (itemId !== undefined && !this.pendingUserUtterances.has(itemId)) {
            const unidentified = this.pendingUserUtterances.get(UNIDENTIFIED_UTTERANCE_KEY);
            if (unidentified) {
                clearTimeout(unidentified.Expiry);
                this.pendingUserUtterances.delete(UNIDENTIFIED_UTTERANCE_KEY);
            }
        }
        this.trackUserUtterance(itemId, true);
    }

    /**
     * The utterance's transcription settled, so the seed of a move carries it (or nothing will). Only a committed
     * utterance is released: Grok streams `.completed` frames while the user is still speaking. A frame with no id
     * settles every committed utterance.
     */
    private releaseCommittedUserUtterance(itemId: string | undefined): void {
        this.releaseUserUtterances(
            (utterance, key) => utterance.Committed && (itemId === undefined || key === itemId)
        );
    }

    /** Releases the matching holds and, when none is left, lets a deferred soft-window move go ahead. */
    private releaseUserUtterances(
        matches: (utterance: { Committed: boolean }, key: string) => boolean
    ): void {
        let released = false;
        for (const [key, utterance] of this.pendingUserUtterances) {
            if (matches(utterance, key)) {
                clearTimeout(utterance.Expiry);
                this.pendingUserUtterances.delete(key);
                released = true;
            }
        }
        if (released && this.pendingUserUtterances.size === 0) {
            this.reconnectController.NotifyIdleStateChanged();
        }
    }

    /** Drops every hold without re-checking a move (the connection they belong to is gone). */
    private forgetUserUtterances(): void {
        for (const utterance of this.pendingUserUtterances.values()) {
            clearTimeout(utterance.Expiry);
        }
        this.pendingUserUtterances.clear();
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
            case 'conversation.created': {
                const conv = (event as { conversation?: { id?: unknown } }).conversation;
                if (typeof conv?.id === 'string' && conv.id.trim().length > 0) {
                    this.RecordResumptionHandle(conv.id);
                }
                break;
            }
            case 'session.going_away':
            case 'go_away': {
                const rawMs = (event as { time_left_ms?: unknown }).time_left_ms;
                const timeLeftMs = typeof rawMs === 'number' && Number.isFinite(rawMs) ? rawMs : undefined;
                this.NotifyConnectionEnding(timeLeftMs);
                break;
            }
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
            case 'conversation.item.input_audio_transcription.completed': {
                const completed = event as OAIProtocolInputTranscriptionCompleted;
                this.onUserTranscriptFrame(completed.transcript, completed.item_id);
                // After the record above, so a move this releases seeds the transcript.
                this.releaseCommittedUserUtterance(completed.item_id);
                break;
            }
            case 'input_audio_buffer.committed': {
                // Reserve the user turn's place now: its transcription can complete after the model's answer or tool
                // call, and a reseed must not put the request after what it caused.
                const itemId = (event as OAIProtocolInputAudioBufferCommitted).item_id;
                if (typeof itemId === 'string' && itemId.trim().length > 0) {
                    this.ConversationMemory.ReserveUserTurn(itemId);
                }
                this.markUserUtteranceCommitted(itemId);
                break;
            }
            case 'conversation.item.input_audio_transcription.failed': {
                const itemId = (event as OAIProtocolInputTranscriptionFailed).item_id;
                RealtimeDiagLog(`[${this.providerDebugLabel}] input transcription failed for item ${itemId ?? '(no id)'}; the turn is left out of conversation memory`);
                if (typeof itemId === 'string') {
                    this.ConversationMemory.ReleaseUserTurn(itemId);
                }
                this.releaseCommittedUserUtterance(itemId);
                break;
            }
            case 'input_audio_buffer.cleared':
                // The uncommitted audio is gone, so nothing of it can be lost in a move.
                this.releaseUserUtterances((utterance) => !utterance.Committed);
                break;
            case 'response.function_call_arguments.done':
                this.onToolCallFrame(event as OAIProtocolFunctionCallArgumentsDone);
                break;
            case 'input_audio_buffer.speech_started':
                // Raised here, not in onSpeechStartedFrame: the websocket base (HuggingFace, xAI)
                // overrides that hook without super, and xAI overrides it again, so an override can't drop it.
                this.emitUserSpeechStart((event as OAIProtocolSpeechStarted).item_id);
                // Before onSpeechStartedFrame: its 'listening' state ends the turn, which re-checks a deferred move,
                // and that check must already see the utterance.
                this.trackUserUtterance((event as OAIProtocolSpeechStarted).item_id, false);
                this.onSpeechStartedFrame();
                break;
            case 'response.created': {
                this.responseActive = true;
                this.confirmedResponseActive = true; // a real response is now in flight
                this.reconnectController.TurnStarted();
                // The open turn now holds any move until the answer is out. Speech not committed yet is not
                // what this response answers, so it keeps its own hold.
                this.releaseUserUtterances((utterance) => utterance.Committed);
                this.onResponseStarted();
                // Only a LOCALLY-initiated create (counter-tracked) can be our narration. A VAD /
                // unsolicited response.created arrives with the counter already at 0 — it must NOT
                // consume the pending narration kind, or it would mistag a genuine user turn as
                // ephemeral narration (and lose the flag meant for our own create).
                const wasLocalCreate = this.pendingLocalResponseCreates > 0;
                if (wasLocalCreate) {
                    this.pendingLocalResponseCreates--;
                }
                // Stamp the kind of THIS response: 'narration' only when the flag was set by
                // RequestSpokenUpdate immediately before ITS OWN local response.create (consumed here).
                this.activeResponseKind = (wasLocalCreate && this.pendingNarrationKind) ? 'narration' : 'normal';
                if (wasLocalCreate) {
                    this.pendingNarrationKind = false;
                }
                break;
            }
            case 'output_audio_buffer.started':
                this.onOutputAudioBufferStarted();
                break;
            case 'output_audio_buffer.stopped':
            case 'output_audio_buffer.cleared':
                this.onOutputAudioBufferStopped();
                break;
            case 'response.done':
                // The confirmed response that was in flight has ended (whether this is its real done
                // or the trailing done of a since-cancelled one) — no response.created is outstanding.
                this.confirmedResponseActive = false;
                // A STALE done (the trailing frame of a response we just cancelled while our own
                // replacement response.create is in flight) must not release the lock, flush the
                // queue, or flip the state out from under the response we just started — the real
                // done for OUR response handles all of that. Usage is still emitted (the cancelled
                // response consumed tokens).
                if (this.pendingLocalResponseCreates > 0) {
                    this.emitResponseUsage(event as OAIProtocolResponseDone);
                    break;
                }
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
                } else if (!this.responseActive) {
                    this.reconnectController.TurnEnded();
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

    /**
     * Called when the model takes the floor (`response.created`), i.e. the user's turn is definitively
     * over. Drivers that track per-user-turn transcription state override this to reset it. No-op here.
     */
    protected onResponseStarted(): void {
        // Only streamed-transcription drivers carry per-user-turn state worth clearing.
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
     * contract's preferred shape). Frames without a usage payload emit nothing. The per-modality
     * split (`input_token_details` / `output_token_details`) rides along when the provider sends it,
     * so pricing can tell audio tokens from text tokens.
     */
    private emitResponseUsage(event: OAIProtocolResponseDone): void {
        const usage = ResolveResponseDoneUsage(event);
        if (!usage) {
            return;
        }
        const inputDetails = MapRealtimeUsageModalityDetail(usage['input_token_details']);
        const outputDetails = MapRealtimeUsageModalityDetail(usage['output_token_details']);
        this.emitUsage({
            InputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
            OutputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
            ...(inputDetails ? { InputTokenDetails: inputDetails } : {}),
            ...(outputDetails ? { OutputTokenDetails: outputDetails } : {}),
            Raw: usage,
        });
    }

    /**
     * Surfaces a provider error frame (non-fatal; the session continues).
     *
     * SELF-HEAL for the stale-response counter (see {@link pendingLocalResponseCreates}): a
     * `response.create` the provider REJECTS (overlap, invalid params) produces an `error` frame
     * and **no** `response.created`, so the counter would otherwise never decrement and every
     * future `response.done` would take the stale branch — wedging the client (`IsBusy` stuck true,
     * narration + tool results silently dropped). Decrementing here (floored at 0) reverts to the
     * pre-counter self-healing behavior for that turn rather than leaving the session dead. An
     * error unrelated to a local create at worst under-protects one `done` (the old default), never
     * wedges.
     */
    private onErrorFrame(event: OAIProtocolErrorEvent): void {
        if (this.pendingLocalResponseCreates > 0) {
            this.pendingLocalResponseCreates--;
            // The counter dropping here means this error plausibly REJECTED one of our local
            // response.creates (rejected creates emit an error and NO response.created). The rejected
            // create's narration kind belongs to THAT create — it will never arrive, so drop the flag
            // UNCONDITIONALLY, or it would arm the NEXT local create (e.g. a delegated tool-result
            // reply) and mistag that durable turn as ephemeral narration. This must NOT be gated on
            // confirmedResponseActive: a narration create can be rejected while a since-cancelled
            // response is still draining (confirmedResponseActive still true), and the flag must die
            // regardless.
            this.pendingNarrationKind = false;
            // The EAGER responseActive / 'speaking' state, by contrast, is only a phantom to clear
            // when NO provider-CONFIRMED response is in flight; a genuinely-active response (concurrent
            // VAD turn, or a cancelled one still draining) owns that state and its response.done clears
            // it. Clearing it here would cut a live turn.
            if (!this.confirmedResponseActive) {
                this.responseActive = false;
                if (this.currentState === 'speaking') {
                    this.setState('listening');
                }
            }
        }
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
        if (this.deliveringHeldInput) {
            this.responseOwedByHeldInput = true;
            return;
        }
        if (this.responseActive) {
            this.pendingResultResponse = true;
            return;
        }
        this.pendingResultResponse = false;
        this.responseActive = true;
        this.pendingLocalResponseCreates++;
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
        this.pendingLocalResponseCreates++;
        this.sendEvent({ type: 'response.create' });
        this.setState('speaking');
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    protected resetResponseState(): void {
        this.dropInputHeldDuringReconnect('the call ended');
        this.forgetUserUtterances();
        this.answerOwedAfterMove = false;
        this.pendingAssistantText = '';
        this.responseActive = false;
        this.confirmedResponseActive = false;
        this.pendingResultResponse = false;
        this.pendingLocalResponseCreates = 0;
        this.pendingNarrationKind = false;
        this.activeResponseKind = 'normal';
    }

    // ── Shared helpers ─────────────────────────────────────────────────────────

    /** Updates the client's own state view and emits the change to the host. */
    protected setState(state: RealtimeClientState): void {
        if (state === 'listening' || state === 'speaking') {
            this.callWentLive = true;
        } else if (state === 'connecting' || state === 'closed' || state === 'error') {
            // 'connecting' here is a new Connect: a move reports it through emitStateChange, not this method.
            this.callWentLive = false;
        }
        this.currentState = state;
        this.emitStateChange(state);
    }

    /**
     * Whether an unexpected loss of a live call's transport is handed to the shared `connection-lost` reconnect. On by
     * default for every driver that can reconnect mid-call; a driver whose transport closes benignly and whose host
     * reads that close as the end of the session overrides it to `false`.
     */
    protected get RecoversLostTransport(): boolean {
        return this.SupportsMidCallReconnect;
    }

    /**
     * Hands an unexpected loss of the live call's transport (a close or error the consumer did not ask for) to the
     * shared reconnect controller, which retries within its recovery window and reports `reconnect-failed` when the
     * window closes. Returns `false` when there is no live call to save, so the caller keeps its terminal handling: the
     * connect has not finished (Connect reports that failure itself), the call already ended, or the driver opts out.
     * A loss while a reconnect is running returns `true`: the in-flight cycle owns it.
     *
     * Live means the call went live and has not ended ({@link callWentLive}), not a speech state: during a tool run the
     * state is `'connected'` (see {@link onToolCallFrame}), and a loss then is as recoverable as one mid-sentence.
     */
    protected recoverLostTransport(detail: string): boolean {
        if (this.IsReconnecting) {
            return true;
        }
        if (!this.callWentLive || !this.RecoversLostTransport) {
            return false;
        }
        RealtimeDiagLog(`[${this.providerDebugLabel}] transport lost during a live call (${detail}); reconnecting`);
        void this.TriggerReconnect('connection-lost');
        return true;
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
    /** The active ClientRealtimeSessionConfig, updated on credential refresh. */
    protected activeConfig: ClientRealtimeSessionConfig | null = null;
    /** True once Disconnect ran — an expected socket close must not surface as fatal. */
    protected closedByConsumer = false;
    /** True while the socket is OPEN — gates every send so a CONNECTING socket never throws. */
    protected socketOpen = false;
    /** Resolver for the in-flight Connect's `session.created` wait (deferring providers only). */
    private sessionCreatedResolver: (() => void) | null = null;
    /** Rejects the in-flight Connect (open OR created phase); null outside Connect. */
    private failPendingConnect: ((error: Error) => void) | null = null;

    // ── Per-provider transport hooks ────────────────────────────────────────────

    /** Opens the provider socket for this connection (drivers own URL/auth specifics). */
    protected abstract openProviderSocket(
        config: ClientRealtimeSessionConfig,
        resumptionHandle?: string | null
    ): IOpenAIProtocolClientSocket;
    /**
     * Extracts the wire-shaped `session` object from the server pact. Default: the pact minus the
     * client-only hints ({@link ToProviderSessionConfig}).
     */
    protected resolveSessionObject(config: ClientRealtimeSessionConfig): JSONObject {
        return ToProviderSessionConfig(config.SessionConfig ?? {});
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

    /**
     * Connect-phase deadline in milliseconds, covering socket-open AND (when the provider
     * defers) the `session.created` wait. On expiry `Connect` rejects with a fatal error
     * instead of hanging forever against a silent endpoint. Override per driver/deployment.
     */
    protected get connectTimeoutMs(): number {
        return 15_000;
    }

    // ── Connection lifecycle ────────────────────────────────────────────────────

    /**
     * Opens the websocket, gates on open (and `session.created` when the provider defers),
     * applies the server-authored session config as the FIRST frame (prompt + tool authority
     * stay server-side), builds the PCM audio plane at the provider's rate, and reports
     * `'listening'` only after all of that (obligation #7).
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.AssertTransportSupported(config);
        this.ApplySessionConfigTiming(config);
        this.activeConfig = config;
        this.sessionObject = this.resolveSessionObject(config);
        this.micStream = micStream;
        this.closedByConsumer = false;
        this.setState('connecting');

        let openSocket: (() => void) | null = null;
        const opened = new Promise<void>((resolve) => {
            openSocket = resolve;
        });
        const created = this.waitsForSessionCreated
            ? new Promise<void>((resolve) => {
                  this.sessionCreatedResolver = resolve;
              })
            : null;
        // ONE failure channel covers BOTH connect phases (open + created): socket error/close,
        // a consumer Disconnect, and the connect deadline all reject the in-flight Connect —
        // no phase can hang an awaited Connect() forever against a silent endpoint.
        const failure = new Promise<never>((_, reject) => {
            this.failPendingConnect = reject;
        });
        failure.catch(() => undefined); // consumed via Promise.race; guard stray-rejection noise
        const deadline = setTimeout(
            () => this.failPendingConnect?.(new Error(`${this.providerDebugLabel} connect timed out after ${this.connectTimeoutMs}ms`)),
            this.connectTimeoutMs,
        );
        // Node parity with the server readiness timer — never hold the event loop for the deadline.
        (deadline as { unref?: () => void }).unref?.();

        // S2: build the socket + wire handlers INSIDE the try so a synchronous throw from
        // openProviderSocket (no global WebSocket, malformed URL) still clears the deadline timer
        // and nulls failPendingConnect via the finally.
        try {
            this.socketOpen = false; // S3: never inherit a prior connect's open state on reuse
            const socket = this.openProviderSocket(config);
            this.socket = socket;
            // S3: identity-guard every handler — a PREVIOUS socket's late onerror/onclose (they
            // fire asynchronously after a Disconnect+reconnect on a reused instance) must not
            // corrupt the NEW socket's state or drive the fresh session to error/closed.
            socket.onopen = () => {
                if (this.socket !== socket) { return; }
                this.socketOpen = true;
                openSocket?.();
            };
            socket.onmessage = (data) => {
                if (this.socket !== socket) { return; }
                this.handleProtocolMessage(data);
            };
            socket.onerror = (message) => {
                if (this.socket !== socket) { return; }
                this.socketOpen = false;
                this.failPendingConnect?.(new Error(message));
                this.handleSocketError(message);
            };
            socket.onclose = () => {
                if (this.socket !== socket) { return; }
                this.socketOpen = false;
                this.failPendingConnect?.(new Error(`${this.providerDebugLabel} socket closed during connect`));
                this.handleSocketClose();
            };

            await Promise.race([opened, failure]);
            this.setState('connected');
            if (created) {
                await Promise.race([created, failure]);
            }
        } catch (error) {
            // Deadline expiry reaches the host ONLY through this rejection — surface it as a
            // fatal error + error state (socket error/close paths already emitted their own).
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('timed out')) {
                this.emitError({ Message: message, Fatal: true });
                this.setState('error');
                try { this.socket?.close(); } catch { /* already closing */ }
            }
            throw error;
        } finally {
            clearTimeout(deadline);
            this.failPendingConnect = null;
            this.sessionCreatedResolver = null;
        }
        // The server-authored session config (the SessionConfig pact) is applied as the FIRST
        // frame — prompt and tool authority stay server-side (obligation #8).
        this.applySessionConfig();

        const sampleRate = this.resolveSampleRate(config);
        this.playback = this.createPlayback(sampleRate);
        // The agent voice plays through Web Audio only; publish it so a host recorder can mix
        // it in (issue #5153). Null for playbacks with no output stream (fakes, no WebAudio).
        this.publishRemoteMediaStream(this.playback.GetOutputStream?.() ?? null);
        this.micCapture = await this.createMicCapture(micStream, sampleRate, (base64Pcm16) => this.sendMicChunk(base64Pcm16));
        // Audio-activity capability (base obligation #9): agent side taps the playout engine's
        // master gain; user side meters the mic stream. Null-safe — test fakes / no-WebAudio
        // environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
        this.ArmConnectionDurationTimer();
        this.setState('listening');
    }

    /** Rebinds the PCM capture and the input meter to the stream's current track (obligation #10); the socket stays open. */
    public async ReplaceMicrophone(micStream: MediaStream): Promise<void> {
        if (!this.micCapture) {
            return;
        }
        this.micCapture.Rebind(micStream);
        this.micStream = micStream;
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
    }

    /**
     * Tears down the socket, mic capture, mic tracks, and playout engine, resets the response
     * state machine, and emits a final `'closed'` (unless already `'error'`). Safe to call
     * more than once.
     */
    public async Disconnect(): Promise<void> {
        this.closedByConsumer = true;
        this.DisposeReconnectTimers();
        // Release an in-flight Connect (open or created phase) so the awaited promise cannot
        // outlive the session the consumer just tore down.
        this.failPendingConnect?.(new Error(`${this.providerDebugLabel} disconnected during connect`));
        this.failPendingConnect = null;
        this.sessionCreatedResolver = null;
        this.socketOpen = false;
        this.closeAudioMeters();
        this.micStream?.getTracks().forEach((track) => track.stop());
        this.micStream = null;
        this.micCapture?.Stop();
        this.micCapture = null;
        this.playback?.Close();
        this.playback = null;
        this.clearRemoteMediaStream();
        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                /* already closing */
            }
            this.socket = null;
        }
        this.sessionObject = {};
        this.activeConfig = null;
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    /**
     * Performs an in-place WebSocket swap on duration expiry or provider GoAway while keeping
     * the existing `micCapture`, `playback`, and audio meters intact.
     */
    protected override async Reconnect(context: RealtimeClientReconnectContext): Promise<void> {
        if (!this.activeConfig) {
            throw new Error(`${this.providerDebugLabel}: cannot reconnect before Connect`);
        }
        if (context.Abandoned) {
            throw new Error(`${this.providerDebugLabel}: reconnect attempt abandoned`);
        }
        const refreshedConfig: ClientRealtimeSessionConfig = {
            ...this.activeConfig,
            EphemeralToken: context.Credential.EphemeralToken || this.activeConfig.EphemeralToken,
            ExpiresAt: context.Credential.ExpiresAt || this.activeConfig.ExpiresAt,
            ...(context.Credential.RelayUrl !== undefined ? { RelayUrl: context.Credential.RelayUrl } : {}),
            ...(context.Credential.SessionConfig !== undefined ? { SessionConfig: context.Credential.SessionConfig } : {}),
        };
        this.activeConfig = refreshedConfig;
        this.sessionObject = this.resolveSessionObject(refreshedConfig);

        const prevSocket = this.socket;
        let openSocket: (() => void) | null = null;
        const opened = new Promise<void>((resolve) => {
            openSocket = resolve;
        });
        const created = this.waitsForSessionCreated
            ? new Promise<void>((resolve) => {
                  this.sessionCreatedResolver = resolve;
              })
            : null;
        let failReconnect: ((error: Error) => void) | null = null;
        const failure = new Promise<never>((_, reject) => {
            failReconnect = reject;
        });
        failure.catch(() => undefined);

        const nextSocket = this.openProviderSocket(
            refreshedConfig,
            context.UseNativeResumption ? context.ResumptionHandle : null
        );
        let nextSocketOpen = false;
        const onAbort = () => {
            failReconnect?.(new Error(`${this.providerDebugLabel}: reconnect attempt aborted`));
            try { nextSocket.close(); } catch { /* ignore */ }
        };
        if (context.Signal.aborted) {
            onAbort();
            throw new Error(`${this.providerDebugLabel}: reconnect attempt aborted`);
        }
        context.Signal.addEventListener('abort', onAbort, { once: true });

        nextSocket.onopen = () => {
            nextSocketOpen = true;
            openSocket?.();
        };
        nextSocket.onmessage = (data) => {
            if (this.socket === nextSocket) {
                this.handleProtocolMessage(data);
                return;
            }
            try {
                const event = JSON.parse(data) as OpenAIProtocolServerEvent;
                if (event && typeof event === 'object' && event.type === 'session.created') {
                    this.onSessionCreatedFrame();
                } else if (event && typeof event === 'object' && event.type === 'conversation.created') {
                    const conv = (event as { conversation?: { id?: unknown } }).conversation;
                    if (typeof conv?.id === 'string' && conv.id.trim().length > 0) {
                        this.RecordResumptionHandle(conv.id);
                    }
                }
            } catch {
                /* ignore non-JSON during handshake */
            }
        };
        nextSocket.onerror = (message) => {
            nextSocketOpen = false;
            failReconnect?.(new Error(message));
            if (this.socket === nextSocket && !this.IsReconnecting) {
                this.socketOpen = false;
                this.handleSocketError(message);
            }
        };
        nextSocket.onclose = () => {
            nextSocketOpen = false;
            failReconnect?.(new Error(`${this.providerDebugLabel} socket closed during reconnect`));
            if (this.socket === nextSocket && !this.IsReconnecting) {
                this.socketOpen = false;
                this.handleSocketClose();
            }
        };

        try {
            await Promise.race([opened, failure]);
            if (context.Abandoned) {
                throw new Error(`${this.providerDebugLabel}: reconnect attempt abandoned after open`);
            }
            if (created) {
                await Promise.race([created, failure]);
            }
            if (context.Abandoned) {
                throw new Error(`${this.providerDebugLabel}: reconnect attempt abandoned after session.created`);
            }
        } catch (err) {
            nextSocket.onopen = null;
            nextSocket.onmessage = null;
            nextSocket.onerror = null;
            nextSocket.onclose = null;
            try { nextSocket.close(); } catch { /* ignore */ }
            throw err;
        } finally {
            context.Signal.removeEventListener('abort', onAbort);
            failReconnect = null;
            this.sessionCreatedResolver = null;
        }

        if (prevSocket) {
            prevSocket.onopen = null;
            prevSocket.onmessage = null;
            prevSocket.onerror = null;
            prevSocket.onclose = null;
        }
        this.socket = nextSocket;
        this.socketOpen = nextSocketOpen;

        try {
            prevSocket?.close();
        } catch {
            /* already closing */
        }

        const answerWasInFlight = this.resetResponseStateForNewConnection();
        this.applySessionConfig();
        const resumedNatively = context.UseNativeResumption && Boolean(context.ResumptionHandle);
        this.seedConversationAfterMove(context, answerWasInFlight, !resumedNatively);
        this.setState('listening');
    }

    // ── Brain seam implementations ─────────────────────────────────────────────

    /** @inheritdoc — requires an OPEN socket (a CONNECTING raw WebSocket throws on send). */
    protected canSendEvents(): boolean {
        return this.socket !== null && this.socketOpen;
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
        this.playback?.Enqueue(Base64ToArrayBuffer(deltaBase64));
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
            // Floor to the user — drop the queued auto-trigger (see the brain's docstring).
            this.pendingResultResponse = false;
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

    /** @inheritdoc — this transport's pact is {@link sessionObject}, applied over the socket. */
    protected override currentSessionInstructions(): string | null {
        return OpenAIProtocolRealtimeClient.readInstructions(this.sessionObject);
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

    /**
     * A socket error. During a live call it starts the `connection-lost` reconnect (a websocket
     * error is always followed by its close, which the running reconnect then ignores); before
     * that it is fatal and marks the session unusable (obligation #6).
     */
    protected handleSocketError(message: string): void {
        if (this.IsReconnecting || this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        // The socket's close follows; the reconnect started here owns it (see the close guard).
        if (this.recoverLostTransport(`socket error: ${message}`)) {
            return;
        }
        this.emitError({ Message: this.formatTransportError(message), Fatal: true });
        this.setState('error');
    }

    /**
     * A socket close the CONSUMER didn't ask for. During a live call it is a lost connection
     * (a network cut, a dropped proxy hop), so it goes to the shared `connection-lost`
     * reconnect; a session the provider really ended surfaces as `reconnect-failed` once the
     * recovery window closes. Before the call is live it is FATAL — that is how a rejected
     * credential or session reaches the host (obligation #6). Providers with benign close
     * semantics (a self-hosted proxy hop) override.
     */
    protected handleSocketClose(): void {
        if (this.closedByConsumer || this.IsReconnecting || this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        if (this.recoverLostTransport('socket closed')) {
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
        return CreatePcmMicCapture(micStream, sampleRate, onPcmChunk);
    }

    /** Creation seam for the playout engine. Production returns the shared {@link RealtimePcmPlayback}. */
    protected createPlayback(sampleRate: number): IRealtimePcmPlayback {
        return new RealtimePcmPlayback(sampleRate);
    }
}
