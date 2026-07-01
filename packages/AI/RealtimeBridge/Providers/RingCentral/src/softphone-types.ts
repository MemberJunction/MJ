/**
 * @fileoverview Minimal **structural** surfaces for the `ringcentral-softphone` SIP/RTP SDK and its
 * `werift-rtp` peer — the only contact this package has with either library's shape. Declared as local
 * interfaces (not imports) so:
 *
 *   1. `@memberjunction/ai-bridge-ringcentral` builds + unit-tests with NEITHER package installed (the
 *      seams are satisfied by in-memory fakes); the real libraries load lazily in
 *      {@link import('./ringcentral-softphone-handle').createRingCentralSoftphone} (CLAUDE rule 8,
 *      category 2 — optional peer SDK loaded only when the provider is configured).
 *   2. None of the SDK's concrete types leak through our public API.
 *
 * Every field below is a verbatim subset of the real library surface (verified against
 * `ringcentral-softphone` v1.3.x and `werift-rtp` v0.8.x): the `ringcentral-softphone` package's sole
 * export is the default `Softphone` class — `CallSession` / `InboundCallSession` / `OutboundCallSession`
 * are NOT exported by name, so they are typed structurally here.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 */

/**
 * A `werift-rtp` `RtpHeader` constructor-arg shape — the subset of fields {@link Streamer.sendPacket}
 * sets for an audio packet (verbatim from `ringcentral-softphone/src/call-session/streamer.ts`). Carried
 * as a structural type because `werift-rtp` is not statically imported.
 */
export interface RtpHeaderInit {
    version: number;
    padding: boolean;
    paddingSize: number;
    extension: boolean;
    marker: boolean;
    payloadOffset: number;
    payloadType: number;
    sequenceNumber: number;
    timestamp: number;
    ssrc: number;
    csrcLength: number;
    csrc: number[];
    extensionProfile: number;
    extensionLength: number | undefined;
    extensions: unknown[];
}

/**
 * An opaque handle to a constructed `werift-rtp` `RtpHeader`. We never read its fields back — we only
 * construct it and hand it to {@link SoftphoneCallSession.sendPacket} — so the structural shape is the
 * init shape it was built from.
 */
export type RtpHeaderInstance = RtpHeaderInit;

/** A constructed `werift-rtp` `RtpPacket`. We read only `payload`/`header` and pass it to `sendPacket`. */
export interface RtpPacketInstance {
    payload: Buffer;
    header: RtpHeaderInstance;
}

/** The two `werift-rtp` constructors {@link import('./realtime-rtp-sender').RealtimeRtpSender} needs. */
export interface RtpConstructors {
    /** `new RtpHeader(init)` */
    RtpHeader: new (init: RtpHeaderInit) => RtpHeaderInstance;
    /** `new RtpPacket(header, payload)` — header is an `RtpHeader`, payload the encoded audio `Buffer`. */
    RtpPacket: new (header: RtpHeaderInstance, payload: Buffer) => RtpPacketInstance;
}

/** The `Codec` object on a live `Softphone` (`softphone.codec`) — the fields the RTP loop reads. */
export interface SoftphoneCodec {
    /** RTP payload type id (OPUS/16000 → 109). */
    id: number;
    /** PCM input bytes consumed per 20 ms frame (OPUS/16000 → 640 = 320 samples × 2). */
    packetSize: number;
    /** RTP timestamp increment per 20 ms frame (OPUS/16000 → 320). */
    timestampInterval: number;
    /** Codec name. */
    name: 'OPUS/16000' | 'OPUS/48000/2' | 'PCMU/8000';
}

/**
 * The live per-call session (`ringcentral-softphone`'s `CallSession` / its In/Outbound subclasses) — the
 * subset {@link import('./ringcentral-softphone-call-sdk').RingCentralSoftphoneCallSdk} and
 * {@link import('./realtime-rtp-sender').RealtimeRtpSender} drive. All members are public on the real class.
 */
export interface SoftphoneCallSession {
    /** The SIP `Call-ID` for this call (per-call identifier). Present once the session is established. */
    readonly callId?: string;
    /** The raw SIP `From` header for an inbound call (the caller); parsed for the caller number. */
    readonly remotePeer?: string;
    /** The encoder instance produced by `codec.createEncoder()` — PCM16 frame → encoded payload. */
    readonly encoder: { encode: (pcm: Buffer) => Buffer };
    /** RTP sequence number (seeded random; the sender advances it per frame, wrapping at 65535). */
    sequenceNumber: number;
    /** RTP timestamp (seeded random; the sender advances it by `codec.timestampInterval` per frame). */
    timestamp: number;
    /** RTP SSRC (seeded random; constant for the call). */
    readonly ssrc: number;
    /** Whether the session has been torn down (guards `sendPacket`). */
    readonly disposed?: boolean;
    /** Back-reference to the owning softphone (the RTP loop reads `softphone.codec`). */
    readonly softphone: { codec: SoftphoneCodec };
    /** Encrypt + send one RTP packet over the call's SRTP socket (guards on `disposed`). */
    sendPacket(rtpPacket: RtpPacketInstance): void;
    /** Hang up the call (sends SIP `BYE`). */
    hangup(): Promise<void>;
    /** Blind-transfer the call to another number (SIP REFER). */
    transfer(toNumber: string): Promise<void>;
    /** Send a single DTMF character (`'0'`–`'9'`, `'*'`, `'#'`). */
    sendDTMF(char: string): void;
    /** Subscribe to a recurring session event (`'audioPacket'`, `'dtmf'`). */
    on(event: 'audioPacket', handler: (rtpPacket: { payload: Buffer }) => void): void;
    on(event: 'dtmf', handler: (digit: string) => void): void;
    /** Subscribe to a one-shot session event (`'disposed'`, `'answered'`, `'busy'`). */
    once(event: 'disposed' | 'answered' | 'busy', handler: () => void): void;
}

/** The raw inbound INVITE message the softphone emits on `'invite'` (subset: SIP headers). */
export interface SoftphoneInviteMessage {
    /** SIP headers — at least `From` / `To` / `Call-ID` (header keys are case-insensitive in SIP). */
    headers: Record<string, string>;
}

/**
 * The `Softphone` default export — the subset the handle drives. Construction options are passed to the
 * real constructor; we only call `register` / `call` / `answer` / `decline` / `on` and read `codec`.
 */
export interface SoftphoneClient {
    /** The negotiated codec (set from the constructor `codec` option; default OPUS/16000). */
    readonly codec: SoftphoneCodec;
    /** REGISTER the SIP device so the softphone can place + receive calls. */
    register(): Promise<void>;
    /** Place an OUTBOUND call to a number; resolves to the live (outbound) call session. */
    call(toNumber: string): Promise<SoftphoneCallSession>;
    /** ANSWER an inbound INVITE; resolves to the live (inbound) call session. */
    answer(inviteMessage: SoftphoneInviteMessage): Promise<SoftphoneCallSession>;
    /** Decline an inbound INVITE. */
    decline(inviteMessage: SoftphoneInviteMessage): Promise<void>;
    /** Subscribe to softphone-level events (`'invite'` for inbound calls). */
    on(event: 'invite', handler: (inviteMessage: SoftphoneInviteMessage) => void): void;
    /** Best-effort teardown of the registration / underlying socket (not all versions expose this). */
    destroy?(): void;
}

/**
 * SIP device credentials + codec for one softphone registration. Resolved **upstream** (MJ credential
 * system / provider `Configuration`) from a RingCentral "Other Phone" (BYO-device) registration — never
 * inlined at a call site. Maps 1:1 to the real `Softphone` constructor options.
 */
export interface RingCentralSoftphoneConfig {
    /** SIP domain (e.g. `sip.ringcentral.com`). */
    domain: string;
    /** SIP outbound proxy (`host:port`, e.g. `sip10.ringcentral.com:5096`). */
    outboundProxy: string;
    /** SIP auth username (the device's phone number / extension). */
    username: string;
    /** SIP auth password (resolved upstream). */
    password: string;
    /** SIP authorization id (the device's RC authorization id). */
    authorizationId: string;
    /** Codec to negotiate. Defaults to `OPUS/16000` (clean wideband PCM16, the least-friction realtime path). */
    codec?: 'OPUS/16000' | 'OPUS/48000/2' | 'PCMU/8000';
    /** Skip TLS cert validation (test/sandbox only — never in production). */
    ignoreTlsCertErrors?: boolean;
}
