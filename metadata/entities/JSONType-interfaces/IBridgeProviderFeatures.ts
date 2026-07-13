/**
 * Strongly-typed shape of `AIBridgeProvider.SupportedFeatures` (the `MJ: AI Bridge Providers`
 * entity), bound to the column via JSONType metadata so CodeGen emits a typed accessor.
 *
 * A *bridge* connects the one realtime agent engine to an external endpoint — a meeting
 * (Zoom/Teams/Slack/Meet/Webex/Discord) or a phone call (Twilio/Vonage/RingCentral/VOIP). These
 * flags declare what each platform's bridge driver supports. The bridge engine **gates** every
 * optional driver call on the matching flag; `BaseRealtimeBridge` additionally throws
 * `BridgeCapabilityNotSupportedError` if a feature is claimed here but the driver hasn't
 * implemented it (defense-in-depth). All properties are optional — an omitted flag means the
 * feature is **not** supported.
 *
 * Holding these as JSON (rather than dedicated BIT columns) keeps the table simple and lets new
 * platform features be added without a schema migration — just extend this interface.
 *
 * NOTE: *interactive* surfaces (hand-raise, in-meeting chat, native whiteboard) are deliberately
 * NOT here. Those are CHANNELS the bridge contributes (`RealtimeBridgeProviderChannel` →
 * `AIAgentChannel`), understood the same way as MJ-native channels. This interface is
 * transport/media capabilities only.
 *
 * See `/plans/realtime/realtime-bridges-architecture.md`.
 */
export interface IBridgeProviderFeatures {
    // ── Join methods (how an agent gets onto the endpoint) ──────────────────────
    /** The agent can join on demand from a supplied join URL/ID. */
    OnDemandJoin?: boolean;
    /** The agent can be scheduled to join a known meeting at a future start time. */
    ScheduledJoin?: boolean;
    /** The agent can be invited like a person via its calendar/email identity (a watcher joins at start). */
    InviteJoin?: boolean;
    /** A host can add the agent from inside the platform's own UI (requires a marketplace app). */
    NativeInvite?: boolean;
    /** Inbound connections (a call/invite to the agent's identity) route TO the agent. */
    InboundRouting?: boolean;
    /** Telephony: the agent can place outbound calls. */
    OutboundDial?: boolean;

    // ── Media tracks (directional — nothing here is audio-specific) ─────────────
    /** Inbound audio: the agent hears the meeting/call (routed to IRealtimeSession.SendInput). */
    AudioIn?: boolean;
    /** Outbound audio: the agent speaks into the meeting/call (fed from IRealtimeSession.OnOutput). */
    AudioOut?: boolean;
    /** Inbound video: the agent sees participants' video (forward-looking for full-duplex video models). */
    VideoIn?: boolean;
    /** Outbound video: the agent shows video. */
    VideoOut?: boolean;
    /** Inbound screen-share: the agent sees a shared screen. */
    ScreenIn?: boolean;
    /** Outbound screen-share: e.g. the Remote Browser channel screen-sharing a live demo. */
    ScreenOut?: boolean;

    // ── Signals & telephony features ────────────────────────────────────────────
    /** Inbound audio carries per-speaker labels (diarized transcripts + addressed-speaker turn-taking). */
    SpeakerDiarization?: boolean;
    /** Telephony: the bridge can send/receive DTMF tones. */
    DTMF?: boolean;
    /** Telephony: the bridge can transfer a call to another party. */
    CallTransfer?: boolean;
    /** The bridge can request platform recording (subject to per-jurisdiction consent handling). */
    Recording?: boolean;
}
