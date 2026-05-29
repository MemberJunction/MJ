/**
 * WebRTC transport — server-side LiveKit room participant. Bridges inbound audio
 * tracks (subscribed via `RoomEvent.TrackSubscribed`) → `AudioFramesIn$`, and
 * outbound `SendAudioFrame()` → a published `LocalAudioTrack`.
 *
 * Audio bridging uses `@livekit/rtc-node` (LiveKit Agents Node runtime).
 *
 * The pure-token-issuance path lives in `helpers/IssueLiveKitParticipantToken.ts`
 * — callers mint the participant JWT there and hand it to this transport via
 * `Token`. Keeping admin/signing concerns out of the transport itself means
 * it doesn't need API key/secret.
 *
 * See `plans/audio-agent-architecture.md` section 3.1.
 */
import {
    AudioFrame as LKAudioFrame,
    AudioSource,
    AudioStream,
    LocalAudioTrack,
    RemoteAudioTrack,
    RemoteTrack,
    RemoteParticipant,
    Room,
    RoomEvent,
    TrackKind,
    TrackPublishOptions,
    TrackSource,
} from '@livekit/rtc-node';
import type { AudioFrame } from '@memberjunction/ai';
import type { ITransportAdapter, ParticipantStream } from './ITransportAdapter';
import type { ControlEvent, VideoFrame } from '../frames/frame-bus';

/**
 * Construction options for `WebRTCTransport`.
 *
 * The transport is given a *pre-minted* participant token; admin/signing concerns
 * stay in `IssueLiveKitParticipantToken()`. This keeps the transport free of API
 * key/secret material and lets the same transport work against any LiveKit
 * deployment the caller has a token for.
 */
export interface WebRTCTransportOptions {
    /** LiveKit SFU URL — e.g. `wss://livekit.example.com`. */
    ServerURL: string;
    /** Pre-issued participant JWT (see `IssueLiveKitParticipantToken`). */
    Token: string;
    /** Room name — informational, used for logging only (the token grants the room). */
    RoomName: string;
    /** Stable identity for the server-side participant (often `agent:<agentId>`). */
    ParticipantIdentity: string;
    /** Sample rate for the published outbound track. Default 16000 (cascaded path). */
    SampleRateHz?: number;
    /** Channel count for the published outbound track. Default 1. */
    ChannelCount?: number;
}

/**
 * Unbounded single-producer / single-consumer async queue backing the inbound
 * iterables. Inline copy of the helper used by `WebSocketTransport` — kept
 * local to this file to keep the transport package's internal surface flat;
 * the two queues are independent and may diverge.
 */
class AsyncQueue<T> implements AsyncIterable<T> {
    private items: T[] = [];
    private waiters: Array<(value: IteratorResult<T>) => void> = [];
    private closed = false;

    public Push(item: T): void {
        if (this.closed) {
            return;
        }
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value: item, done: false });
        } else {
            this.items.push(item);
        }
    }

    public Close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) {
                w({ value: undefined as never, done: true });
            }
        }
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> {
                return this;
            },
            next(): Promise<IteratorResult<T>> {
                if (self.items.length > 0) {
                    const value = self.items.shift() as T;
                    return Promise.resolve({ value, done: false });
                }
                if (self.closed) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<T>>((resolve) => self.waiters.push(resolve));
            },
        };
    }
}

export class WebRTCTransport implements ITransportAdapter {
    /** Connection options frozen at construction. */
    public readonly Options: Readonly<Required<Omit<WebRTCTransportOptions, 'SampleRateHz' | 'ChannelCount'>> &
        Pick<WebRTCTransportOptions, 'SampleRateHz' | 'ChannelCount'>>;

    private room: Room | null = null;
    private outboundAudioSource: AudioSource | null = null;
    private outboundTrack: LocalAudioTrack | null = null;

    private readonly audioIn = new AsyncQueue<AudioFrame>();
    private readonly controlIn = new AsyncQueue<ControlEvent>();
    private readonly participants: ParticipantStream[] = [];
    private joinHandlers: Array<(p: ParticipantStream) => void> = [];
    private leaveHandlers: Array<(p: ParticipantStream) => void> = [];

    private opened = false;
    private closed = false;

    /** Sample rate used for the outbound publish path; resolved from options. */
    private readonly outboundSampleRate: number;
    /** Channel count used for the outbound publish path; resolved from options. */
    private readonly outboundChannelCount: number;

    constructor(options: WebRTCTransportOptions) {
        this.Options = Object.freeze({ ...options });
        this.outboundSampleRate = options.SampleRateHz ?? 16000;
        this.outboundChannelCount = options.ChannelCount ?? 1;
    }

    // ── ITransportAdapter — inbound streams ───────────────────────────────────

    public get AudioFramesIn(): AsyncIterable<AudioFrame> {
        return this.audioIn;
    }

    public get ControlEventsIn(): AsyncIterable<ControlEvent> {
        return this.controlIn;
    }

    public get Participants(): ReadonlyArray<ParticipantStream> {
        return this.participants;
    }

    public OnParticipantJoin(cb: (p: ParticipantStream) => void): void {
        this.joinHandlers.push(cb);
    }

    public OnParticipantLeave(cb: (p: ParticipantStream) => void): void {
        this.leaveHandlers.push(cb);
    }

    // ── ITransportAdapter — outbound ──────────────────────────────────────────

    public SendAudioFrame(frame: AudioFrame): void {
        if (!this.outboundAudioSource) {
            // Either Open() wasn't awaited or we're past Close(); drop silently
            // rather than throwing — outbound during teardown is benign.
            return;
        }
        const lkFrame = this.ToLiveKitAudioFrame(frame);
        // captureFrame is async — fire-and-forget; the SDK buffers internally
        // and we don't want SendAudioFrame to be async on the interface.
        // Surface unexpected errors to the console for visibility; a producer
        // pushing into a closed/dead source shouldn't kill the engine.
        void this.outboundAudioSource.captureFrame(lkFrame).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            // Use stderr without pulling a logger dep — matches WebSocketTransport's style.
            console.warn(`[WebRTCTransport] captureFrame failed: ${msg}`);
        });
    }

    /**
     * Video isn't supported in Phase 1 (audio-only cascaded path). Implemented
     * as a throw so misuse is loud rather than silent.
     */
    public SendVideoFrame(_frame: VideoFrame): void {
        throw new Error('WebRTCTransport: video send not supported in Phase 1 (audio-only).');
    }

    /**
     * Server-internal control events (session-start/-end, participant-joined/-left)
     * are surfaced on `ControlEventsIn` from LiveKit room events and do not need
     * to traverse the wire. Phase 1 has no outbound control event use case, so
     * this is a deliberate no-op. Future use (e.g. broadcasting `session-end`
     * to other participants) would publish via `room.localParticipant.publishData(...)`.
     */
    public SendControlEvent(_event: ControlEvent): void {
        // Intentional no-op for Phase 1; see method doc.
    }

    // ── ITransportAdapter — lifecycle ─────────────────────────────────────────

    public async Open(): Promise<void> {
        if (this.opened) {
            return;
        }
        const room = new Room();
        this.room = room;

        this.WireRoomEvents(room);

        await room.connect(this.Options.ServerURL, this.Options.Token);

        // Create + publish the outbound audio track AFTER connect — the
        // local participant only exists once we're connected.
        this.outboundAudioSource = new AudioSource(this.outboundSampleRate, this.outboundChannelCount);
        this.outboundTrack = LocalAudioTrack.createAudioTrack('mj-agent-audio', this.outboundAudioSource);

        const local = room.localParticipant;
        if (!local) {
            throw new Error('WebRTCTransport: localParticipant unavailable after connect()');
        }
        const publishOptions = new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE });
        await local.publishTrack(this.outboundTrack, publishOptions);

        this.opened = true;
        this.controlIn.Push({ Kind: 'session-start' });
    }

    public async Close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;

        // Unpublish + close the outbound source first — disconnecting the room
        // while a track is active can race the FFI cleanup.
        if (this.outboundTrack && this.room?.localParticipant) {
            const sid = this.outboundTrack.sid;
            if (sid) {
                try {
                    await this.room.localParticipant.unpublishTrack(sid, true);
                } catch {
                    // best-effort — proceed to source close
                }
            }
        }
        if (this.outboundAudioSource) {
            try {
                await this.outboundAudioSource.close();
            } catch {
                // best-effort
            }
        }

        if (this.room) {
            try {
                await this.room.disconnect();
            } catch {
                // best-effort
            }
        }

        if (this.opened) {
            this.controlIn.Push({ Kind: 'session-end', Reason: 'client-close' });
        }
        this.audioIn.Close();
        this.controlIn.Close();

        this.room = null;
        this.outboundAudioSource = null;
        this.outboundTrack = null;
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    /**
     * Wire LiveKit room event handlers. Called before `room.connect()` so we
     * don't miss the initial flurry of participant/track events.
     */
    private WireRoomEvents(room: Room): void {
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            if (track.kind !== TrackKind.KIND_AUDIO) {
                return;
            }
            // Cast is safe — `kind === KIND_AUDIO` implies `RemoteAudioTrack`.
            const audioTrack = track as RemoteAudioTrack;
            void this.PumpRemoteAudio(audioTrack, participant);
        });

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
            const p: ParticipantStream = {
                ID: participant.identity,
                DisplayName: participant.name || undefined,
            };
            this.participants.push(p);
            this.controlIn.Push({ Kind: 'participant-joined', ParticipantID: p.ID });
            for (const h of this.joinHandlers) {
                h(p);
            }
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
            const idx = this.participants.findIndex((p) => p.ID === participant.identity);
            const p = idx >= 0 ? this.participants[idx] : undefined;
            if (idx >= 0) {
                this.participants.splice(idx, 1);
            }
            const drop: ParticipantStream = p ?? {
                ID: participant.identity,
                DisplayName: participant.name || undefined,
            };
            this.controlIn.Push({ Kind: 'participant-left', ParticipantID: drop.ID });
            for (const h of this.leaveHandlers) {
                h(drop);
            }
        });

        room.on(RoomEvent.Disconnected, (reason) => {
            if (this.closed) {
                return;
            }
            // Surface as session-end; Close() will be called by the caller and
            // will be a no-op for the queues (already closed below).
            this.controlIn.Push({ Kind: 'session-end', Reason: `livekit-disconnect:${String(reason)}` });
        });
    }

    /**
     * Iterate the AudioStream tied to a remote audio track, converting each
     * LiveKit frame into our `AudioFrame` shape and pushing to the inbound
     * queue. Runs as a background task — `Open()` does not await it.
     */
    private async PumpRemoteAudio(track: RemoteAudioTrack, _participant: RemoteParticipant): Promise<void> {
        // Negotiate the inbound sample rate / channel count to match what the
        // engine expects to feed STT/VAD. Cascaded path is 16kHz mono.
        const stream = new AudioStream(track, {
            sampleRate: this.outboundSampleRate,
            numChannels: this.outboundChannelCount,
        });
        try {
            // AudioStream extends Web ReadableStream<AudioFrame>; Node 18+ supports
            // `for await...of` on ReadableStream. Cast is needed because the
            // declared type doesn't surface the AsyncIterable signature, but the
            // runtime does support it.
            const iterable = stream as unknown as AsyncIterable<LKAudioFrame>;
            for await (const lkFrame of iterable) {
                if (this.closed) {
                    break;
                }
                this.audioIn.Push(this.FromLiveKitAudioFrame(lkFrame));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[WebRTCTransport] inbound audio pump ended: ${msg}`);
        }
    }

    /**
     * Convert MJ `AudioFrame` (Uint8Array of int16 LE PCM) to LiveKit
     * `AudioFrame` (Int16Array). Re-uses the underlying buffer — no copy.
     */
    private ToLiveKitAudioFrame(frame: AudioFrame): LKAudioFrame {
        const byteLen = frame.data.byteLength;
        if (byteLen % 2 !== 0) {
            throw new Error(
                `WebRTCTransport: outbound PCM frame byteLength (${byteLen}) is not aligned to 16-bit samples`
            );
        }
        const samples = new Int16Array(frame.data.buffer, frame.data.byteOffset, byteLen / 2);
        const channels = frame.channelCount > 0 ? frame.channelCount : 1;
        const samplesPerChannel = samples.length / channels;
        return new LKAudioFrame(samples, frame.sampleRateHz, channels, samplesPerChannel);
    }

    /**
     * Convert LiveKit `AudioFrame` (Int16Array) to MJ `AudioFrame`
     * (Uint8Array). Re-uses the underlying buffer — no copy.
     */
    private FromLiveKitAudioFrame(lkFrame: LKAudioFrame): AudioFrame {
        const view = new Uint8Array(lkFrame.data.buffer, lkFrame.data.byteOffset, lkFrame.data.byteLength);
        return {
            data: view,
            sampleRateHz: lkFrame.sampleRate,
            channelCount: lkFrame.channels,
            mediaType: 'audio/pcm',
        };
    }
}
