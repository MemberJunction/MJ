/**
 * The injectable **Cisco Webex Meetings SDK seam** — the minimal set of operations
 * {@link import('./webex-bridge').WebexBridge} needs from Webex, declared as an interface so the driver
 * builds and unit-tests against an in-memory fake with **no network and no real Cisco Webex Meetings SDK
 * / xAPI / Webex bot framework**.
 *
 * ## Production binding (TODO at deployment)
 * In production this interface is bound to the **Cisco Webex Meetings SDK** (the embedded-app / Web /
 * mobile Meetings SDK that joins a meeting and exposes media + roster) together with the **Webex bot
 * framework** (Webex Messaging API, for posting to the meeting/space) and, where a Webex room device is
 * involved, the **xAPI** (the device control surface for participant actions). The named operations map
 * to the SDK as follows:
 * - {@link join} / {@link leave} → the Webex Meetings SDK `Meeting.join()` / `Meeting.leave()` lifecycle
 *   (the bot/app joins via the meeting link, SIP address, or meeting number).
 * - {@link sendAudioFrame} → the Meetings SDK outbound audio media track (the bot's voice into the meeting).
 * - {@link onAudioFrame} → the Meetings SDK per-participant inbound audio media callback (the source of
 *   speaker labels for diarization — Webex attributes media to a `Member`).
 * - {@link onParticipantJoin} / {@link onParticipantLeave} / {@link getParticipants} → the meeting's
 *   `members` collection + the `members:update` change events.
 * - {@link onHandRaise} → the Webex raised-hand reaction. ⚠️ Partial: Webex surfaces raised hands in the
 *   meeting UI, but a clean per-participant *event* over the Meetings SDK is not guaranteed on every
 *   client/build; the adapter wires it where the platform exposes it and otherwise no-ops.
 * - {@link postChatMessage} → the Webex Messaging API `POST /messages` against the meeting's associated
 *   space (the in-meeting chat thread).
 * - {@link muteParticipant} → the meeting's `Member.mute` action / device xAPI mute (requires the bot be
 *   a host / cohost with the relevant privilege).
 * - {@link onMeetingEnded} → the meeting's `meeting:ended` / `state` → `ENDED` notification.
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do
 * not change. **None of the Webex SDK types leak into this package.**
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3, §8 (Cisco Webex row) and
 * `/guides/REALTIME_BRIDGES_GUIDE.md`.
 */

/** The role a Webex member holds in the meeting, normalized to the bridge's participant roles. */
export type WebexParticipantRole = 'Host' | 'Cohost' | 'Attendee';

/**
 * One Webex meeting member as the seam reports it. Platform-native and minimal — the driver maps
 * this onto `BridgeParticipantInfo` / `BridgeMeetingParticipant`.
 */
export interface WebexParticipant {
    /** The Webex member id (the meeting `Member.id`, stable for their presence). */
    ParticipantId: string;
    /** The member's display name as Webex reports it. */
    DisplayName?: string;
    /** The member's meeting role. */
    Role: WebexParticipantRole;
    /** Whether this member is the bridge's own bot (so the driver can exclude it from diarization addressing). */
    IsSelf?: boolean;
}

/** One frame of raw per-participant audio the seam surfaces for diarization + the agent's "hearing". */
export interface WebexAudioFrame {
    /** Raw PCM audio bytes for this frame. */
    Pcm: ArrayBuffer;
    /** The Webex member id this audio came from (the diarization speaker label). */
    ParticipantId: string;
    /** The member's display name at capture time, when known. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/** Arguments to {@link IWebexMeetingSdk.join} — what the bot needs to get into a Webex meeting. */
export interface WebexJoinArgs {
    /** The Webex meeting link (the `https://*.webex.com/meet/...` / `.../join/...` URL). */
    MeetingLink: string;
    /**
     * The parsed Webex meeting number / SIP address (the durable meeting coordinate behind the link),
     * when resolved upstream. Used as a stable meeting identifier when the link is opaque.
     */
    MeetingNumber?: string;
    /** The display name the bot appears as in the participant list. */
    BotDisplayName: string;
    /**
     * The OAuth bearer / bot access token authorizing the bot's Webex Meetings + Messaging calls.
     * Resolved upstream via MJ's credential system; never inline secrets.
     */
    AccessToken?: string;
    /** The Webex site (org) the meeting belongs to, when joining cross-site. */
    SiteUrl?: string;
}

/** The handles the seam returns after a successful {@link IWebexMeetingSdk.join}. */
export interface WebexJoinResult {
    /** The bot's own member id in the joined meeting. */
    BotParticipantId: string;
    /** The Webex meeting id the bot joined (the durable external connection id). */
    MeetingId: string;
}

/**
 * The minimal Cisco Webex Meetings SDK surface the {@link import('./webex-bridge').WebexBridge}
 * depends on. Production binds this to the real Webex Meetings SDK / Webex bot framework; tests
 * inject a `FakeWebexSdk`.
 */
export interface IWebexMeetingSdk {
    /**
     * Joins the Webex meeting and brings the bot online. Returns the bot's member id + the meeting id.
     *
     * @param args Join parameters (meeting link, meeting number, bot name, auth).
     * @returns The bot member + meeting handles.
     */
    join(args: WebexJoinArgs): Promise<WebexJoinResult>;

    /** Leaves the meeting (the bot's `Meeting.leave()`) and releases SDK resources. */
    leave(): Promise<void>;

    /**
     * Sends one raw PCM audio frame as the bot's outbound audio (the agent's voice into the meeting),
     * over the Webex Meetings SDK outbound audio media track.
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
    onAudioFrame(cb: (frame: WebexAudioFrame) => void): void;

    /**
     * Registers a callback fired when a member joins. "Latest handler wins."
     *
     * @param cb Invoked with the member who joined.
     */
    onParticipantJoin(cb: (participant: WebexParticipant) => void): void;

    /**
     * Registers a callback fired when a member leaves. "Latest handler wins."
     *
     * @param cb Invoked with the member id that left.
     */
    onParticipantLeave(cb: (participantId: string) => void): void;

    /**
     * Registers a callback for native raised-hand signals. "Latest handler wins."
     *
     * ⚠️ Webex raised-hand is partial over the Meetings SDK: a clean per-participant event is not
     * guaranteed on every client/build. The adapter wires this where the platform exposes it and the
     * driver tolerates the signal never firing.
     *
     * @param cb Invoked with the member id and whether the hand is now raised.
     */
    onHandRaise(cb: (participantId: string, raised: boolean) => void): void;

    /**
     * Returns the current member roster (including the bot).
     *
     * @returns The current members.
     */
    getParticipants(): Promise<WebexParticipant[]>;

    /**
     * Posts a message to the Webex meeting space chat (everyone).
     *
     * @param text The chat message text.
     */
    postChatMessage(text: string): Promise<void>;

    /**
     * Mutes a member (requires the bot be a host/cohost with the relevant privilege).
     *
     * @param participantId The member to mute.
     */
    muteParticipant(participantId: string): Promise<void>;

    /**
     * Registers a callback fired when the meeting ends (host ended / meeting state → ENDED).
     * "Latest handler wins."
     *
     * @param cb Invoked when the meeting has ended.
     */
    onMeetingEnded(cb: () => void): void;
}

/**
 * A factory that constructs an {@link IWebexMeetingSdk} for a session — the creation seam (mirroring
 * Gemini's `connectLiveSession`). Production supplies a factory that builds the real Webex Meetings SDK /
 * Webex bot adapter from resolved config; tests supply one that returns a `FakeWebexSdk`.
 *
 * @param config The resolved provider/session configuration (site, credential refs already resolved upstream).
 * @returns The Webex SDK instance to drive the meeting with.
 */
export type WebexMeetingSdkFactory = (config?: Record<string, unknown>) => IWebexMeetingSdk;
