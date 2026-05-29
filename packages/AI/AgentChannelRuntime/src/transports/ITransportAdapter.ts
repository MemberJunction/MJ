/**
 * Transport adapter contract — abstracts WebRTC / WebSocket / Twilio / LiveKit SIP
 * behind a single interface so engines don't care how bytes arrive or leave.
 *
 * Concrete adapters (`WebRTCTransport`, `TwilioConvRelayTransport`, etc.) land in
 * Phase 1(c)+. This file is interface-only.
 *
 * NOTE: Transports are constructed and passed into `ChannelSession` by the caller
 * (e.g. MJServer); they are NOT resolved via `ClassFactory` / `@RegisterClass`.
 * There is no `AIAgentChannelTransport` metadata table — the choice of transport
 * is a caller concern (which wire are we on?), not an agent-config concern.
 *
 * See `plans/audio-agent-architecture.md` section 3.1 / 4 ("multi-participant is
 * purely a transport concern").
 */
import type { AudioFrame } from '@memberjunction/ai';
import type { VideoFrame, ControlEvent } from '../frames/frame-bus';

/**
 * A single remote participant on the transport. Single-participant transports
 * expose `[oneStream]`; multi-participant SFUs (LiveKit rooms, conferences)
 * expose one per peer.
 */
export interface ParticipantStream {
    ID: string;
    DisplayName?: string;
    /** Per-participant audio when the transport splits streams by speaker. */
    AudioIn?: AsyncIterable<AudioFrame>;
    /** Per-participant video when the transport delivers video. */
    VideoIn?: AsyncIterable<VideoFrame>;
}

export interface ITransportAdapter {
    /** All inbound audio frames, merged across participants when applicable. */
    AudioFramesIn: AsyncIterable<AudioFrame>;
    /** Inbound video, if the transport carries it. */
    VideoFramesIn?: AsyncIterable<VideoFrame>;
    /** Connection lifecycle and participant events. */
    ControlEventsIn: AsyncIterable<ControlEvent>;

    /** Send a single audio frame outbound. */
    SendAudioFrame(frame: AudioFrame): void;
    /** Send a single video frame outbound; optional. */
    SendVideoFrame?(frame: VideoFrame): void;
    /** Send a control event (e.g. session-end). */
    SendControlEvent(event: ControlEvent): void;

    /** Connect / negotiate; must complete before frames flow. */
    Open(): Promise<void>;
    /** Tear down; idempotent. */
    Close(): Promise<void>;

    /** Current participants — single element for the common case. */
    Participants: ReadonlyArray<ParticipantStream>;
    /** Subscribe to participant joins. */
    OnParticipantJoin(cb: (p: ParticipantStream) => void): void;
    /** Subscribe to participant leaves. */
    OnParticipantLeave(cb: (p: ParticipantStream) => void): void;
}
