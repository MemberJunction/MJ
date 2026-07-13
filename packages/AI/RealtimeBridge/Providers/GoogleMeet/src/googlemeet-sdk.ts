/**
 * The injectable **Google Meet Media API seam** — the minimal set of operations
 * {@link import('./googlemeet-bridge').GoogleMeetBridge} needs from Google Meet, declared as an
 * interface so the driver builds and unit-tests against an in-memory fake with **no network and no
 * real Google Meet client**.
 *
 * ## ⚠️ Early-access / allowlist caveat (read first)
 * Unlike Zoom's broadly-available Meeting SDK, the **Google Meet Media API** is **early-access and
 * allowlisted** — a Google Workspace tenant must be explicitly granted access before a participating
 * client (the agent bot) can pull/push real-time media. Until that allowlist binding lands at
 * deployment, this seam has no production implementation and the driver throws an explicit
 * "bind the real Google Meet Media API" error (see {@link GoogleMeetBridge.SetSdkFactory}).
 *
 * ## Meet capability shape vs. Zoom (what this seam deliberately OMITS)
 * The Meet Media API surface is narrower than Zoom's Meeting SDK + raw-data entitlement. Two surfaces
 * Zoom exposes are intentionally **absent** here because Meet does not offer them through this API:
 * - **Hand-raise** ➖ — the Meet Media API surfaces **no** participant hand-raise/lower signal, so there
 *   is no `onHandRaise` operation. The Meeting Controls channel still exposes a hand-raise *handler*
 *   (the channel contract requires it), but for Meet it is a registered-but-never-fired no-op — there
 *   is no platform signal to drive it. See {@link import('./googlemeet-meeting-controls').GoogleMeetMeetingControlsEventSource}.
 * - **In-meeting chat** ⚠️ — the Media API is media/roster-focused and does not expose a reliable
 *   programmatic chat-post path, so there is no `postChatMessage` operation. (The Hybrid turn-taking
 *   "raise hand via chat" mode therefore degrades to plain passive on Meet, by design.)
 *
 * ## Production binding (TODO at deployment, gated on the allowlist)
 * In production this interface is bound to the **Google Meet Media API** client (the allowlisted
 * participating-client build) so the bot can receive per-participant PCM audio for diarization and
 * push synthesized audio back. The named operations map to the API as follows:
 * - {@link join} / {@link leave} → the Media API conference-session connect / disconnect lifecycle.
 * - {@link sendAudioFrame} → the audio-contribution (outbound media) path.
 * - {@link onAudioFrame} → the per-participant audio-receive callback (the source of speaker labels
 *   for diarization).
 * - {@link onParticipantJoin} / {@link onParticipantLeave} / {@link getParticipants} → the Media API's
 *   participant-resource events + roster snapshot.
 * - {@link muteParticipant} → a participant-management mute action **where the tenant's Meet tier /
 *   allowlist grants it** (otherwise the production adapter rejects and the Meeting Controls `Mute`
 *   capability is simply not advertised). Early-access caveat applies.
 * - {@link onMeetingEnded} → the conference-ended callback.
 *
 * Binding the real API is a thin adapter that implements this interface; the driver and its tests do
 * not change. **None of the API types leak into this package.**
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3, §8 and `/guides/REALTIME_BRIDGES_GUIDE.md`.
 */

/** The role a Google Meet participant holds in the meeting, normalized to the bridge's participant roles. */
export type GoogleMeetParticipantRole = 'Host' | 'CoHost' | 'Participant';

/**
 * One Google Meet participant as the seam reports it. Platform-native and minimal — the driver maps
 * this onto `BridgeParticipantInfo` / `BridgeMeetingParticipant`.
 */
export interface GoogleMeetParticipant {
    /** The Meet participant id (stable for the participant's presence in the conference). */
    ParticipantId: string;
    /** The participant's display name as Meet reports it. */
    DisplayName?: string;
    /** The participant's meeting role. */
    Role: GoogleMeetParticipantRole;
    /** Whether this participant is the bridge's own bot (so the driver can exclude it from diarization addressing). */
    IsSelf?: boolean;
}

/** One frame of raw per-participant audio the seam surfaces for diarization + the agent's "hearing". */
export interface GoogleMeetAudioFrame {
    /** Raw PCM audio bytes for this frame. */
    Pcm: ArrayBuffer;
    /** The Meet participant id this audio came from (the diarization speaker label). */
    ParticipantId: string;
    /** The participant's display name at capture time, when known. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/** Arguments to {@link IGoogleMeetSdk.join} — what the bot needs to get into a Meet conference. */
export interface GoogleMeetJoinArgs {
    /** The Meet meeting code / space id to join (parsed from the join URL or supplied directly). */
    MeetingCode: string;
    /** The display name the bot appears as in the participant list. */
    BotDisplayName: string;
    /**
     * The resolved OAuth/access token (or equivalent auth payload) authorizing the allowlisted client
     * to join via the Media API. Resolved upstream through MJ's credential system; never inline secrets.
     */
    AccessToken?: string;
}

/** The handles the seam returns after a successful {@link IGoogleMeetSdk.join}. */
export interface GoogleMeetJoinResult {
    /** The bot's own participant id in the joined conference. */
    BotParticipantId: string;
    /** The Meet conference/space id the bot joined (the durable external connection id). */
    MeetingId: string;
}

/**
 * The minimal Google Meet Media API surface the {@link import('./googlemeet-bridge').GoogleMeetBridge}
 * depends on. Production binds this to the real (allowlisted) Media API client; tests inject a
 * `FakeGoogleMeetSdk`.
 *
 * **No hand-raise / no chat operations** — see the file-level note: the Meet Media API surfaces neither,
 * so this seam deliberately omits them (unlike `IZoomMeetingSdk`).
 */
export interface IGoogleMeetSdk {
    /**
     * Joins the Meet conference and brings the bot online. Returns the bot's participant id + the
     * meeting id.
     *
     * @param args Join parameters (meeting code, bot name, auth).
     * @returns The bot participant + meeting handles.
     */
    join(args: GoogleMeetJoinArgs): Promise<GoogleMeetJoinResult>;

    /** Leaves the conference and releases Media API resources. */
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
    onAudioFrame(cb: (frame: GoogleMeetAudioFrame) => void): void;

    /**
     * Registers a callback fired when a participant joins. "Latest handler wins."
     *
     * @param cb Invoked with the participant who joined.
     */
    onParticipantJoin(cb: (participant: GoogleMeetParticipant) => void): void;

    /**
     * Registers a callback fired when a participant leaves. "Latest handler wins."
     *
     * @param cb Invoked with the participant id that left.
     */
    onParticipantLeave(cb: (participantId: string) => void): void;

    /**
     * Returns the current participant roster (including the bot).
     *
     * @returns The current participants.
     */
    getParticipants(): Promise<GoogleMeetParticipant[]>;

    /**
     * Mutes a participant, **where the tenant's Meet tier / allowlist grants the action** (the
     * production adapter rejects otherwise, and the driver only advertises the Meeting Controls `Mute`
     * capability when it does). Early-access caveat applies.
     *
     * @param participantId The participant to mute.
     */
    muteParticipant(participantId: string): Promise<void>;

    /**
     * Registers a callback fired when the conference ends (host ended / timed out). "Latest handler wins."
     *
     * @param cb Invoked when the meeting has ended.
     */
    onMeetingEnded(cb: () => void): void;
}

/**
 * A factory that constructs an {@link IGoogleMeetSdk} for a session — the creation seam (mirroring
 * Gemini's `connectLiveSession`). Production supplies a factory that builds the real (allowlisted)
 * Media API adapter from resolved config; tests supply one that returns a `FakeGoogleMeetSdk`.
 *
 * @param config The resolved provider/session configuration (region, credential refs already resolved upstream).
 * @returns The Google Meet SDK instance to drive the meeting with.
 */
export type GoogleMeetSdkFactory = (config?: Record<string, unknown>) => IGoogleMeetSdk;
