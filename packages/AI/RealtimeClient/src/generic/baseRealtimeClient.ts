import { ClientRealtimeSessionConfig } from '@memberjunction/ai';

/**
 * A transcript event emitted by a realtime client for either side of the conversation.
 *
 * `Kind` distinguishes NORMAL conversation turns from NARRATION turns — the brief,
 * ephemeral spoken updates a host requests via {@link BaseRealtimeClient.RequestSpokenUpdate}
 * while background (delegated) work runs. By product decision narration transcripts are
 * NOT captions and are never persisted; hosts surface them as a transient "live note".
 */
export interface RealtimeClientTranscript {
    /** Whose turn this transcript belongs to. */
    Role: 'User' | 'Assistant';
    /**
     * The transcribed text. For `IsFinal: false` events this is the incremental DELTA
     * for the in-flight turn; for `IsFinal: true` it is the complete turn text.
     */
    Text: string;
    /** Whether this is the final transcript for the turn (`true`) or an interim delta (`false`). */
    IsFinal: boolean;
    /**
     * `'normal'` for a regular conversation turn; `'narration'` for an ephemeral
     * spoken-progress update triggered by {@link BaseRealtimeClient.RequestSpokenUpdate}.
     */
    Kind: 'normal' | 'narration';
}

/**
 * A tool-call request emitted by the realtime model. The host executes the tool and feeds
 * the result back via {@link BaseRealtimeClient.SendToolResult}, correlated by `CallID`.
 */
export interface RealtimeClientToolCall {
    /** Provider-assigned identifier for this call, used to correlate the eventual tool result. */
    CallID: string;
    /** The name of the tool the model is requesting to invoke. */
    ToolName: string;
    /** The arguments for the call as a JSON string, exactly as the provider emitted them. */
    ArgumentsJson: string;
}

/**
 * Connection / turn state of a realtime client session.
 * - `connecting` — the provider connection is being negotiated
 * - `connected`  — the transport is up but the control channel is not yet open
 * - `listening`  — control channel open; mic live; waiting on / hearing the user
 * - `speaking`   — the model is producing (or about to produce) audible output
 * - `closed`     — the session has been torn down
 * - `error`      — a fatal transport error occurred; the session is no longer usable
 *
 * Note there is deliberately NO `thinking` state here: "the host is executing a tool" is
 * host policy, not wire state. Hosts that want a busy indicator set it themselves between
 * receiving a tool call and calling {@link BaseRealtimeClient.SendToolResult}.
 */
export type RealtimeClientState = 'connecting' | 'connected' | 'listening' | 'speaking' | 'closed' | 'error';

/**
 * An error surfaced by a realtime client. `Fatal: true` means the session is unusable
 * (transport failure); `Fatal: false` is a provider-reported, recoverable error frame.
 */
export interface RealtimeClientError {
    /** Human-readable error message. */
    Message: string;
    /** Optional provider-specific error code. */
    Code?: string;
    /** Whether the error terminated the session. */
    Fatal: boolean;
}

/**
 * Abstract base class for **browser-side, provider-direct** realtime (voice) clients.
 *
 * This is the client-side mirror of the server's `BaseRealtimeModel` pattern: the server
 * mints an ephemeral credential + session config (`ClientRealtimeSessionConfig`) via its
 * provider driver, and the browser resolves the matching CLIENT driver through the
 * MemberJunction `ClassFactory` using the config's `Provider` string as the registration
 * key (e.g. `'openai'`):
 *
 * ```typescript
 * const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(
 *     BaseRealtimeClient, startResult.Provider);
 * ```
 *
 * Concrete drivers (e.g. {@link OpenAIRealtimeClient}) own ALL provider wire concerns:
 * transport (WebRTC/WebSocket), event-name translation, the response state machine
 * (never letting a tool-result reply collide with an in-flight response), narration-kind
 * tagging, and audible-playback tracking. Hosts own POLICY: when to narrate, what
 * instructions to speak, transcript persistence, and UI state.
 *
 * All `On*` methods register a single handler (matching the server `IRealtimeSession`
 * style); registering again replaces the previous handler.
 */
export abstract class BaseRealtimeClient {
    // ── Registered handlers (single-handler style, like IRealtimeSession) ─────
    private transcriptHandler?: (transcript: RealtimeClientTranscript) => void;
    private toolCallHandler?: (call: RealtimeClientToolCall) => void;
    private stateChangeHandler?: (state: RealtimeClientState) => void;
    private errorHandler?: (error: RealtimeClientError) => void;

    /**
     * Opens the provider connection using the server-minted ephemeral credential and applies
     * `config.SessionConfig` **verbatim** once the control channel is ready — so prompt and
     * tool authority stay server-side even though the browser owns the socket.
     *
     * @param config The server-minted client session config (provider, model, ephemeral token, session config).
     * @param micStream The user's microphone capture stream. The caller acquires it (so IT owns
     *   the permission prompt UX); the client attaches it to the transport and stops its tracks
     *   on {@link Disconnect}.
     */
    public abstract Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void>;

    /**
     * Injects typed text into the live session as a USER turn and asks the model to respond.
     * Implementations must route the reply through the same collision-safe path as tool
     * results so it never collides with an in-flight response. No-op when the control
     * channel is not open.
     *
     * @param text The user's typed message (callers pass pre-trimmed, non-empty text).
     */
    public abstract SendText(text: string): void;

    /**
     * Injects background context into the model's conversation WITHOUT forcing a reply —
     * e.g. delegated-run progress the model can draw on the next time it speaks.
     *
     * @param text The context note text (the host owns any prefixing/formatting policy).
     */
    public abstract SendContextNote(text: string): void;

    /**
     * Asks the model for ONE brief interim utterance (e.g. a spoken progress update while
     * delegated work runs). Implementations MUST tag the resulting turn's transcripts with
     * `Kind: 'narration'` and MUST NOT let this response collide with a pending tool-result
     * reply — the tool result is queued and spoken as soon as the narration finishes.
     *
     * @param instructions The exact provider instructions for the utterance. The instruction
     *   TEXT is host policy (e.g. first-person phrasing rules) — the client only carries it.
     */
    public abstract RequestSpokenUpdate(instructions: string): void;

    /**
     * Feeds an executed tool's result back to the model, correlated by `callID`, and ensures
     * the model SPEAKS the result as soon as possible: immediately when idle, otherwise
     * queued behind the in-flight response (e.g. a progress narration) so the trigger is
     * never dropped by the provider.
     *
     * @param callID The `CallID` from the originating {@link RealtimeClientToolCall}.
     * @param outputJson The tool's result as a JSON-stringified string.
     */
    public abstract SendToolResult(callID: string, outputJson: string): void;

    /**
     * Mutes / unmutes the microphone (implementations toggle the mic tracks' `enabled` flag —
     * the transport stays up; the provider just receives silence while muted).
     *
     * @param muted `true` to mute the mic, `false` to unmute.
     */
    public abstract SetMuted(muted: boolean): void;

    /**
     * Tears down the provider connection and all client-held resources (control channel,
     * transport, mic tracks, audio sink) and emits a final `'closed'` state (unless the
     * session already ended in `'error'`). Safe to call more than once.
     */
    public abstract Disconnect(): Promise<void>;

    /**
     * `true` while a model response is in flight (generation started and not yet done).
     * Distinct from {@link IsAudioPlaying}: generation runs ahead of playback.
     * Hosts use this to gate interim narration so it never interrupts a reply.
     */
    public abstract get IsBusy(): boolean;

    /**
     * `true` while model audio is AUDIBLY playing in the browser. Distinct from
     * {@link IsBusy} — audio plays at realtime while generation finishes early, so the
     * model can be "idle" while speech is still coming out of the speaker. Hosts must
     * gate narration on BOTH, or queued utterances come out late and stale.
     */
    public abstract get IsAudioPlaying(): boolean;

    // ── Handler registration ──────────────────────────────────────────────────

    /**
     * Registers the (single) transcript handler. Receives interim deltas (`IsFinal: false`)
     * and final turn transcripts (`IsFinal: true`) for both roles, tagged with their
     * {@link RealtimeClientTranscript.Kind}.
     */
    public OnTranscript(handler: (transcript: RealtimeClientTranscript) => void): void {
        this.transcriptHandler = handler;
    }

    /**
     * Registers the (single) tool-call handler. The host executes the tool and calls
     * {@link SendToolResult} with the outcome.
     */
    public OnToolCall(handler: (call: RealtimeClientToolCall) => void): void {
        this.toolCallHandler = handler;
    }

    /**
     * Registers the (single) state-change handler. States may be re-emitted (e.g. repeated
     * `'listening'` on successive barge-ins); hosts should treat emissions as idempotent.
     */
    public OnStateChange(handler: (state: RealtimeClientState) => void): void {
        this.stateChangeHandler = handler;
    }

    /**
     * Registers the (single) error handler. Receives both fatal transport errors (which are
     * also followed by an `'error'` state change) and non-fatal provider error frames.
     */
    public OnError(handler: (error: RealtimeClientError) => void): void {
        this.errorHandler = handler;
    }

    // ── Protected emit helpers for concrete drivers ───────────────────────────

    /** Emits a transcript event to the registered handler (if any). */
    protected emitTranscript(transcript: RealtimeClientTranscript): void {
        this.transcriptHandler?.(transcript);
    }

    /** Emits a tool-call request to the registered handler (if any). */
    protected emitToolCall(call: RealtimeClientToolCall): void {
        this.toolCallHandler?.(call);
    }

    /** Emits a state change to the registered handler (if any). */
    protected emitStateChange(state: RealtimeClientState): void {
        this.stateChangeHandler?.(state);
    }

    /** Emits an error to the registered handler (if any). */
    protected emitError(error: RealtimeClientError): void {
        this.errorHandler?.(error);
    }
}
