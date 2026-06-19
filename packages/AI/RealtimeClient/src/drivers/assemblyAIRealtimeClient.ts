import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient, RealtimeClientState } from '../generic/baseRealtimeClient';
import { base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { createPcmMicCapture, IPcmMicCapture } from '../audio/micCapture';

// ── Audio constants (AssemblyAI Voice Agent wire format) ───────────────────────

/** The single Voice Agent websocket endpoint (auth rides as a `?token=` query parameter). */
export const ASSEMBLYAI_AGENT_WS_URL = 'wss://agents.assemblyai.com/v1/ws';

/**
 * The Voice Agent wire format is FIXED: 16-bit signed little-endian PCM, mono, 24 kHz,
 * base64-encoded, in BOTH directions (`input.audio` up, `reply.audio` down) — no
 * per-session format negotiation exists on this provider.
 */
export const ASSEMBLYAI_PCM_SAMPLE_RATE = 24000;

// ── Wire-event shapes (flat snake_case envelope, exactly as the socket emits) ──

/** A parsed inbound websocket frame. The Voice Agent protocol multiplexes on `type`. */
export interface AssemblyAIServerEvent {
    type?: string;
    /** `session.ready` — the provider-assigned session id. */
    session_id?: string;
    /** `transcript.user[.delta]` / `transcript.agent` — the transcribed text. */
    text?: string;
    /** `transcript.*` — provider conversation-item id. */
    item_id?: string;
    /** `reply.started` / `transcript.agent` — id of the reply the frame belongs to. */
    reply_id?: string;
    /** `transcript.agent` — true when the turn was cut off by a barge-in. */
    interrupted?: boolean;
    /** `reply.audio` — one base64 PCM16 chunk of the agent's spoken output. */
    data?: string;
    /** `reply.done` — `'interrupted'` when the user barged in mid-reply; absent otherwise. */
    status?: string;
    /** `tool.call` — correlation id the result must echo. */
    call_id?: string;
    /** `tool.call` — the tool name. */
    name?: string;
    /** `tool.call` — the arguments, ALREADY PARSED into an object by the provider. */
    arguments?: JSONObject;
    /** `session.error` — provider error code. */
    code?: string;
    /** `session.error` — human-readable error message. */
    message?: string;
    /** `session.error` — the offending parameter, when applicable. */
    param?: string;
    /** `session.updated` — echo of the applied session object. */
    session?: JSONObject;
    /** `session.ended` — total billable session seconds. */
    session_duration_seconds?: number;
}

// ── Structural transport seam (fakes in tests, native WebSocket in prod) ───────

/**
 * The minimal websocket surface this client depends on: assignable lifecycle handlers plus
 * `send`/`close`. Declaring the seam as an interface (rather than the platform `WebSocket`)
 * lets unit tests inject a fully in-memory fake that captures outbound frames and drives the
 * handlers with AssemblyAI-shaped events — no websocket, no network.
 */
export interface IAssemblyAIClientSocket {
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
 * {@link AssemblyAIRealtimeClient.createSocket} seam (typed structurally so the package
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
 * AssemblyAI Voice Agent implementation of {@link BaseRealtimeClient}: a **browser-direct**
 * agent websocket authenticated with the server-minted ONE-TIME client token (the
 * `EphemeralToken` — no API key ever reaches the browser).
 *
 * Registered with the ClassFactory under the key `'assemblyai'` — the `Provider` string the
 * server's `AssemblyAIRealtime` driver stamps on its `ClientRealtimeSessionConfig`.
 *
 * Owns ALL AssemblyAI wire concerns (the behavioral sibling of the ElevenLabs client driver —
 * the audio plane is client-owned over a websocket, no WebRTC):
 * - **Connect handshake**: open `wss://…/v1/ws?token=…` → send the server-authored
 *   `session.update` (from the `SessionConfig` pact: system prompt, tools, voice, turn
 *   detection) as the FIRST frame → wait for `session.ready` → build the audio plane at the
 *   provider's FIXED 24 kHz PCM16 format → `'listening'`. The state is gated on
 *   `session.ready` (driver obligation #7): only then has the provider confirmed the session
 *   config is applied (audio sent earlier would be dropped anyway).
 * - **Audio in**: mic PCM16 at 24 kHz via the shared {@link createPcmMicCapture} worklet
 *   pipeline, streamed as base64 `input.audio` frames.
 * - **Audio out**: `reply.audio` chunks decoded into the shared {@link RealtimePcmPlayback}
 *   at 24 kHz; {@link IsAudioPlaying} comes from its playout clock.
 * - **Transcripts**: user turns stream as `transcript.user.delta` fragments
 *   (`IsFinal: false` deltas) finalized by `transcript.user`; agent turns arrive as ONE
 *   final `transcript.agent` (after a barge-in it carries `interrupted: true` and the text
 *   already reflects the truncated turn — no ElevenLabs-style correction event follows).
 * - **Busy mapping**: `IsBusy` is set on `reply.started` / first `reply.audio` (and eagerly
 *   when this client triggers a reply) and cleared on `reply.done` and on a `tool.call`
 *   frame (the agent has yielded the floor pending the result — deadlock guard,
 *   obligation #2).
 * - **Narration is NATIVE**: {@link RequestSpokenUpdate} sends `reply.create` with the
 *   instructions (a real per-response-instructions channel — no user-turn emulation). The
 *   response kind is stamped `'narration'` at send time (sends are the turn triggers) and
 *   reset on the reply boundary; the kind tagging assumes `transcript.agent` precedes its
 *   `reply.done`, which is the provider's emission order.
 * - **{@link SendText} is EMULATED via `reply.create`**: the protocol accepts no typed user
 *   input, so the typed text rides as response instructions framing it as the user's turn.
 *   Fidelity caveat: the text enters as instructions rather than a conversation user turn,
 *   so the agent may occasionally reference "the message you sent" — hosts should treat
 *   typed input on this provider as best-effort.
 * - **{@link SendContextNote} is EMULATED via the mutable `system_prompt`**: notes are
 *   appended under a "Background updates" heading and the full prompt is re-sent via
 *   `session.update` — a config write that never triggers or disturbs generation, so it is
 *   sent immediately even mid-reply.
 * - **Barge-in**: `input.speech.started` while a reply is active (or audio audibly playing)
 *   is the snappy flush point (per the provider's own guidance — ~300 ms faster than waiting
 *   for `reply.done`); `reply.done` with `status: 'interrupted'` is the authoritative
 *   verdict and is the fallback flush when the speech-start gate missed. A speech start
 *   while idle is a user simply taking their turn — NOT an interruption (base contract).
 * - **Cancel**: the protocol has no cancel frame. {@link CancelActiveResponse} flushes the
 *   locally-owned playout queue (speech stops immediately), marks the reply inactive, and
 *   SUPPRESSES residual `reply.audio` frames of the cancelled reply until the next reply
 *   boundary — so late-arriving chunks of a cancelled turn are never played or allowed to
 *   re-assert `'speaking'`.
 * - **No usage telemetry**: the streaming socket exposes no token-usage events, so this
 *   driver NEVER emits {@link OnUsage} (registering a handler is safe; it just never fires).
 */
@RegisterClass(BaseRealtimeClient, 'assemblyai')
export class AssemblyAIRealtimeClient extends BaseRealtimeClient {
    // ── Transport / audio resources ────────────────────────────────────────────
    private socket: IAssemblyAIClientSocket | null = null;
    private micStream: MediaStream | null = null;
    private micCapture: IPcmMicCapture | null = null;
    private playback: IRealtimePcmPlayback | null = null;

    // ── Response state machine ─────────────────────────────────────────────────
    /** True while an agent reply is in flight; gates (queues) client-triggered sends. */
    private responseActive = false;
    /** The kind of the reply currently in flight; stamped at send time, reset on boundary. */
    private activeResponseKind: 'normal' | 'narration' = 'normal';
    /** Sends deferred while a reply is in flight; drained in order at the next boundary. */
    private queuedSends: Array<() => void> = [];
    /**
     * True between a {@link CancelActiveResponse} and the next reply boundary: residual
     * `reply.audio` chunks of the cancelled reply are dropped instead of played.
     */
    private suppressReplyAudio = false;
    /**
     * Tool calls awaiting their result — used to make {@link SendToolResult} EXACTLY-ONCE:
     * the id is consumed when the result is accepted (queued or sent), so a duplicate send
     * for the same call is dropped with a warning instead of confusing the conversation.
     */
    private pendingToolCallIds = new Set<string>();
    /** True once Disconnect ran — an expected socket close must not surface as fatal. */
    private closedByConsumer = false;

    // ── session.resume reconnect window ─────────────────────────────────────────
    /** Provider-assigned session id (from `session.ready`) — the `session.resume` key. */
    private providerSessionId: string | null = null;
    /** The token-authenticated endpoint URL, kept for the resume reattach socket. */
    private connectUrl: string | null = null;
    /** One resume attempt per session: a second unexpected drop is fatal (as before). */
    private resumeAttempted = false;
    /**
     * The client's own view of the session state — mirrors what was last emitted, EXCEPT after
     * a tool call: the host typically shows its own busy indicator then, so the client silently
     * leaves `'speaking'` (no emission) until the result reply's first output re-asserts it.
     */
    private currentState: RealtimeClientState = 'closed';

    // ── Context-note prompt tracking ───────────────────────────────────────────
    /** The server-authored base system prompt (from the SessionConfig pact). */
    private basePrompt = '';
    /** Accumulated {@link SendContextNote} texts, re-sent with the full prompt each time. */
    private contextNotes: string[] = [];

    // ── BaseRealtimeClient: connection lifecycle ───────────────────────────────

    /**
     * Opens the client-direct session: socket to the token-authenticated endpoint, the
     * server-authored `session.update` as the first frame, then — once `session.ready`
     * confirms the config is applied — the audio plane at the provider's fixed 24 kHz
     * format. Reports `'listening'` only after all of that (obligation #7).
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.micStream = micStream;
        this.closedByConsumer = false;
        this.setState('connecting');
        const sessionObject = this.parseSessionObject(config);
        this.basePrompt = typeof sessionObject['system_prompt'] === 'string' ? sessionObject['system_prompt'] : '';
        this.contextNotes = [];

        let openSocket: (() => void) | null = null;
        let failOpen: ((error: Error) => void) | null = null;
        let confirmReady: (() => void) | null = null;
        let failReady: ((error: Error) => void) | null = null;
        const opened = new Promise<void>((resolve, reject) => {
            openSocket = resolve;
            failOpen = reject;
        });
        const ready = new Promise<void>((resolve, reject) => {
            confirmReady = resolve;
            failReady = reject;
        });
        // When the socket dies BEFORE open, Connect throws at `await opened` and never awaits
        // `ready` — pre-consume its rejection so it can't surface as an unhandled rejection.
        ready.catch(() => undefined);
        this.onSessionReady = confirmReady;
        const failConnect = (error: Error) => {
            failOpen?.(error);
            failReady?.(error);
        };

        this.connectUrl = `${ASSEMBLYAI_AGENT_WS_URL}?token=${encodeURIComponent(config.EphemeralToken)}`;
        this.providerSessionId = null;
        this.resumeAttempted = false;
        const socket = this.createSocket(this.connectUrl);
        this.socket = socket;
        socket.onopen = () => openSocket?.();
        socket.onmessage = (data) => this.handleSocketMessage(data);
        socket.onerror = (message) => {
            failConnect(new Error(message));
            this.handleSocketError(message);
        };
        socket.onclose = () => {
            failConnect(new Error('AssemblyAI agent socket closed during connect'));
            this.handleSocketClose();
        };

        await opened;
        this.setState('connected');
        // The server-authored session config (the SessionConfig pact) is applied via the
        // FIRST frame — prompt and tool authority stay server-side (obligation #8).
        this.sendFrame({ type: 'session.update', session: sessionObject });

        await ready;
        this.playback = this.createPlayback(ASSEMBLYAI_PCM_SAMPLE_RATE);
        this.micCapture = await this.createMicCapture(micStream, ASSEMBLYAI_PCM_SAMPLE_RATE, (base64Pcm16) =>
            this.sendMicChunk(base64Pcm16)
        );
        // Audio-activity capability (base obligation #9): agent side taps the playout
        // engine's master gain; user side meters the mic stream. Null-safe — test fakes /
        // no-WebAudio environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
        this.setState('listening');
    }

    /**
     * Tears down the socket, mic capture, mic tracks, and playout engine, resets the response
     * state machine, and emits a final `'closed'` (unless already `'error'`). Sends
     * `session.end` first — without it the provider holds the session (billable) for a
     * 30-second resume window. Safe to call more than once.
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
                this.socket.send(JSON.stringify({ type: 'session.end' }));
            } catch {
                /* socket already dead — closing anyway */
            }
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
     * Injects typed text — EMULATED via `reply.create` (the protocol accepts no typed user
     * input), with instructions framing the text as the user's turn. No-op when the session
     * is not open. See the class-level fidelity caveat.
     *
     * **SendText implies barge-in** (base-contract rule): an active spoken reply is cancelled
     * via {@link CancelActiveResponse} first — playback flushed, reply marked inactive,
     * queued sends drained — so the typed turn takes the floor immediately. If a drained
     * queued send starts a new reply, the text queues behind it, preserving delivery order.
     */
    public SendText(text: string): void {
        if (!this.socket) {
            return;
        }
        this.CancelActiveResponse();
        const instructions =
            `The user just sent this typed message. Treat it as their conversational turn and respond to it directly: ${text}`;
        this.enqueueOrRun(() => this.sendReplyCreate(instructions, 'normal', true));
    }

    /**
     * @inheritdoc
     *
     * AssemblyAI has no cancel frame — the client OWNS the audio plane, so cancelling means:
     * flush the local playout queue (speech stops immediately), mark the in-flight reply
     * inactive, SUPPRESS residual `reply.audio` chunks of the cancelled reply until the next
     * reply boundary, and drain queued sends (a queued narration takes the floor next —
     * delivery is never dropped by a cancel). No-op when nothing is active.
     */
    public CancelActiveResponse(): void {
        if (!this.socket) {
            return;
        }
        if (!this.responseActive && !this.IsAudioPlaying) {
            return; // nothing active — no-op by contract
        }
        this.playback?.Flush();
        if (this.responseActive) {
            this.suppressReplyAudio = true; // drop the cancelled reply's late chunks
        }
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.flushQueuedSends();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Injects background context — EMULATED via the mutable `system_prompt`: the note is
     * appended under a "Background updates" heading and the FULL prompt is re-sent via
     * `session.update`. A config write never triggers or disturbs generation, so it is sent
     * immediately even while a reply is in flight (no queueing applies).
     */
    public SendContextNote(text: string): void {
        if (!this.socket) {
            return;
        }
        this.contextNotes.push(text);
        this.sendFrame({ type: 'session.update', session: { system_prompt: this.composePromptWithNotes() } });
    }

    /**
     * Triggers ONE short spoken update — NATIVE via `reply.create` with per-response
     * instructions. The resulting reply is stamped `Kind: 'narration'` at send time (reset
     * on the reply boundary). Queued behind any in-flight reply per the base contract's
     * collision rule (an overlapping `reply.create` would collide with active generation).
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (!this.socket) {
            return;
        }
        this.enqueueOrRun(() => this.sendReplyCreate(instructions, 'narration', false));
    }

    /**
     * Feeds an executed tool's result back via `tool.result`, correlated by the provider's
     * `call_id`. EXACTLY-ONCE: the pending id is consumed when the result is accepted, and a
     * duplicate (or unknown) callID is dropped with a warning. Sent immediately when idle —
     * the provider speaks the result as the turn's continuation (no explicit generation
     * trigger exists or is needed) — otherwise queued behind the in-flight reply (e.g. a
     * progress narration) so the trigger is never lost and the narration's kind tagging is
     * not clobbered. The wire `result` slot expects a JSON-STRING, which is exactly the
     * contract's `outputJson` shape — it passes through verbatim.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (!this.socket) {
            return;
        }
        if (!this.pendingToolCallIds.has(callID)) {
            console.warn(
                `AssemblyAIRealtimeClient.SendToolResult: no pending tool call '${callID}' — duplicate or unknown result dropped.`
            );
            return;
        }
        this.pendingToolCallIds.delete(callID);
        this.enqueueOrRun(() => this.sendToolResultFrame(callID, outputJson));
    }

    /**
     * Mutes / unmutes by toggling the mic tracks' `enabled` flag: the capture pipeline stays
     * up and streams SILENCE while muted (the provider's VAD sees a continuous stream and the
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
     * Computed directly from the playout engine's playhead clock — this client OWNS the
     * output buffer, so "audibly playing" is precisely "scheduled audio extends beyond the
     * audio context's current time".
     */
    public get IsAudioPlaying(): boolean {
        return this.playback?.IsPlaying ?? false;
    }

    // ── Overridable creation seams (tests inject fakes — no network / audio) ──

    /**
     * Creation seam for the agent websocket. Production wraps the platform-global
     * `WebSocket` opened against the token-authenticated URL; unit tests override this to
     * return an in-memory fake. Handlers are attached by {@link Connect} AFTER this returns,
     * so the implementation must not require them at construction time.
     */
    protected createSocket(url: string): IAssemblyAIClientSocket {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('AssemblyAIRealtimeClient requires a global WebSocket (browser or Node 22+).');
        }
        const ws = new WS(url);
        const seam: IAssemblyAIClientSocket = {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send: (data) => ws.send(data),
            close: () => ws.close(),
        };
        ws.onopen = () => seam.onopen?.();
        ws.onmessage = (event) => seam.onmessage?.(String(event.data));
        ws.onerror = () => seam.onerror?.('AssemblyAI agent websocket error');
        ws.onclose = () => seam.onclose?.();
        return seam;
    }

    /**
     * Creation seam for the mic-capture pipeline at the provider's fixed 24 kHz rate.
     * Production delegates to the shared {@link createPcmMicCapture}; unit tests override
     * this with a no-op fake (and may capture `onPcmChunk` to simulate mic frames).
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

    /** Resolver for the in-flight Connect's session.ready wait (null outside Connect). */
    private onSessionReady: (() => void) | null = null;

    /**
     * Extracts the wire-shaped `session` object from the server-minted `SessionConfig` pact
     * (`{ session, config }` — authored by the server's `AssemblyAIRealtime`). Falls back to
     * an empty object when absent (the session then runs on provider defaults).
     */
    private parseSessionObject(config: ClientRealtimeSessionConfig): JSONObject {
        const sessionConfig: JSONObject = config.SessionConfig ?? {};
        const raw = sessionConfig['session'];
        return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JSONObject) : {};
    }

    /** Streams one base64 PCM16 mic chunk as an `input.audio` frame. */
    private sendMicChunk(base64Pcm16: string): void {
        if (this.socket) {
            this.sendFrame({ type: 'input.audio', audio: base64Pcm16 });
        }
    }

    /** Surfaces a fatal socket error and marks the session unusable (obligation #6). */
    private handleSocketError(message: string): void {
        if (this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: `AssemblyAI realtime transport error: ${message}`, Fatal: true });
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
        // The provider holds the session for a 30-second resume window — try ONE reattach
        // before declaring the session dead (the plan's "provider session.resume" item).
        if (this.tryResumeSession()) {
            return; // the resume path owns the state machine from here
        }
        this.emitError({ Message: 'AssemblyAI agent session closed unexpectedly', Fatal: true });
        this.setState('error');
    }

    /**
     * ONE-shot reattach inside the provider's 30-second resume window: a fresh socket to
     * the same token-authenticated endpoint whose FIRST frame is `session.resume` with the
     * `session_id` captured from `session.ready`. The provider re-confirms with another
     * `session.ready`, which restores `'listening'` — the mic worklet and playout engine
     * survive untouched (mic chunks simply flow into the new socket). A failed or second
     * drop falls through to the pre-existing fatal path, so the worst case is exactly the
     * old behavior. Returns `true` when a reattach was started.
     */
    private tryResumeSession(): boolean {
        if (this.resumeAttempted || !this.providerSessionId || !this.connectUrl) {
            return false;
        }
        this.resumeAttempted = true;
        const sessionId = this.providerSessionId;
        this.setState('connecting'); // hosts surface this as "reconnecting…"
        try {
            const socket = this.createSocket(this.connectUrl);
            this.socket = socket;
            socket.onopen = () => this.sendFrame({ type: 'session.resume', session_id: sessionId });
            socket.onmessage = (data) => this.handleSocketMessage(data);
            socket.onerror = (message) => this.handleSocketError(message);
            socket.onclose = () => this.handleSocketClose(); // resumeAttempted → fatal path
            // The resume handshake's `session.ready` restores the live state.
            this.onSessionReady = () => this.setState('listening');
            return true;
        } catch {
            return false; // socket construction failed — fall through to the fatal path
        }
    }

    // ── Inbound message translation ────────────────────────────────────────────

    /** Parses one raw socket payload; non-JSON frames are ignored. */
    private handleSocketMessage(data: string): void {
        let event: AssemblyAIServerEvent;
        try {
            event = JSON.parse(data) as AssemblyAIServerEvent;
        } catch {
            return;
        }
        this.handleServerEvent(event);
    }

    /** Multiplexes one inbound frame to the focused per-concern handlers. */
    private handleServerEvent(event: AssemblyAIServerEvent): void {
        switch (event.type) {
            case 'session.ready':
                // The provider-assigned id is the `session.resume` key (30s reattach window).
                this.providerSessionId = event.session_id ?? this.providerSessionId;
                this.onSessionReady?.();
                this.onSessionReady = null;
                break;
            case 'session.updated':
                break; // config-apply confirmation — nothing to surface
            case 'reply.started':
                this.handleReplyStarted();
                break;
            case 'reply.audio':
                this.handleReplyAudio(event.data);
                break;
            case 'transcript.user.delta':
                this.handleUserTranscript(event.text, false);
                break;
            case 'transcript.user':
                this.handleUserTranscript(event.text, true);
                break;
            case 'transcript.agent':
                this.handleAgentTranscript(event.text);
                break;
            case 'reply.done':
                this.handleReplyDone(event.status);
                break;
            case 'tool.call':
                this.handleToolCall(event);
                break;
            case 'input.speech.started':
                this.handleSpeechStarted();
                break;
            case 'input.speech.stopped':
                break; // VAD telemetry — nothing to surface
            case 'session.error':
                this.emitError({
                    Message: event.message ?? 'AssemblyAI session error',
                    Code: event.code,
                    Fatal: false,
                });
                break;
            case 'session.ended':
                this.handleSessionEnded();
                break;
            default:
                break; // unknown / future frame types are ignored
        }
    }

    /** A fresh reply is generating: lift any cancel suppression and mark the agent busy. */
    private handleReplyStarted(): void {
        this.suppressReplyAudio = false; // a NEW reply — its audio is real
        this.markGenerationStarted();
    }

    /**
     * Decodes one base64 reply-audio chunk into the playout queue and marks generation live —
     * unless a local cancel suppressed the remainder of this reply, in which case the chunk
     * is dropped (never played, never re-asserts `'speaking'`).
     */
    private handleReplyAudio(audioBase64: string | undefined): void {
        if (!audioBase64 || this.suppressReplyAudio) {
            return;
        }
        this.markGenerationStarted();
        this.playback?.Enqueue(base64ToArrayBuffer(audioBase64));
    }

    /** User transcript: streaming deltas (`IsFinal: false`) finalized by `transcript.user`. */
    private handleUserTranscript(text: string | undefined, isFinal: boolean): void {
        if (text && text.trim().length > 0) {
            this.emitTranscript({ Role: 'User', Text: text, IsFinal: isFinal, Kind: 'normal' });
        }
    }

    /**
     * Agent transcript: the turn's complete text, emitted FINAL with the ACTIVE reply kind
     * so narration turns are tagged correctly (stamp-at-send — see the class doc). After a
     * barge-in the provider sends the truncated text with `interrupted: true` — already the
     * authoritative record of what was spoken, emitted the same way.
     */
    private handleAgentTranscript(text: string | undefined): void {
        if (text && text.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: text, IsFinal: true, Kind: this.activeResponseKind });
        }
    }

    /**
     * Reply boundary. `status: 'interrupted'` is the provider's authoritative true-barge-in
     * verdict — when the snappy `input.speech.started` gate already handled it this is a
     * no-op fallback; when it didn't (e.g. the speech-start frame was missed), the flush +
     * interruption surface here. Then: release the busy lock, lift any cancel suppression,
     * reset the reply kind, drain queued sends (stopping at the first one that starts a new
     * reply), and return the floor.
     */
    private handleReplyDone(status: string | undefined): void {
        if (status === 'interrupted' && (this.responseActive || this.IsAudioPlaying)) {
            this.playback?.Flush();
            this.emitInterruption();
        }
        this.responseActive = false;
        this.suppressReplyAudio = false;
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
     * narration must not trigger a reply between the tool call and its result. The provider
     * emits `arguments` ALREADY PARSED, so it is re-stringified to honor the base contract's
     * JSON-string `ArgumentsJson` shape.
     */
    private handleToolCall(event: AssemblyAIServerEvent): void {
        if (this.currentState === 'speaking') {
            this.currentState = 'connected';
        }
        this.responseActive = false;
        const callID = event.call_id ?? '';
        this.pendingToolCallIds.add(callID);
        this.emitToolCall({ CallID: callID, ToolName: event.name ?? '', ArgumentsJson: JSON.stringify(event.arguments ?? {}) });
    }

    /**
     * The user started speaking. When a reply is in flight or audio is audibly playing this
     * is a TRUE barge-in: flush playout NOW (the provider's own guidance — ~300 ms snappier
     * than waiting for `reply.done`), suppress the cancelled reply's residual audio, surface
     * the interruption, and give the floor back. While idle it is a user simply taking their
     * turn — NOT an interruption (base contract), so nothing is emitted. The queue is NOT
     * drained — the user has the floor; queued sends flush at the next reply boundary.
     */
    private handleSpeechStarted(): void {
        if (!this.responseActive && !this.IsAudioPlaying) {
            return;
        }
        this.playback?.Flush();
        if (this.responseActive) {
            this.suppressReplyAudio = true; // drop the interrupted reply's late chunks
        }
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.emitInterruption();
        this.setState('listening');
    }

    /**
     * The provider ended the session itself. After a consumer {@link Disconnect} (which
     * sends `session.end`) this is the expected acknowledgment and stays silent; otherwise
     * it is surfaced as FATAL so the host tears down instead of idling on a dying socket.
     */
    private handleSessionEnded(): void {
        if (this.closedByConsumer || this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        this.emitError({ Message: 'AssemblyAI agent session ended by the provider', Fatal: true });
        this.setState('error');
    }

    /**
     * First model output of a reply (reply.started or an audio chunk): the agent is busy and
     * the client is audibly / imminently `'speaking'`.
     */
    private markGenerationStarted(): void {
        this.responseActive = true;
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
    }

    // ── Collision-safe send machinery ──────────────────────────────────────────

    /**
     * Runs a send immediately when no reply is in flight; otherwise queues it for the next
     * boundary (`reply.done`). An overlapping `reply.create` would collide with active
     * generation, so deferral is the safe default — mirroring the other drivers' rule.
     */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            return;
        }
        send();
    }

    /**
     * Drains queued sends in order at a reply boundary, stopping as soon as one starts a
     * new reply (sets {@link responseActive}) — the rest wait for that reply to finish.
     */
    private flushQueuedSends(): void {
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /**
     * Sends a `reply.create` that triggers a reply, stamping the upcoming reply's kind at
     * send time and eagerly marking the agent busy. `emitSpeaking` mirrors the other
     * drivers: typed text reflects `'speaking'` immediately; narration waits for the first
     * model output.
     */
    private sendReplyCreate(instructions: string, kind: 'normal' | 'narration', emitSpeaking: boolean): void {
        if (!this.socket) {
            return;
        }
        this.sendFrame({ type: 'reply.create', instructions });
        this.responseActive = true;
        this.activeResponseKind = kind;
        if (emitSpeaking) {
            this.setState('speaking');
        }
    }

    /**
     * Sends the `tool.result` frame (the provider speaks the result as the turn's
     * continuation — no explicit generation trigger exists or is needed) and eagerly marks
     * the agent busy so a queued narration can't slip in before the spoken result.
     */
    private sendToolResultFrame(callID: string, outputJson: string): void {
        if (!this.socket) {
            return;
        }
        this.sendFrame({ type: 'tool.result', call_id: callID, result: outputJson });
        this.responseActive = true;
        this.activeResponseKind = 'normal';
        this.setState('speaking');
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** The base prompt plus every accumulated context note under a "Background updates" heading. */
    private composePromptWithNotes(): string {
        if (this.contextNotes.length === 0) {
            return this.basePrompt;
        }
        return `${this.basePrompt}\n\n## Background updates\n${this.contextNotes.map((n) => `- ${n}`).join('\n')}`;
    }

    /** JSON-serializes and sends one client frame (no-op once the socket is gone). */
    private sendFrame(frame: JSONObject): void {
        this.socket?.send(JSON.stringify(frame));
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    private resetResponseState(): void {
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.queuedSends = [];
        this.suppressReplyAudio = false;
        this.pendingToolCallIds.clear();
        this.onSessionReady = null;
        this.contextNotes = [];
    }

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link AssemblyAIRealtimeClient} is
 * instantiated dynamically through the ClassFactory, so a consumer must call this no-op
 * to create a static code path that keeps the `@RegisterClass` side effect alive.
 */
export function LoadAssemblyAIRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
