/**
 * The media plane of a Realtime Bridge — typed, directional, and **media-agnostic**.
 *
 * Nothing here is audio-specific. Audio is the first track lit up because the realtime models are
 * there today, but the transport seam carries typed media tracks (audio / video / screen, each
 * inbound *and* outbound). When realtime models gain full-duplex video the same bridges already
 * carry the video tracks with zero re-architecture.
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3 (provider abstraction) and the
 * directional media flags on `IBridgeProviderFeatures`.
 */

/**
 * The kind and direction of a single media track on a bridge.
 *
 * Direction is from the **agent's** point of view:
 * - `*-in` tracks flow FROM the external endpoint TO the agent (routed to `IRealtimeSession.SendInput`).
 * - `*-out` tracks flow FROM the agent TO the external endpoint (fed from `IRealtimeSession.OnOutput`).
 *
 * Each kind is gated by the matching directional flag in `IBridgeProviderFeatures`
 * (`AudioIn`/`AudioOut`, `VideoIn`/`VideoOut`, `ScreenIn`/`ScreenOut`).
 */
export type BridgeMediaTrackKind =
    | 'audio-in'
    | 'audio-out'
    | 'video-in'
    | 'video-out'
    | 'screen-in'
    | 'screen-out';

/**
 * The role a participant plays on the endpoint. A union (not an enum) so it exports cleanly and
 * stays additive. `Agent` is the bridge's own bot participant; the rest mirror conferencing roles.
 */
export type BridgeParticipantRole = 'Host' | 'CoHost' | 'Participant' | 'Agent';

/**
 * A single frame of media on a bridge track.
 *
 * Frames are intentionally minimal and serializable. The payload is carried EITHER as raw binary
 * (`Bytes`, the fast in-process path used by server-bridged drivers) OR as a base64 string
 * (`Base64`, for transports that can only move text) — a frame should populate exactly one. Keeping
 * the payload representation explicit avoids guessing and keeps the type free of `any`.
 */
export interface BridgeMediaFrame {
    /** Which track this frame belongs to (kind + direction). */
    Track: BridgeMediaTrackKind;

    /**
     * Raw frame payload as binary. Preferred for in-process server-bridged drivers — no
     * intermediate encoding. Mutually exclusive with {@link BridgeMediaFrame.Base64}; populate one.
     */
    Bytes?: ArrayBuffer;

    /**
     * Frame payload as a base64-encoded string. Used by transports that can only carry text.
     * Mutually exclusive with {@link BridgeMediaFrame.Bytes}; populate one.
     */
    Base64?: string;

    /**
     * Optional per-speaker label for diarized inbound media (requires the provider's
     * `SpeakerDiarization` feature). Lets turn-taking attribute speech to a named participant.
     * Typically the participant's `ExternalId` or display name.
     */
    SpeakerLabel?: string;

    /**
     * Optional epoch-millisecond capture timestamp for the frame, used for ordering, latency
     * accounting, and silence-window calculations in the turn-taking policy. When omitted the
     * consumer may stamp arrival time.
     */
    TimestampMs?: number;
}

/**
 * Identity and presence info for one participant on the bridged endpoint.
 *
 * The bridge produces these from the platform's roster (when the provider supports a roster /
 * diarization). They feed participant bookkeeping, the diarization → speaker-label mapping, and
 * the (future) Meeting Controls channel's facilitator intel.
 */
export interface BridgeParticipantInfo {
    /**
     * The platform-native participant identifier (Zoom participant id, call-leg SID, etc.).
     * Stable for the life of the participant's presence on the endpoint.
     */
    ExternalId: string;

    /** Human-readable display name as the platform reports it, when available. */
    DisplayName?: string;

    /** The participant's role on the endpoint. */
    Role: BridgeParticipantRole;

    /**
     * Whether this participant IS an agent bot (this bridge's own bot, or another agent that has
     * independently bridged into the same room). Lets multi-agent turn-taking exclude agents from
     * "human addressed me" detection and avoid self-echo loops.
     */
    IsAgent: boolean;
}
