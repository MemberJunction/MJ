/**
 * The injectable **Slack huddle SDK seam** — the minimal set of operations
 * {@link import('./slack-bridge').SlackBridge} needs from a Slack huddle, declared as an interface so
 * the driver builds and unit-tests against an in-memory fake with **no network and no real Slack SDK**.
 * The operations are named after **Slack huddle** concepts: modern Slack huddles do full audio + video
 * + screen share, and run on **Amazon Chime** under the hood.
 *
 * ## 🚨 REAL-API RISK — the huddle MEDIA API is the gating unknown 🚨
 * This is **the one bridge driver with a genuine API-availability risk**, not merely a binding TODO.
 *
 * Slack's public APIs cover huddle *signaling* well — Web API + Events/Socket Mode surface huddle
 * start/end, membership, and thread/huddle chat. What Slack does **NOT** publicly document is a
 * **bot-join-with-media** path: there is no published, supported way for a bot/app to *join a huddle as
 * a media participant* and pull per-participant PCM audio / push synthesized audio back. Because huddles
 * run on **Amazon Chime** under the hood, production media access may require a **Chime-level
 * integration** (e.g. a Chime SDK media pipeline / app instance) and/or an entitlement Slack does not
 * expose through its standard developer surface.
 *
 * **Implication for this seam:** the media operations below ({@link join} with media,
 * {@link sendAudioFrame}, {@link onAudioFrame}) are designed **as if** that media path exists, so the
 * driver and its adapter are ready the moment it does. But **before this driver can be promoted from
 * `Disabled` to a live production binding, someone must verify/obtain huddle media access** (confirm a
 * supported bot-join-with-media path, or stand up the Chime-level pipeline). Until then, only the
 * signaling-and-chat subset ({@link onParticipantJoin}/{@link onParticipantLeave}/{@link getParticipants}/
 * {@link postChatMessage}/{@link onMeetingEnded}/{@link muteParticipant}) is on firm public-API ground.
 *
 * ## Production binding (TODO at deployment — see the REAL-API RISK above first)
 * Bind this interface to a thin adapter over:
 * - {@link join} / {@link leave} → Slack huddle start/join + the **Chime media-session join** for the
 *   bot leg (the media half is the gating unknown above), and leave/teardown.
 * - {@link sendAudioFrame} → the Chime media pipeline outbound audio (the agent's voice into the huddle).
 *   ⚠️ Requires the huddle media path.
 * - {@link onAudioFrame} → the Chime per-attendee inbound audio (the source of speaker labels for
 *   diarization). ⚠️ Requires the huddle media path.
 * - {@link onParticipantJoin} / {@link onParticipantLeave} / {@link getParticipants} → Slack huddle
 *   membership via the Web API + Events/Socket Mode `*_huddle_*` events.
 * - {@link onHandRaise} → Slack does not surface a first-class huddle raise-hand event to apps on every
 *   workspace/build; ⚠️ partial — the adapter wires it where available and otherwise no-ops.
 * - {@link postChatMessage} → `chat.postMessage` into the huddle's thread/channel.
 * - {@link muteParticipant} → the huddle/Chime participant-mute action (subject to the bot holding the
 *   relevant authority).
 * - {@link onMeetingEnded} → the huddle-ended event (`*_huddle_*` end / all participants left).
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do
 * not change. **None of the Slack / Chime SDK types leak into this package.**
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3, §8 (Slack row) and
 * `/guides/REALTIME_BRIDGES_GUIDE.md`.
 */

/** The role a Slack huddle participant holds, normalized to the bridge's participant roles. */
export type SlackParticipantRole = 'Host' | 'CoHost' | 'Participant';

/**
 * One Slack huddle participant as the seam reports it. Platform-native and minimal — the driver maps
 * this onto `BridgeParticipantInfo` / `BridgeMeetingParticipant`. Slack huddles are relatively flat
 * (the starter is the closest thing to a host), so roles normalize to host/co-host/participant.
 */
export interface SlackParticipant {
    /** The Slack user id of the participant (stable for their presence in the huddle). */
    ParticipantId: string;
    /** The participant's display name as Slack reports it. */
    DisplayName?: string;
    /** The participant's huddle role (the huddle starter normalizes to `'Host'`). */
    Role: SlackParticipantRole;
    /** Whether this participant is the bridge's own bot (so the driver can exclude it from diarization addressing). */
    IsSelf?: boolean;
}

/**
 * One frame of raw per-participant audio the seam surfaces for diarization + the agent's "hearing".
 *
 * ⚠️ Sourced from the huddle media path (Chime) — see the REAL-API RISK at the top of this file.
 */
export interface SlackAudioFrame {
    /** Raw PCM audio bytes for this frame. */
    Pcm: ArrayBuffer;
    /** The Slack user id this audio came from (the diarization speaker label). */
    ParticipantId: string;
    /** The participant's display name at capture time, when known. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/** Arguments to {@link ISlackHuddleSdk.join} — what the bot needs to get into a huddle. */
export interface SlackJoinArgs {
    /** The Slack channel id the huddle is hosted in (parsed from the huddle link / supplied directly). */
    ChannelId: string;
    /** The huddle / huddle-thread id, when resolved upstream. Used for posting and as a stable coordinate. */
    HuddleId?: string;
    /** The display name the bot appears as in the huddle participant list. */
    BotDisplayName: string;
    /**
     * The OAuth bot token authorizing the Slack Web API + Events calls. Resolved upstream via MJ's
     * credential system; never inline secrets.
     */
    BotToken?: string;
    /**
     * The Slack team / workspace id, when joining a specific workspace. Resolved upstream.
     */
    TeamId?: string;
}

/** The handles the seam returns after a successful {@link ISlackHuddleSdk.join}. */
export interface SlackJoinResult {
    /** The bot's own participant (Slack user) id in the joined huddle. */
    BotParticipantId: string;
    /** The Slack huddle id the bot joined (the durable external connection id). */
    HuddleId: string;
}

/**
 * The minimal Slack huddle SDK surface the {@link import('./slack-bridge').SlackBridge} depends on.
 * Production binds this to a real Slack Web API + Events adapter **plus** the (gating-unknown) huddle
 * media path; tests inject a `FakeSlackHuddleSdk`.
 *
 * 🚨 See the REAL-API RISK at the top of this file: the media operations ({@link join} media half,
 * {@link sendAudioFrame}, {@link onAudioFrame}) depend on a huddle bot-join-with-media path Slack does
 * not publicly document — this seam is built ready for it, but production binding must verify/obtain it.
 */
export interface ISlackHuddleSdk {
    /**
     * Joins the huddle and brings the bot online (signaling **and** media). Returns the bot's
     * participant id + the huddle id.
     *
     * ⚠️ The *media* half of the join is the gating unknown (see the REAL-API RISK at the top of this
     * file). Signaling/membership is on firm public-API ground; media may require a Chime-level path.
     *
     * @param args Join parameters (channel id, huddle id, bot name, auth).
     * @returns The bot participant + huddle handles.
     */
    join(args: SlackJoinArgs): Promise<SlackJoinResult>;

    /** Leaves the huddle (and tears down the bot's media leg) and releases SDK resources. */
    leave(): Promise<void>;

    /**
     * Sends one raw PCM audio frame as the bot's outbound audio (the agent's voice into the huddle),
     * over the huddle media pipeline.
     *
     * ⚠️ Requires the huddle media path (Chime) — see the REAL-API RISK at the top of this file.
     *
     * @param pcm The PCM audio bytes to send.
     */
    sendAudioFrame(pcm: ArrayBuffer): void;

    /**
     * Registers a callback for inbound raw per-participant audio frames (what the agent hears, carrying
     * the speaker label for diarization). "Latest handler wins."
     *
     * ⚠️ Requires the huddle media path (Chime) — see the REAL-API RISK at the top of this file.
     *
     * @param cb Invoked with each inbound audio frame.
     */
    onAudioFrame(cb: (frame: SlackAudioFrame) => void): void;

    /**
     * Registers a callback fired when a participant joins the huddle. "Latest handler wins."
     *
     * @param cb Invoked with the participant who joined.
     */
    onParticipantJoin(cb: (participant: SlackParticipant) => void): void;

    /**
     * Registers a callback fired when a participant leaves the huddle. "Latest handler wins."
     *
     * @param cb Invoked with the participant id that left.
     */
    onParticipantLeave(cb: (participantId: string) => void): void;

    /**
     * Registers a callback for native raised-hand signals. "Latest handler wins."
     *
     * ⚠️ Slack does not surface a first-class huddle raise-hand event to apps on every workspace/build;
     * partial — the adapter wires it where available and the driver tolerates the signal never firing.
     *
     * @param cb Invoked with the participant id and whether the hand is now raised.
     */
    onHandRaise(cb: (participantId: string, raised: boolean) => void): void;

    /**
     * Returns the current huddle participant roster (including the bot).
     *
     * @returns The current participants.
     */
    getParticipants(): Promise<SlackParticipant[]>;

    /**
     * Posts a message to the huddle's thread / channel (everyone), via `chat.postMessage`.
     *
     * @param text The chat message text.
     */
    postChatMessage(text: string): Promise<void>;

    /**
     * Mutes a participant in the huddle (subject to the bot holding the relevant authority).
     *
     * @param participantId The participant to mute.
     */
    muteParticipant(participantId: string): Promise<void>;

    /**
     * Registers a callback fired when the huddle ends (starter ended / all participants left).
     * "Latest handler wins."
     *
     * @param cb Invoked when the huddle has ended.
     */
    onMeetingEnded(cb: () => void): void;
}

/**
 * A factory that constructs an {@link ISlackHuddleSdk} for a session — the creation seam (mirroring
 * Gemini's `connectLiveSession`). Production supplies a factory that builds the real Slack + huddle-media
 * adapter from resolved config; tests supply one that returns a `FakeSlackHuddleSdk`.
 *
 * 🚨 See the REAL-API RISK at the top of this file: a production factory must wire a verified huddle
 * media path (likely Chime-level) for the media operations to function.
 *
 * @param config The resolved provider/session configuration (workspace, credential refs already resolved upstream).
 * @returns The Slack huddle SDK instance to drive the huddle with.
 */
export type SlackHuddleSdkFactory = (config?: Record<string, unknown>) => ISlackHuddleSdk;
