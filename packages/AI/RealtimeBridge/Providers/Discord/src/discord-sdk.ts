/**
 * The injectable **Discord voice-channel / bot-gateway seam** — the minimal set of operations
 * {@link import('./discord-bridge').DiscordBridge} needs from Discord, declared as an interface so the
 * driver builds and unit-tests against an in-memory fake with **no network and no real Discord client**.
 *
 * ## Discord is voice-CHANNEL based, not meeting based (read first)
 * Unlike Zoom/Teams/Meet, Discord has no concept of a *scheduled meeting* with an *invite link*. A bot
 * **joins a persistent VOICE CHANNEL** (identified by a guild + channel id) on demand via the gateway,
 * then streams Opus/PCM audio over a UDP voice connection. There is therefore deliberately **no
 * scheduled-join, no invite-join, and no native-invite** surface on this seam — those are not Discord
 * concepts. Discord *does* offer first-class **per-user audio** (excellent diarization via the speaking
 * user's id), **video / screen share ("Go Live")**, and a **text channel** for chat.
 *
 * ## Discord capability shape vs. Zoom (what this seam deliberately OMITS / keeps)
 * - **Hand-raise** ➖ — Discord voice channels surface **no** participant hand-raise/lower signal, so
 *   there is no `onHandRaise` operation (same as the Google Meet seam). The Meeting Controls channel
 *   still exposes a hand-raise *handler* (the channel contract requires it), but for Discord it is a
 *   registered-but-never-fired no-op — there is no platform signal to drive it.
 *   See {@link import('./discord-meeting-controls').DiscordMeetingControlsEventSource}.
 * - **Scheduled / invite / native-invite join** ➖ — not Discord concepts (channel-based, on-demand
 *   only). The join args carry a guild + voice-channel id, not a meeting number or invite URL.
 * - **In-meeting (text-channel) chat** ✅ — Discord DOES expose programmatic text-channel posting, so
 *   (unlike Meet) this seam keeps a {@link postChatMessage} operation (mirroring the Zoom seam). This is
 *   what lets the Hybrid "raise hand via chat" turn-taking mode work on Discord.
 *
 * ## Production binding (TODO at deployment)
 * In production this interface is bound to **`@discordjs/voice`** (the voice connection / Opus audio
 * receiver + player) plus **`discord.js`** (the gateway client for member presence + text-channel posts)
 * so the bot can receive per-user Opus/PCM audio for diarization and push synthesized audio back. The
 * named operations map to those libraries as follows:
 * - {@link joinVoiceChannel} / {@link leaveVoiceChannel} → `@discordjs/voice` `joinVoiceChannel()` /
 *   `connection.destroy()`, with the guild + channel resolved through the `discord.js` client.
 * - {@link sendAudioFrame} → the voice connection's audio player (Opus/PCM resource) — the agent's voice.
 * - {@link onAudioFrame} → the voice receiver's per-user Opus/PCM stream (the source of speaker labels
 *   for diarization — Discord keys received audio by the speaking user's id).
 * - {@link onMemberJoin} / {@link onMemberLeave} / {@link getMembers} → `voiceStateUpdate` gateway events
 *   + the voice channel's member collection.
 * - {@link postChatMessage} → `channel.send(...)` on the associated text channel.
 * - {@link onDisconnect} → the voice connection's `Disconnected`/`Destroyed` state transition.
 *
 * Binding the real libraries is a thin adapter that implements this interface; the driver and its tests
 * do not change. **None of the discord.js / @discordjs/voice types leak into this package.**
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §3, §8 and `/guides/REALTIME_BRIDGES_GUIDE.md`.
 */

/** The role a Discord voice-channel member holds, normalized to the bridge's participant roles. */
export type DiscordMemberRole = 'Host' | 'CoHost' | 'Participant';

/**
 * One Discord voice-channel member as the seam reports it. Platform-native and minimal — the driver maps
 * this onto `BridgeParticipantInfo` / `BridgeMeetingParticipant`. The {@link UserId} is the Discord user
 * (snowflake) id, which doubles as the diarization speaker label since Discord keys received audio by it.
 */
export interface DiscordMember {
    /** The Discord user (snowflake) id — stable per user; the diarization speaker label. */
    UserId: string;
    /** The member's display name (guild nickname or username) as Discord reports it. */
    DisplayName?: string;
    /** The member's normalized role. Discord has no host; a guild admin / channel owner maps to `Host`. */
    Role: DiscordMemberRole;
    /** Whether this member is the bridge's own bot (so the driver can exclude it from diarization addressing). */
    IsSelf?: boolean;
}

/** One frame of raw per-user audio the seam surfaces for diarization + the agent's "hearing". */
export interface DiscordAudioFrame {
    /** Raw PCM audio bytes for this frame (decoded from Discord's Opus stream by the adapter). */
    Pcm: ArrayBuffer;
    /** The Discord user id this audio came from (the diarization speaker label). */
    UserId: string;
    /** The member's display name at capture time, when known. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/** Arguments to {@link IDiscordVoiceSdk.joinVoiceChannel} — what the bot needs to get into a voice channel. */
export interface DiscordJoinArgs {
    /** The Discord guild (server) id that owns the voice channel. */
    GuildId: string;
    /** The Discord voice-channel id the bot joins. */
    VoiceChannelId: string;
    /** The display name / nickname the bot appears as in the member list. */
    BotDisplayName: string;
    /**
     * The resolved bot token (or equivalent auth payload) authorizing the gateway connection. Resolved
     * upstream through MJ's credential system; never inline secrets.
     */
    BotToken?: string;
}

/** The handles the seam returns after a successful {@link IDiscordVoiceSdk.joinVoiceChannel}. */
export interface DiscordJoinResult {
    /** The bot's own Discord user id in the joined voice channel. */
    BotUserId: string;
    /** The Discord voice-channel id the bot joined (the durable external connection id). */
    VoiceChannelId: string;
}

/**
 * The minimal Discord voice-channel / bot-gateway surface the
 * {@link import('./discord-bridge').DiscordBridge} depends on. Production binds this to
 * `@discordjs/voice` + `discord.js`; tests inject a `FakeDiscordVoiceSdk`.
 *
 * **No hand-raise / no scheduled-invite operations** — see the file-level note: Discord is voice-channel
 * based and surfaces no hand-raise, so this seam deliberately omits them. It DOES keep
 * {@link postChatMessage} (Discord text channels), unlike the Google Meet seam.
 */
export interface IDiscordVoiceSdk {
    /**
     * Joins the Discord voice channel and brings the bot online. Returns the bot's user id + the
     * voice-channel id.
     *
     * @param args Join parameters (guild id, voice-channel id, bot name, auth).
     * @returns The bot user + voice-channel handles.
     */
    joinVoiceChannel(args: DiscordJoinArgs): Promise<DiscordJoinResult>;

    /** Leaves the voice channel and releases the voice connection + gateway resources. */
    leaveVoiceChannel(): Promise<void>;

    /**
     * Sends one raw PCM audio frame as the bot's outbound audio (the agent's voice into the channel).
     * The adapter encodes to Opus for the Discord voice connection.
     *
     * @param pcm The PCM audio bytes to send.
     */
    sendAudioFrame(pcm: ArrayBuffer): void;

    /**
     * Registers a callback for inbound raw per-user audio frames (what the agent hears, carrying the
     * speaker label for diarization). "Latest handler wins."
     *
     * @param cb Invoked with each inbound audio frame.
     */
    onAudioFrame(cb: (frame: DiscordAudioFrame) => void): void;

    /**
     * Registers a callback fired when a member joins the voice channel. "Latest handler wins."
     *
     * @param cb Invoked with the member who joined.
     */
    onMemberJoin(cb: (member: DiscordMember) => void): void;

    /**
     * Registers a callback fired when a member leaves the voice channel. "Latest handler wins."
     *
     * @param cb Invoked with the user id that left.
     */
    onMemberLeave(cb: (userId: string) => void): void;

    /**
     * Returns the current voice-channel member roster (including the bot).
     *
     * @returns The current members.
     */
    getMembers(): Promise<DiscordMember[]>;

    /**
     * Posts a message to the associated text channel (everyone in the channel sees it). Discord exposes
     * a first-class programmatic text-channel post, so this is supported (unlike Google Meet).
     *
     * @param text The chat message text.
     */
    postChatMessage(text: string): Promise<void>;

    /**
     * Mutes a member in the voice channel (requires the bot to have the guild's "Mute Members" permission).
     *
     * @param userId The user to mute.
     */
    muteMember(userId: string): Promise<void>;

    /**
     * Registers a callback fired when the bot's voice connection is dropped (channel deleted, kicked,
     * gateway disconnect). "Latest handler wins."
     *
     * @param cb Invoked when the voice connection has ended.
     */
    onDisconnect(cb: () => void): void;
}

/**
 * A factory that constructs an {@link IDiscordVoiceSdk} for a session — the creation seam (mirroring
 * Gemini's `connectLiveSession`). Production supplies a factory that builds the real
 * `@discordjs/voice` + `discord.js` adapter from resolved config; tests supply one that returns a
 * `FakeDiscordVoiceSdk`.
 *
 * @param config The resolved provider/session configuration (credential refs already resolved upstream).
 * @returns The Discord voice SDK instance to drive the voice channel with.
 */
export type DiscordVoiceSdkFactory = (config?: Record<string, unknown>) => IDiscordVoiceSdk;
