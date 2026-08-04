/**
 * The injectable **Zoom Meeting SDK seam** — the minimal set of operations {@link import('./zoom-bridge').ZoomBridge}
 * needs from Zoom, declared as an interface so the driver builds and unit-tests against an in-memory
 * fake with **no network and no real Zoom SDK**.
 *
 * ## Production binding (TODO at deployment)
 * In production this interface is bound to the **Zoom Meeting SDK** (a server/Linux bot build) plus
 * **raw data access** (Zoom's "Local Recording / Raw Data" entitlement) so the bot can pull per-
 * participant PCM audio for diarization and push synthesized audio back. The named operations map to
 * the SDK as follows:
 * - {@link join} / {@link leave} → the Meeting SDK `join()` / `leave()` lifecycle.
 * - {@link sendAudioFrame} → the raw-data audio-send (virtual mic) path.
 * - {@link onAudioFrame} → the raw-data per-participant audio-receive callback (the source of speaker
 *   labels for diarization).
 * - {@link onParticipantJoin} / {@link onParticipantLeave} / {@link getParticipants} → the SDK's
 *   participant-controller events + roster.
 * - {@link onHandRaise} → the SDK's "lower/raise hand" participant status callback.
 * - {@link postChatMessage} → the in-meeting chat controller.
 * - {@link muteParticipant} → the host meeting controller's mute action (requires the bot be host/co-host).
 * - {@link onMeetingEnded} → the meeting-status callback for `MEETING_STATUS_ENDED`.
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do
 * not change. **None of the SDK types leak into this package.**
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3, §8 and `/guides/REALTIME_BRIDGES_GUIDE.md`.
 */

/** The role a Zoom participant holds in the meeting, normalized to the bridge's participant roles. */
export type ZoomParticipantRole = 'Host' | 'CoHost' | 'Participant';

/**
 * One Zoom meeting participant as the seam reports it. Platform-native and minimal — the driver maps
 * this onto `BridgeParticipantInfo` / `BridgeMeetingParticipant`.
 */
export interface ZoomParticipant {
    /** The Zoom participant id (stable for the participant's presence in the meeting). */
    ParticipantId: string;
    /** The participant's display name as Zoom reports it. */
    DisplayName?: string;
    /** The participant's meeting role. */
    Role: ZoomParticipantRole;
    /** Whether this participant is the bridge's own bot (so the driver can exclude it from diarization addressing). */
    IsSelf?: boolean;
}

/** One frame of raw per-participant audio the seam surfaces for diarization + the agent's "hearing". */
export interface ZoomAudioFrame {
    /** Raw PCM audio bytes for this frame. */
    Pcm: ArrayBuffer;
    /** The Zoom participant id this audio came from (the diarization speaker label). */
    ParticipantId: string;
    /** The participant's display name at capture time, when known. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/** Arguments to {@link IZoomMeetingSdk.join} — what the bot needs to get into a meeting. */
export interface ZoomJoinArgs {
    /** The Zoom meeting number / id to join (parsed from the join URL or supplied directly). */
    MeetingNumber: string;
    /** The meeting passcode, when one is required. */
    Passcode?: string;
    /** The display name the bot appears as in the participant list. */
    BotDisplayName: string;
    /** The signed SDK JWT (or equivalent auth payload) authorizing the join. Resolved upstream; never inline secrets. */
    SdkSignature?: string;
    /** The ZAK token for joining as an authenticated user / starting on behalf of a host, when applicable. */
    ZakToken?: string;
}

/** The handles the seam returns after a successful {@link IZoomMeetingSdk.join}. */
export interface ZoomJoinResult {
    /** The bot's own participant id in the joined meeting. */
    BotParticipantId: string;
    /** The Zoom meeting id/number the bot joined (the durable external connection id). */
    MeetingId: string;
}

/**
 * The minimal Zoom Meeting SDK surface the {@link import('./zoom-bridge').ZoomBridge} depends on.
 * Production binds this to the real SDK; tests inject a `FakeZoomSdk`.
 */
export interface IZoomMeetingSdk {
    /**
     * Joins the meeting and brings the bot online. Returns the bot's participant id + the meeting id.
     *
     * @param args Join parameters (meeting number, passcode, bot name, auth).
     * @returns The bot participant + meeting handles.
     */
    join(args: ZoomJoinArgs): Promise<ZoomJoinResult>;

    /** Leaves the meeting and releases SDK resources. */
    leave(): Promise<void>;

    /**
     * Sends one raw PCM audio frame as the bot's outbound audio (the agent's voice into the meeting).
     *
     * @param pcm The PCM audio bytes to send.
     */
    sendAudioFrame(pcm: ArrayBuffer): void;

    /**
     * Registers a callback for inbound raw per-participant audio frames (what the agent hears, carrying
     * the speaker label for diarization). "Latest handler wins."
     *
     * @param cb Invoked with each inbound audio frame.
     */
    onAudioFrame(cb: (frame: ZoomAudioFrame) => void): void;

    /**
     * Registers a callback fired when a participant joins. "Latest handler wins."
     *
     * @param cb Invoked with the participant who joined.
     */
    onParticipantJoin(cb: (participant: ZoomParticipant) => void): void;

    /**
     * Registers a callback fired when a participant leaves. "Latest handler wins."
     *
     * @param cb Invoked with the participant id that left.
     */
    onParticipantLeave(cb: (participantId: string) => void): void;

    /**
     * Registers a callback for native hand-raise/lower signals. "Latest handler wins."
     *
     * @param cb Invoked with the participant id and whether the hand is now raised.
     */
    onHandRaise(cb: (participantId: string, raised: boolean) => void): void;

    /**
     * Returns the current participant roster (including the bot).
     *
     * @returns The current participants.
     */
    getParticipants(): Promise<ZoomParticipant[]>;

    /**
     * Posts a message to the in-meeting chat (everyone).
     *
     * @param text The chat message text.
     */
    postChatMessage(text: string): Promise<void>;

    /**
     * Mutes a participant (requires the bot to be host/co-host).
     *
     * @param participantId The participant to mute.
     */
    muteParticipant(participantId: string): Promise<void>;

    /**
     * Registers a callback fired when the meeting ends (host ended / timed out). "Latest handler wins."
     *
     * @param cb Invoked when the meeting has ended.
     */
    onMeetingEnded(cb: () => void): void;
}

/**
 * A factory that constructs an {@link IZoomMeetingSdk} for a session — the creation seam (mirroring
 * Gemini's `connectLiveSession`). Production supplies a factory that builds the real SDK adapter from
 * resolved config; tests supply one that returns a `FakeZoomSdk`.
 *
 * @param config The resolved provider/session configuration (region, credential refs already resolved upstream).
 * @returns The Zoom SDK instance to drive the meeting with.
 */
export type ZoomMeetingSdkFactory = (config?: Record<string, unknown>) => IZoomMeetingSdk;
