/**
 * The injectable **Microsoft Teams calling-bot SDK seam** — the minimal set of operations
 * {@link import('./teams-bridge').TeamsBridge} needs from Teams, declared as an interface so the driver
 * builds and unit-tests against an in-memory fake with **no network and no real Teams / Azure
 * Communication Services SDK**.
 *
 * ## Production binding (TODO at deployment)
 * In production this interface is bound to the **Azure Communication Services (ACS) calling-bot** SDK
 * plus the **Microsoft Graph cloud-communications API** (the `/communications/calls` "application-hosted
 * media" bot model) so the bot can join a Teams meeting, pull per-participant PCM audio for diarization,
 * push synthesized audio back, observe roster + raised-hand events, and post to the Teams meeting chat.
 * The named operations map to the SDK as follows:
 * - {@link join} / {@link leave} → the Graph `POST /communications/calls` (join meeting via the join
 *   URL / meeting coordinates) and the call's `DELETE` (leave) lifecycle.
 * - {@link sendAudioFrame} → the ACS application-hosted-media outbound audio-socket (the bot's voice in).
 * - {@link onAudioFrame} → the ACS per-participant inbound audio-socket callback (the source of speaker
 *   labels for diarization — Teams provides participant attribution on the media stream).
 * - {@link onParticipantJoin} / {@link onParticipantLeave} / {@link getParticipants} → the call's
 *   `participants` collection + the `participantsUpdated` change notifications.
 * - {@link onHandRaise} → the meeting's raised-hand signal. ⚠️ Partial: Teams surfaces raised hands in
 *   the meeting UI, but a clean per-participant *event* over the calling-bot API is not guaranteed on
 *   every tenant/build; the adapter wires it where the platform exposes it and otherwise no-ops.
 * - {@link postChatMessage} → the Graph `POST /chats/{id}/messages` against the meeting's chat thread.
 * - {@link muteParticipant} → the call's `participant:mute` action (requires the bot be an organizer /
 *   presenter with the relevant policy).
 * - {@link onMeetingEnded} → the call's `callEnded` / `terminated` status notification.
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do
 * not change. **None of the ACS/Graph SDK types leak into this package.**
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3, §8 (Microsoft Teams row) and
 * `/guides/REALTIME_BRIDGES_GUIDE.md`.
 */

/** The role a Teams participant holds in the meeting, normalized to the bridge's participant roles. */
export type TeamsParticipantRole = 'Organizer' | 'Presenter' | 'Attendee';

/**
 * One Teams meeting participant as the seam reports it. Platform-native and minimal — the driver maps
 * this onto `BridgeParticipantInfo` / `BridgeMeetingParticipant`.
 */
export interface TeamsParticipant {
    /** The Teams participant id (the call's participant identity / `id`, stable for their presence). */
    ParticipantId: string;
    /** The participant's display name as Teams reports it. */
    DisplayName?: string;
    /** The participant's meeting role. */
    Role: TeamsParticipantRole;
    /** Whether this participant is the bridge's own bot (so the driver can exclude it from diarization addressing). */
    IsSelf?: boolean;
}

/** One frame of raw per-participant audio the seam surfaces for diarization + the agent's "hearing". */
export interface TeamsAudioFrame {
    /** Raw PCM audio bytes for this frame. */
    Pcm: ArrayBuffer;
    /** The Teams participant id this audio came from (the diarization speaker label). */
    ParticipantId: string;
    /** The participant's display name at capture time, when known. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/** Arguments to {@link ITeamsMeetingSdk.join} — what the bot needs to get into a Teams meeting. */
export interface TeamsJoinArgs {
    /** The Teams meeting join URL (the `https://teams.microsoft.com/l/meetup-join/...` link). */
    JoinUrl: string;
    /**
     * The parsed meeting thread id (the chat/conversation id behind the join URL), when resolved
     * upstream. Used for posting to the meeting chat and as a stable meeting coordinate.
     */
    ThreadId?: string;
    /** The display name the bot appears as in the participant list. */
    BotDisplayName: string;
    /**
     * The OAuth bearer / application token authorizing the bot's Graph + ACS calls. Resolved upstream
     * via MJ's credential system; never inline secrets.
     */
    AccessToken?: string;
    /** The Azure tenant id the meeting belongs to, when joining cross-tenant. */
    TenantId?: string;
}

/** The handles the seam returns after a successful {@link ITeamsMeetingSdk.join}. */
export interface TeamsJoinResult {
    /** The bot's own participant id in the joined meeting. */
    BotParticipantId: string;
    /** The Teams call id the bot joined (the durable external connection id). */
    CallId: string;
}

/**
 * The minimal Microsoft Teams calling-bot SDK surface the {@link import('./teams-bridge').TeamsBridge}
 * depends on. Production binds this to the real ACS calling-bot / Graph cloud-communications API; tests
 * inject a `FakeTeamsSdk`.
 */
export interface ITeamsMeetingSdk {
    /**
     * Joins the Teams meeting and brings the bot online. Returns the bot's participant id + the call id.
     *
     * @param args Join parameters (join URL, thread id, bot name, auth).
     * @returns The bot participant + call handles.
     */
    join(args: TeamsJoinArgs): Promise<TeamsJoinResult>;

    /** Leaves the meeting (terminates the bot's call leg) and releases SDK resources. */
    leave(): Promise<void>;

    /**
     * Sends one raw PCM audio frame as the bot's outbound audio (the agent's voice into the meeting),
     * over the ACS application-hosted-media outbound audio socket.
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
    onAudioFrame(cb: (frame: TeamsAudioFrame) => void): void;

    /**
     * Registers a callback fired when a participant joins. "Latest handler wins."
     *
     * @param cb Invoked with the participant who joined.
     */
    onParticipantJoin(cb: (participant: TeamsParticipant) => void): void;

    /**
     * Registers a callback fired when a participant leaves. "Latest handler wins."
     *
     * @param cb Invoked with the participant id that left.
     */
    onParticipantLeave(cb: (participantId: string) => void): void;

    /**
     * Registers a callback for native raised-hand signals. "Latest handler wins."
     *
     * ⚠️ Teams raised-hand is partial over the calling-bot API: a clean per-participant event is not
     * guaranteed on every tenant/build. The adapter wires this where the platform exposes it and the
     * driver tolerates the signal never firing.
     *
     * @param cb Invoked with the participant id and whether the hand is now raised.
     */
    onHandRaise(cb: (participantId: string, raised: boolean) => void): void;

    /**
     * Returns the current participant roster (including the bot).
     *
     * @returns The current participants.
     */
    getParticipants(): Promise<TeamsParticipant[]>;

    /**
     * Posts a message to the Teams meeting chat thread (everyone).
     *
     * @param text The chat message text.
     */
    postChatMessage(text: string): Promise<void>;

    /**
     * Mutes a participant (requires the bot be an organizer/presenter with the relevant policy).
     *
     * @param participantId The participant to mute.
     */
    muteParticipant(participantId: string): Promise<void>;

    /**
     * Registers a callback fired when the meeting/call ends (organizer ended / call terminated).
     * "Latest handler wins."
     *
     * @param cb Invoked when the meeting has ended.
     */
    onMeetingEnded(cb: () => void): void;
}

/**
 * A factory that constructs an {@link ITeamsMeetingSdk} for a session — the creation seam (mirroring
 * Gemini's `connectLiveSession`). Production supplies a factory that builds the real ACS calling-bot /
 * Graph adapter from resolved config; tests supply one that returns a `FakeTeamsSdk`.
 *
 * @param config The resolved provider/session configuration (tenant, credential refs already resolved upstream).
 * @returns The Teams SDK instance to drive the meeting with.
 */
export type TeamsMeetingSdkFactory = (config?: Record<string, unknown>) => ITeamsMeetingSdk;
