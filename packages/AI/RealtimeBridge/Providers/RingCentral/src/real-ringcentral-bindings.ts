/**
 * @fileoverview `RealRingCentralBindings` — a production {@link IRingCentralClientBindings} implementation
 * over the real **RingCentral Call Control API** (REST) + its **media stream**, plus the **pure**
 * Call-Control payload / media-frame helpers it (and the MJAPI ingress) build on.
 *
 * ## Why an injected client surface (not `import @ringcentral/sdk`)
 * To stay buildable + unit-testable WITHOUT `@ringcentral/sdk` installed and WITHOUT any network, this
 * module does NOT import `@ringcentral/sdk` directly. Instead it depends on a tiny, local structural
 * surface — {@link IRingCentralCallControlLike} (the Call-Control calls we use: `createSession(...)`,
 * `answerParty(...)`, `dropSession(...)`, `playDigits(...)`, `transferParty(...)`) and
 * {@link IRingCentralMediaPump} (the bidirectional media-stream frame pump). Production wires these over
 * the real `@ringcentral/sdk` Call-Control REST client + a media stream; tests inject fakes.
 * `@ringcentral/sdk` is declared in `optionalDependencies` (CLAUDE rule 8, category 2 — optional peer SDK
 * loaded only when the provider is configured) and is resolved by the host's native-adapter wiring, never
 * statically imported here.
 *
 * ## The audio contract (T0 codec)
 * RingCentral's media stream carries **G.711 μ-law @ 8 kHz mono** PSTN audio (the same companded
 * telephony format Twilio Media Streams / Vonage use); the {@link IRingCentralClientBindings} seam speaks
 * **PCM16 `ArrayBuffer`**. All transcoding goes through the shared T0 codec ({@link muLawToPcm16Buffer} /
 * {@link pcm16ToMuLawBuffer} from `@memberjunction/ai-bridge-base`) — never reimplemented here. The pure
 * helpers {@link parseRingCentralMediaFrame} / {@link encodeRingCentralMediaFrame} do the base64↔codec
 * mapping so they unit-test with no network.
 *
 * ## RingCentral deltas vs Twilio (the point of T3)
 * - **Call Control API, session vocabulary**: place/answer/drop/transfer operate on a **telephony
 *   session** and its **parties** (`createSession` → `POST .../telephony/sessions`, `answerParty` →
 *   `POST .../sessions/{id}/parties/{partyId}/answer`, `dropSession` → `DELETE .../sessions/{id}`), built
 *   by the pure {@link buildCreateSessionPayload} / {@link buildTransferPartyPayload} helpers.
 * - **OAuth (JWT/3-legged)**: auth rides the REST client (resolved upstream), not a per-request signature.
 * - **Media stream**: bidirectional audio rides the session's media stream (vs Twilio `<Stream>`).
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 * @see {@link IRingCentralClientBindings} — the seam this implements.
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §1c, §T3, §4, §5.
 */

import { muLawToPcm16Buffer, pcm16ToMuLawBuffer } from '@memberjunction/ai-bridge-base';
import { IRingCentralClientBindings } from './ringcentral-call-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers — Call-Control payload builders + media-frame transcode. No network, no SDK.
// ──────────────────────────────────────────────────────────────────────────────

/** The Call-Control `POST .../telephony/sessions` request body (the subset we build). */
export interface CreateSessionPayload {
    /** The dialed destination party (E.164). */
    to: { phoneNumber: string };
    /** The originating caller-id / DID party. */
    from: { phoneNumber: string };
    /** The media-stream endpoint the session bridges its audio to (the agent's media leg). */
    streamUrl?: string;
}

/**
 * Builds the Call-Control **create-session** payload that opens a telephony session whose media leg
 * streams to the agent's media endpoint — the RingCentral analogue of Twilio's `<Connect><Stream>`. Pure +
 * exported so it unit-tests with no network and the MJAPI router can reuse it verbatim.
 *
 * @param toNumber Destination number (E.164).
 * @param fromNumber The agent's RingCentral DID / caller-id the call originates from.
 * @param streamUrl The media-stream endpoint the session bridges its audio to.
 * @returns The `POST .../telephony/sessions` request body.
 */
export function buildCreateSessionPayload(
    toNumber: string,
    fromNumber: string,
    streamUrl: string,
): CreateSessionPayload {
    return { to: { phoneNumber: toNumber }, from: { phoneNumber: fromNumber }, streamUrl };
}

/** The Call-Control party-`transfer` request body. */
export interface TransferPartyPayload {
    /** The transfer destination party (E.164 number or extension). */
    phoneNumber: string;
}

/**
 * Builds the Call-Control **party-transfer** payload (`POST .../sessions/{id}/parties/{partyId}/transfer`)
 * used to supervise/transfer a live call to another number. Pure + exported so the transfer payload is
 * testable without the SDK.
 *
 * @param toNumber The transfer destination (E.164 / extension).
 * @returns The party-transfer request body.
 */
export function buildTransferPartyPayload(toNumber: string): TransferPartyPayload {
    return { phoneNumber: toNumber };
}

/** One RingCentral media-stream frame as it appears (post-JSON-parse) on the session's media stream. */
export interface RingCentralMediaFrame {
    /** The event verb — `'media'` for an audio frame, `'dtmf'` for a DTMF event, `'stop'` for end. */
    event: string;
    /** The telephony session id (present on `media`/`dtmf`/`stop` events). */
    sessionId?: string;
    /** The media payload — `data` is base64-encoded μ-law/8k audio (present on `media` events). */
    media?: {
        /** Base64-encoded G.711 μ-law @ 8 kHz mono audio bytes. */
        data: string;
    };
    /** The DTMF payload (present on `dtmf` events). */
    dtmf?: {
        /** The pressed DTMF digit (`0`-`9`, `*`, `#`). */
        digit: string;
    };
}

/**
 * **Pure** decode of one inbound RingCentral media frame to a PCM16 `ArrayBuffer` — base64 μ-law → μ-law
 * bytes → PCM16 via the T0 codec ({@link muLawToPcm16Buffer}). Returns `null` for any non-`media` event or
 * a frame with no payload, so the caller can ignore `dtmf`/`stop` cleanly.
 *
 * @param frame The parsed media-stream frame object.
 * @returns The decoded PCM16 audio, or `null` when the frame carries no audio payload.
 */
export function parseRingCentralMediaFrame(frame: RingCentralMediaFrame): ArrayBuffer | null {
    if (frame.event !== 'media' || !frame.media || !frame.media.data) {
        return null;
    }
    const mulaw = base64ToArrayBuffer(frame.media.data);
    return muLawToPcm16Buffer(mulaw);
}

/**
 * **Pure** encode of one outbound PCM16 `ArrayBuffer` into the RingCentral outbound `media` frame shape —
 * PCM16 → μ-law via the T0 codec ({@link pcm16ToMuLawBuffer}) → base64 payload. The returned object is
 * `JSON.stringify`-ready for the media-stream send.
 *
 * @param pcm The agent's outbound PCM16 audio.
 * @param sessionId The telephony session id the frame is addressed to.
 * @returns A media-stream outbound `media` frame ready to JSON-serialize and send.
 */
export function encodeRingCentralMediaFrame(pcm: ArrayBuffer, sessionId: string): RingCentralMediaFrame {
    const mulaw = pcm16ToMuLawBuffer(pcm);
    return { event: 'media', sessionId, media: { data: arrayBufferToBase64(mulaw) } };
}

/** Decodes a base64 string to a fresh `ArrayBuffer` (Node `Buffer` path; works in any Node runtime). */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const buf = Buffer.from(base64, 'base64');
    const out = new ArrayBuffer(buf.length);
    new Uint8Array(out).set(buf);
    return out;
}

/** Encodes an `ArrayBuffer` to a base64 string (Node `Buffer` path; works in any Node runtime). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    return Buffer.from(new Uint8Array(buffer)).toString('base64');
}

// ──────────────────────────────────────────────────────────────────────────────
// Injected minimal client surfaces — the seams RealRingCentralBindings drives. Production
// wires these over the real `@ringcentral/sdk` Call-Control REST client + a media stream;
// tests inject fakes. NONE of `@ringcentral/sdk`'s types leak into this package.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The minimal RingCentral **Call Control** surface {@link RealRingCentralBindings} drives — the calls we
 * need: `CreateSession` (outbound dial), `AnswerParty` (inbound answer), `DropSession` (hangup),
 * `PlayDigits` (DTMF), `TransferParty` (transfer). A production wiring implements this over a
 * `@ringcentral/sdk` platform client (OAuth/JWT resolved upstream); tests inject a fake.
 */
export interface IRingCentralCallControlLike {
    /** Creates a telephony session (`POST .../telephony/sessions`); resolves the created session id. */
    CreateSession(payload: CreateSessionPayload): Promise<string>;
    /** Answers the session's inbound party (`POST .../sessions/{id}/parties/{partyId}/answer`). */
    AnswerParty(sessionId: string): Promise<void>;
    /** Drops the telephony session (`DELETE .../telephony/sessions/{id}`). */
    DropSession(sessionId: string): Promise<void>;
    /** Sends DTMF digits on the session's party (`POST .../parties/{partyId}/play` / dtmf). */
    PlayDigits(sessionId: string, digits: string): Promise<void>;
    /** Transfers the session's party (`POST .../parties/{partyId}/transfer`). */
    TransferParty(sessionId: string, payload: TransferPartyPayload): Promise<void>;
}

/**
 * The bidirectional media-stream frame pump for a single session's media stream. Production wires this over
 * the accepted media stream for the session id; tests inject a fake. The pump speaks raw frame objects —
 * transcode happens in {@link RealRingCentralBindings} via the pure helpers above.
 */
export interface IRingCentralMediaPump {
    /** Sends one outbound media frame on the session's media stream. */
    Send(sessionId: string, frame: RingCentralMediaFrame): void;
    /** Registers the inbound-frame handler for the session's media stream (latest handler wins). */
    OnFrame(sessionId: string, handler: (frame: RingCentralMediaFrame) => void): void;
}

/** Options {@link RealRingCentralBindings} needs at construction — the injected client surfaces + the stream URL. */
export interface RealRingCentralBindingsOptions {
    /** The Call-Control client surface (create/answer/drop/play/transfer). */
    CallControl: IRingCentralCallControlLike;
    /** The media-stream frame pump (bidirectional audio). */
    MediaPump: IRingCentralMediaPump;
    /** The media-stream endpoint the session bridges its audio to (the agent's media leg). */
    StreamUrl: string;
}

/**
 * Production {@link IRingCentralClientBindings} over the real RingCentral Call Control API + media stream,
 * expressed against the injected {@link IRingCentralCallControlLike} / {@link IRingCentralMediaPump}
 * surfaces so it builds and unit-tests with no `@ringcentral/sdk` install and no network.
 *
 * - `createSession` → Call-Control `CreateSession` with the create-session payload.
 * - `answerSession` → Call-Control `AnswerParty`.
 * - `dropSession` / `transferSession` / `playDigits` → Call-Control REST.
 * - `pushStreamAudio` / `onStreamAudio` → media-stream frames, transcoded through the T0 codec.
 */
export class RealRingCentralBindings implements IRingCentralClientBindings {
    private readonly callControl: IRingCentralCallControlLike;
    private readonly mediaPump: IRingCentralMediaPump;
    private readonly streamUrl: string;

    constructor(options: RealRingCentralBindingsOptions) {
        this.callControl = options.CallControl;
        this.mediaPump = options.MediaPump;
        this.streamUrl = options.StreamUrl;
    }

    /** @inheritdoc */
    public async createSession(toNumber: string, fromNumber: string, _args?: Record<string, unknown>): Promise<string> {
        return this.callControl.CreateSession(buildCreateSessionPayload(toNumber, fromNumber, this.streamUrl));
    }

    /** @inheritdoc */
    public async answerSession(sessionId: string): Promise<void> {
        await this.callControl.AnswerParty(sessionId);
    }

    /** @inheritdoc */
    public async dropSession(sessionId: string): Promise<void> {
        await this.callControl.DropSession(sessionId);
    }

    /** @inheritdoc */
    public pushStreamAudio(sessionId: string, pcm: ArrayBuffer): void {
        this.mediaPump.Send(sessionId, encodeRingCentralMediaFrame(pcm, sessionId));
    }

    /** @inheritdoc */
    public onStreamAudio(sessionId: string, cb: (pcm: ArrayBuffer) => void): void {
        this.mediaPump.OnFrame(sessionId, (frame) => {
            const pcm = parseRingCentralMediaFrame(frame);
            if (pcm) {
                cb(pcm);
            }
        });
    }

    /** @inheritdoc */
    public async playDigits(sessionId: string, digits: string): Promise<void> {
        await this.callControl.PlayDigits(sessionId, digits);
    }

    /** @inheritdoc */
    public onDigits(sessionId: string, cb: (digits: string) => void): void {
        this.mediaPump.OnFrame(sessionId, (frame) => {
            const digit = readDtmfDigit(frame);
            if (digit) {
                cb(digit);
            }
        });
    }

    /** @inheritdoc */
    public async transferSession(sessionId: string, toNumber: string): Promise<void> {
        await this.callControl.TransferParty(sessionId, buildTransferPartyPayload(toNumber));
    }

    /** @inheritdoc */
    public onSessionStatus(sessionId: string, cb: () => void): void {
        this.mediaPump.OnFrame(sessionId, (frame) => {
            if (frame.event === 'stop') {
                cb();
            }
        });
    }
}

/** Reads a DTMF digit out of a media-stream `dtmf` event frame, or `undefined` for non-DTMF frames. */
function readDtmfDigit(frame: RingCentralMediaFrame): string | undefined {
    if (frame.event !== 'dtmf') {
        return undefined;
    }
    const digit = frame.dtmf?.digit;
    return typeof digit === 'string' && digit.length > 0 ? digit : undefined;
}
