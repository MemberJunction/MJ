/**
 * Text-input / audio-output transport.
 *
 * A non-WebRTC transport variant for "text-in / voice-out" demos:
 *   - **Inbound**: user turns arrive as `ControlEvent({ Kind: 'user-text' })`
 *     pushed via the public `PushUserText()` API — there is NO mic capture and
 *     `AudioFramesIn` is an immediately-closed iterable.
 *   - **Outbound**: agent audio frames (typically from TTS) accumulate on a
 *     queue exposed as `OutboundAudioFrames`, which an external consumer
 *     (e.g. an MJServer GraphQL subscription resolver) drains and streams to
 *     the client.
 *
 * This sidesteps WebRTC and STT entirely — the cheapest end-to-end voice path
 * a developer can run with only an ElevenLabs (or equivalent TTS) API key.
 *
 * See `plans/audio-agent-architecture.md` and the voice channels prototype.
 */
import type { AudioFrame } from '@memberjunction/ai';
import type { ITransportAdapter, ParticipantStream } from './ITransportAdapter';
import type { ControlEvent, VideoFrame } from '../frames/frame-bus';
import { AsyncQueue } from '../_internal/AsyncQueue';

export interface TextInputAudioOutputTransportOptions {
    /** Session identifier — used by callers for logging / subscription keying. */
    SessionID: string;
    /** Participant ID for the user side. Defaults to `'user'`. */
    UserParticipantID?: string;
    /** Participant ID for the agent side. Defaults to `'agent'`. */
    AgentParticipantID?: string;
    /** Optional display name for the user participant. */
    UserDisplayName?: string;
    /** Optional display name for the agent participant. */
    AgentDisplayName?: string;
}

/**
 * Iterable that yields nothing and immediately reports `done`. Used for the
 * absent inbound audio channel — there's no mic on this transport.
 */
class EmptyAsyncIterable<T> implements AsyncIterable<T> {
    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> {
                return this;
            },
            next(): Promise<IteratorResult<T>> {
                return Promise.resolve({ value: undefined as never, done: true });
            },
        };
    }
}

export class TextInputAudioOutputTransport implements ITransportAdapter {
    /** Connection options frozen at construction. */
    public readonly Options: Readonly<TextInputAudioOutputTransportOptions>;

    private readonly emptyAudioIn = new EmptyAsyncIterable<AudioFrame>();
    private readonly controlIn = new AsyncQueue<ControlEvent>();
    private readonly outboundAudio = new AsyncQueue<AudioFrame>();

    private readonly userParticipant: ParticipantStream;
    private readonly agentParticipant: ParticipantStream;
    private readonly participants: ReadonlyArray<ParticipantStream>;

    private joinHandlers: Array<(p: ParticipantStream) => void> = [];
    private leaveHandlers: Array<(p: ParticipantStream) => void> = [];

    private opened = false;
    private closed = false;

    constructor(options: TextInputAudioOutputTransportOptions) {
        this.Options = Object.freeze({ ...options });
        const userID = options.UserParticipantID ?? 'user';
        const agentID = options.AgentParticipantID ?? 'agent';
        this.userParticipant = Object.freeze({
            ID: userID,
            DisplayName: options.UserDisplayName ?? 'User',
        });
        this.agentParticipant = Object.freeze({
            ID: agentID,
            DisplayName: options.AgentDisplayName ?? 'Agent',
        });
        this.participants = Object.freeze([this.userParticipant, this.agentParticipant]);
    }

    // ── ITransportAdapter — inbound streams ───────────────────────────────────

    public get AudioFramesIn(): AsyncIterable<AudioFrame> {
        return this.emptyAudioIn;
    }

    public get ControlEventsIn(): AsyncIterable<ControlEvent> {
        return this.controlIn;
    }

    public get Participants(): ReadonlyArray<ParticipantStream> {
        return this.opened && !this.closed ? this.participants : [];
    }

    public OnParticipantJoin(cb: (p: ParticipantStream) => void): void {
        this.joinHandlers.push(cb);
    }

    public OnParticipantLeave(cb: (p: ParticipantStream) => void): void {
        this.leaveHandlers.push(cb);
    }

    // ── Public push API ───────────────────────────────────────────────────────

    /**
     * Push a user text turn into the inbound control-event stream. The text
     * surfaces to engines as `{ Kind: 'user-text', Text }`.
     *
     * IMPORTANT: we deliberately do NOT gate on `this.opened`. The resolver
     * registers the session and starts `session.Run()` fire-and-forget; the
     * client can submit text the moment the SessionID lands, which may be
     * BEFORE the background `Run()` reaches `Transport.Open()`. The
     * underlying `AsyncQueue` buffers items regardless of consumer
     * readiness, so the engine picks them up the instant it starts
     * iterating `ControlEventsIn`. Gating on `opened` silently dropped
     * the first turn — which is why "hello" produced no response.
     *
     * We DO short-circuit on `closed` — once the session ends, late pushes
     * are noise.
     */
    public PushUserText(text: string): void {
        if (this.closed) {
            return;
        }
        this.controlIn.Push({ Kind: 'user-text', Text: text });
    }

    /**
     * Async iterable that yields every frame written via `SendAudioFrame`.
     * External consumers (e.g. MJServer subscription resolvers) drain this
     * to stream agent TTS audio to the client.
     */
    public get OutboundAudioFrames(): AsyncIterable<AudioFrame> {
        return this.outboundAudio;
    }

    // ── ITransportAdapter — outbound ──────────────────────────────────────────

    public SendAudioFrame(frame: AudioFrame): void {
        if (!this.opened || this.closed) {
            return;
        }
        this.outboundAudio.Push(frame);
    }

    /** No video carried by this transport. */
    public SendVideoFrame(_frame: VideoFrame): void {
        // intentionally no-op
    }

    /** No return channel for control events — caller-side only. */
    public SendControlEvent(_event: ControlEvent): void {
        // intentionally no-op
    }

    // ── ITransportAdapter — lifecycle ─────────────────────────────────────────

    public async Open(): Promise<void> {
        if (this.opened) {
            return;
        }
        this.opened = true;
        this.controlIn.Push({ Kind: 'session-start' });
        this.controlIn.Push({ Kind: 'participant-joined', ParticipantID: this.userParticipant.ID });
        this.controlIn.Push({ Kind: 'participant-joined', ParticipantID: this.agentParticipant.ID });
        for (const h of this.joinHandlers) {
            h(this.userParticipant);
            h(this.agentParticipant);
        }
    }

    public async Close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.opened) {
            for (const h of this.leaveHandlers) {
                h(this.agentParticipant);
                h(this.userParticipant);
            }
            this.controlIn.Push({ Kind: 'participant-left', ParticipantID: this.agentParticipant.ID });
            this.controlIn.Push({ Kind: 'participant-left', ParticipantID: this.userParticipant.ID });
            this.controlIn.Push({ Kind: 'session-end', Reason: 'closed' });
        }
        this.controlIn.Close();
        this.outboundAudio.Close();
    }
}
