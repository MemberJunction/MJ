/**
 * The injectable **LiveKit room SDK seam** — the minimal set of operations
 * {@link import('./livekit-bridge').LiveKitBridge} needs from LiveKit, declared as an interface so the
 * driver builds and unit-tests against an in-memory fake with **no network and no real LiveKit SDK**.
 *
 * ## LiveKit is the MJ-NATIVE room (self-hosted), not a 3rd-party platform
 * Every OTHER bridge in this program connects **out** to a meeting hosted by someone else (Zoom,
 * Teams, Meet, Webex, Slack, Discord) or to a telephony carrier (Twilio, Vonage, RingCentral). LiveKit
 * is the opposite: it is an **open-source WebRTC SFU that MJ runs itself** — the "MJ-native room"
 * (`/plans/realtime/realtime-bridges-architecture.md` §4c). The architecture deliberately treats a Zoom
 * meeting, a Teams meeting, and an MJ-native LiveKit room **identically** — all are multi-party media
 * transports — so LiveKit is "*another bridge, not a special build*." The only practical differences:
 * - **We own the room.** No marketplace review, no per-platform bot-admission quirks; MJ mints the
 *   access token and the room exists because MJ stood up the SFU. An MJ-native multi-party experience
 *   (e.g. embedded in Explorer) is just *this* bridge.
 * - **`connect(roomUrl, token)`** takes a LiveKit room URL + a signed access token (minted upstream by
 *   MJ's credential/token layer — never inline secrets), rather than a join URL we were handed.
 *
 * ## Production binding (TODO at deployment)
 * In production this interface is bound to **`livekit-server-sdk`** (token minting / room admin) plus a
 * **room client** (the Node WebRTC participant — e.g. `@livekit/rtc-node`) so the bot can publish/
 * subscribe media. The named operations map to the SDK as follows:
 * - {@link connect} / {@link disconnect} → the room client `connect()` / `disconnect()` lifecycle.
 * - {@link publishAudioFrame} → publishing PCM on the bot's audio track (the agent's voice).
 * - {@link onAudioTrack} → subscribing each remote participant's audio track; LiveKit delivers tracks
 *   **per participant**, which is the native source of speaker labels for diarization (no extra mixer).
 * - {@link publishVideoFrame} / {@link publishScreenFrame} → publishing the bot's camera / screen-share
 *   tracks (LiveKit does full A/V/screen; the realtime models light audio first).
 * - {@link onParticipantJoin} / {@link onParticipantLeave} / {@link getParticipants} → the room's
 *   `ParticipantConnected` / `ParticipantDisconnected` events + the participant list.
 * - {@link sendDataMessage} → the LiveKit **data channel** (reliable data publish) — used for chat.
 * - {@link onDisconnected} → the room `Disconnected` event (the SFU closed / the bot was removed).
 *
 * ## Echo / self-audio
 * A LiveKit SFU **never delivers a participant its own published track back** — the bot does not hear
 * its own voice, so no echo gate is needed here (documented in {@link onAudioTrack}). The bridge still
 * flags its own track via {@link LiveKitParticipant.IsLocal} defensively.
 *
 * Binding the real SDK is a thin adapter that implements this interface; the driver and its tests do
 * not change. **None of the SDK types leak into this package.**
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §4c and `/guides/REALTIME_BRIDGES_GUIDE.md`.
 */

/** The role a LiveKit participant holds, normalized to the bridge's participant roles. */
export type LiveKitParticipantRole = 'Host' | 'CoHost' | 'Participant';

/**
 * One LiveKit room participant as the seam reports it. Platform-native and minimal — the driver maps
 * this onto `BridgeParticipantInfo` / `BridgeMeetingParticipant`.
 */
export interface LiveKitParticipant {
    /** The LiveKit participant identity (stable, application-assigned — the SID's human-facing key). */
    Identity: string;
    /** The participant's display name as LiveKit reports it (the `name` attribute), when set. */
    DisplayName?: string;
    /** The participant's room role (derived from participant metadata / permissions by the adapter). */
    Role: LiveKitParticipantRole;
    /** Whether this participant is the bridge's own bot (LiveKit's local participant). */
    IsLocal?: boolean;
}

/**
 * One frame of raw per-participant audio the seam surfaces for diarization + the agent's "hearing".
 * Because LiveKit subscribes tracks **per participant**, every inbound frame is already attributed to a
 * single speaker — diarization comes free from the SFU.
 */
export interface LiveKitAudioFrame {
    /** Raw PCM audio bytes for this frame. */
    Pcm: ArrayBuffer;
    /** The LiveKit participant identity this audio came from (the diarization speaker label). */
    ParticipantIdentity: string;
    /** The participant's display name at capture time, when known. */
    DisplayName?: string;
    /** Optional epoch-ms capture timestamp. */
    TimestampMs?: number;
}

/** Arguments to {@link ILiveKitRoomSdk.connect} — what the bot needs to join an MJ-native room. */
export interface LiveKitConnectArgs {
    /** The LiveKit room server URL (e.g. `wss://livekit.myorg.com`). MJ-owned, self-hosted. */
    RoomUrl: string;
    /**
     * The signed LiveKit access token authorizing the bot to join a specific room as a participant.
     * Minted upstream by MJ's token/credential layer (it encodes the room name + grants). Never inline
     * secrets — this arrives already-signed.
     */
    AccessToken: string;
    /** The display name the bot appears as in the participant list. */
    BotDisplayName: string;
}

/** The handles the seam returns after a successful {@link ILiveKitRoomSdk.connect}. */
export interface LiveKitConnectResult {
    /** The bot's own participant identity in the joined room. */
    BotIdentity: string;
    /** The LiveKit room name the bot joined (the durable external connection id). */
    RoomName: string;
}

/**
 * The minimal LiveKit room SDK surface the {@link import('./livekit-bridge').LiveKitBridge} depends on.
 * Production binds this to `livekit-server-sdk` + a room client; tests inject a `FakeLiveKitRoomSdk`.
 */
export interface ILiveKitRoomSdk {
    /**
     * Connects to the MJ-native LiveKit room as a bot participant and brings the bot online. Returns
     * the bot's identity + the room name.
     *
     * @param args Connect parameters (room URL, signed access token, bot name).
     * @returns The bot identity + room handles.
     */
    connect(args: LiveKitConnectArgs): Promise<LiveKitConnectResult>;

    /** Disconnects from the room and releases SDK resources. */
    disconnect(): Promise<void>;

    /**
     * Publishes one raw PCM audio frame on the bot's audio track (the agent's voice into the room).
     *
     * @param pcm The PCM audio bytes to publish.
     */
    publishAudioFrame(pcm: ArrayBuffer): void;

    /**
     * Flushes all pending/queued outbound audio (the agent's voice). Called on barge-in so the agent
     * stops talking immediately instead of draining already-buffered audio after the model is cut off.
     */
    flushOutboundAudio(): void;

    /**
     * Subscribes inbound per-participant audio frames (what the agent hears, carrying the speaker
     * identity for diarization). "Latest handler wins." The SFU never echoes the bot's own published
     * audio back, so frames here are always from OTHER participants.
     *
     * @param cb Invoked with each inbound, per-participant audio frame.
     */
    onAudioTrack(cb: (frame: LiveKitAudioFrame) => void): void;

    /**
     * Publishes one raw video frame on the bot's camera track. LiveKit does full video; the realtime
     * models light audio first, so this is wired but typically unused until a model emits video.
     *
     * @param frame The encoded/raw video frame bytes to publish.
     */
    publishVideoFrame(frame: ArrayBuffer): void;

    /**
     * Publishes one raw screen-share frame on the bot's screen track (e.g. a Remote Browser channel's
     * viewport). LiveKit does full screen share.
     *
     * @param frame The encoded/raw screen frame bytes to publish.
     */
    publishScreenFrame(frame: ArrayBuffer): void;

    /**
     * Registers a callback fired when a participant connects. "Latest handler wins."
     *
     * @param cb Invoked with the participant who joined.
     */
    onParticipantJoin(cb: (participant: LiveKitParticipant) => void): void;

    /**
     * Registers a callback fired when a participant disconnects. "Latest handler wins."
     *
     * @param cb Invoked with the participant identity that left.
     */
    onParticipantLeave(cb: (participantIdentity: string) => void): void;

    /**
     * Returns the current participant list (including the bot).
     *
     * @returns The current participants.
     */
    getParticipants(): Promise<LiveKitParticipant[]>;

    /**
     * Sends a text message on the LiveKit data channel (reliable publish to all participants) — the
     * room-native "chat".
     *
     * @param text The chat/data message text.
     */
    sendDataMessage(text: string): Promise<void>;

    /**
     * Registers a callback fired when the room disconnects the bot (SFU closed / bot removed). "Latest
     * handler wins."
     *
     * @param cb Invoked when the room has disconnected.
     */
    onDisconnected(cb: () => void): void;
}

/**
 * A factory that constructs an {@link ILiveKitRoomSdk} for a session — the creation seam (mirroring
 * Zoom's `ZoomMeetingSdkFactory`). Production supplies a factory that builds the real LiveKit adapter
 * (`livekit-server-sdk` + a room client) from resolved config; tests supply one that returns a
 * `FakeLiveKitRoomSdk`.
 *
 * @param config The resolved provider/session configuration (room URL, region, credential refs already
 *   resolved upstream into a signed token).
 * @returns The LiveKit room SDK instance to drive the room with.
 */
export type LiveKitRoomSdkFactory = (config?: Record<string, unknown>) => ILiveKitRoomSdk;
