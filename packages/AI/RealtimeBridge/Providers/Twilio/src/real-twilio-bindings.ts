/**
 * @fileoverview `RealTwilioBindings` — a production {@link ITwilioClientBindings} implementation over the
 * real **Twilio Programmable Voice REST API** + **Media Streams** websocket, plus the **pure** TwiML /
 * media-frame helpers it (and the MJAPI ingress) build on.
 *
 * ## Why an injected client surface (not `import twilio from 'twilio'`)
 * To stay buildable + unit-testable WITHOUT the `twilio` npm package installed and WITHOUT any network,
 * this module does NOT import `twilio` directly. Instead it depends on a tiny, local structural surface —
 * {@link ITwilioRestLike} (the few REST calls we use: `calls.create(...)`, `calls(sid).update(...)`) and
 * {@link ITwilioMediaPump} (the bidirectional Media-Streams frame pump). Production wires these over the
 * real `twilio` SDK + a websocket; tests inject fakes. `twilio` is declared in `optionalDependencies`
 * (CLAUDE rule 8, category 2 — optional peer SDK loaded only when the provider is configured) and is
 * resolved by the host's native-adapter wiring, never statically imported here.
 *
 * ## The audio contract (T0 codec)
 * Twilio Media Streams deliver **base64-encoded G.711 μ-law @ 8 kHz mono** on the wire; the
 * {@link ITwilioClientBindings} seam speaks **PCM16 `ArrayBuffer`**. All transcoding goes through the
 * shared T0 codec ({@link muLawToPcm16Buffer} / {@link pcm16ToMuLawBuffer} from
 * `@memberjunction/ai-bridge-base`) — never reimplemented here. The pure helpers
 * {@link parseTwilioMediaFrame} / {@link encodeTwilioMediaFrame} do the base64↔codec mapping so they
 * unit-test with no network.
 *
 * @module @memberjunction/ai-bridge-twilio
 * @author MemberJunction.com
 * @see {@link ITwilioClientBindings} — the seam this implements.
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §2, §3 (T1).
 */

import { muLawToPcm16Buffer, pcm16ToMuLawBuffer } from '@memberjunction/ai-bridge-base';
import { ITwilioClientBindings } from './twilio-call-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers — TwiML + Media-Streams frame transcode. No network, no SDK.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds the outbound-dial / inbound-answer TwiML that opens a **bidirectional** Media-Streams websocket
 * to the agent's media endpoint. `<Connect><Stream>` (not `<Start><Stream>`) is the bidirectional form:
 * Twilio both sends inbound audio AND accepts outbound `media` frames on the same socket — the full-duplex
 * leg the agent needs.
 *
 * Pure + exported so it unit-tests with no network and the MJAPI router can reuse it verbatim.
 *
 * @param streamUrl The `wss://…` Media-Streams endpoint Twilio connects the call's audio to.
 * @returns The TwiML document string to return to Twilio (REST `twiml` param or webhook response body).
 */
export function buildConnectStreamTwiML(streamUrl: string): string {
    const escaped = escapeXmlAttribute(streamUrl);
    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
        '<Connect>' +
        `<Stream url="${escaped}" />` +
        '</Connect>' +
        '</Response>'
    );
}

/** One Twilio Media-Streams `media` frame as it appears (post-JSON-parse) on the websocket. */
export interface TwilioMediaFrame {
    /** Always `'media'` for an audio frame (vs `'start'`/`'stop'`/`'dtmf'` events). */
    event: string;
    /** The Media-Streams stream identifier (present on `media`/`start`/`stop`). */
    streamSid?: string;
    /** The media payload — `payload` is base64-encoded μ-law/8k audio. */
    media?: {
        /** Base64-encoded G.711 μ-law @ 8 kHz mono audio bytes. */
        payload: string;
        /** Monotonic frame timestamp (ms since stream start), Twilio-supplied. */
        timestamp?: string;
        /** Monotonic chunk counter, Twilio-supplied. */
        chunk?: string;
    };
    /** The DTMF payload (present on `dtmf` events) — the pressed key. */
    dtmf?: {
        /** The DTMF digit Twilio detected on the stream (`0`-`9`, `*`, `#`). */
        digit: string;
    };
}

/**
 * **Pure** decode of one inbound Twilio Media-Streams `media` frame to a PCM16 `ArrayBuffer` — base64
 * μ-law → μ-law bytes → PCM16 via the T0 codec ({@link muLawToPcm16Buffer}). Returns `null` for any
 * non-`media` event or a frame with no payload, so the caller can ignore `start`/`stop`/`dtmf` cleanly.
 *
 * @param frame The parsed Media-Streams frame object.
 * @returns The decoded PCM16 audio, or `null` when the frame carries no audio payload.
 */
export function parseTwilioMediaFrame(frame: TwilioMediaFrame): ArrayBuffer | null {
    if (frame.event !== 'media' || !frame.media || !frame.media.payload) {
        return null;
    }
    const mulaw = base64ToArrayBuffer(frame.media.payload);
    return muLawToPcm16Buffer(mulaw);
}

/**
 * **Pure** encode of one outbound PCM16 `ArrayBuffer` into the Twilio Media-Streams outbound `media` frame
 * shape — PCM16 → μ-law via the T0 codec ({@link pcm16ToMuLawBuffer}) → base64 payload. The returned object
 * is `JSON.stringify`-ready for the websocket send.
 *
 * @param pcm The agent's outbound PCM16 audio.
 * @param streamSid The Media-Streams stream SID the frame is addressed to.
 * @returns A Media-Streams outbound `media` frame ready to JSON-serialize and send.
 */
export function encodeTwilioMediaFrame(pcm: ArrayBuffer, streamSid: string): TwilioMediaFrame {
    const mulaw = pcm16ToMuLawBuffer(pcm);
    return {
        event: 'media',
        streamSid,
        media: { payload: arrayBufferToBase64(mulaw) },
    };
}

/** Escapes the five XML attribute-significant characters so a stream URL is safe inside the TwiML attribute. */
function escapeXmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
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
// Injected minimal client surfaces — the seams RealTwilioBindings drives. Production
// wires these over the real `twilio` SDK + a websocket; tests inject fakes. NONE of
// the `twilio` SDK's types leak into this package.
// ──────────────────────────────────────────────────────────────────────────────

/** The REST payload {@link ITwilioRestLike.calls.create} accepts (the subset we use). */
export interface TwilioCreateCallParams {
    /** Destination number (E.164). Maps to Twilio's `to`. */
    To: string;
    /** Originating caller-id / DID. Maps to Twilio's `from`. */
    From: string;
    /** The TwiML executed when the call connects (our `<Connect><Stream>`). Maps to Twilio's `twiml`. */
    Twiml: string;
    /** Optional status-callback URL for lifecycle events. Maps to Twilio's `statusCallback`. */
    StatusCallback?: string;
}

/** The REST update payload {@link ITwilioRestLike} `calls(sid).update` accepts (the subset we use). */
export interface TwilioUpdateCallParams {
    /** New call status — `'completed'` ends the call. */
    Status?: 'completed' | 'canceled';
    /** Replacement TwiML — used for transfer (`<Dial>…`) and DTMF (`<Play digits>…`). */
    Twiml?: string;
}

/**
 * The minimal Twilio REST surface {@link RealTwilioBindings} drives — just the two calls we need:
 * `calls.create(...)` (outbound dial) and `calls(sid).update(...)` (hangup / transfer / DTMF). A
 * production wiring implements this over `twilio(accountSid, authToken).calls`; tests inject a fake.
 */
export interface ITwilioRestLike {
    /** Creates an outbound call; resolves the created Call SID. */
    CreateCall(params: TwilioCreateCallParams): Promise<string>;
    /** Updates an existing call (end / transfer / send-DTMF) by SID. */
    UpdateCall(callSid: string, params: TwilioUpdateCallParams): Promise<void>;
}

/**
 * The bidirectional Media-Streams frame pump for a single call's websocket. Production wires this over the
 * accepted websocket for the Call SID; tests inject a fake. The pump speaks raw frame objects — transcode
 * happens in {@link RealTwilioBindings} via the pure helpers above.
 */
export interface ITwilioMediaPump {
    /** Sends one outbound Media-Streams frame on the call's websocket. */
    Send(callSid: string, frame: TwilioMediaFrame): void;
    /** Registers the inbound-frame handler for the call's websocket (latest handler wins). */
    OnFrame(callSid: string, handler: (frame: TwilioMediaFrame) => void): void;
    /** Registers the call's stream-SID resolver, so outbound frames address the right stream. */
    GetStreamSid(callSid: string): string;
}

/** Options {@link RealTwilioBindings} needs at construction — the injected client surfaces + the stream URL. */
export interface RealTwilioBindingsOptions {
    /** The REST client surface (outbound dial / update). */
    Rest: ITwilioRestLike;
    /** The Media-Streams frame pump (bidirectional audio). */
    MediaPump: ITwilioMediaPump;
    /** The `wss://…` Media-Streams endpoint the call's `<Connect><Stream>` connects to. */
    StreamUrl: string;
    /** Optional status-callback URL passed on outbound `createCall`. */
    StatusCallbackUrl?: string;
}

/**
 * Production {@link ITwilioClientBindings} over the real Twilio REST API + Media Streams, expressed against
 * the injected {@link ITwilioRestLike} / {@link ITwilioMediaPump} surfaces so it builds and unit-tests with
 * no `twilio` install and no network.
 *
 * - `createCall` → REST `calls.create` with the `<Connect><Stream>` TwiML.
 * - `acceptInbound` → no REST call (the inbound webhook already returned the connect TwiML); the websocket
 *   for the delivered Call SID is what "accepting" means — handled by {@link onStreamAudio}.
 * - `completeCall` / `redirectCall` / `playDigits` → REST `calls(sid).update`.
 * - `pushStreamAudio` / `onStreamAudio` → Media-Streams frames, transcoded through the T0 codec.
 */
export class RealTwilioBindings implements ITwilioClientBindings {
    private readonly rest: ITwilioRestLike;
    private readonly mediaPump: ITwilioMediaPump;
    private readonly streamUrl: string;
    private readonly statusCallbackUrl?: string;

    constructor(options: RealTwilioBindingsOptions) {
        this.rest = options.Rest;
        this.mediaPump = options.MediaPump;
        this.streamUrl = options.StreamUrl;
        this.statusCallbackUrl = options.StatusCallbackUrl;
    }

    /** @inheritdoc */
    public async createCall(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const statusCallback = readStatusCallback(args) ?? this.statusCallbackUrl;
        return this.rest.CreateCall({
            To: toNumber,
            From: fromNumber,
            Twiml: buildConnectStreamTwiML(this.streamUrl),
            ...(statusCallback ? { StatusCallback: statusCallback } : {}),
        });
    }

    /** @inheritdoc */
    public async acceptInbound(_callSid: string): Promise<void> {
        // No REST call: the inbound voice webhook already returned the <Connect><Stream> TwiML that connects
        // the media socket. "Accepting" is consuming that socket — wired via onStreamAudio/pushStreamAudio.
    }

    /** @inheritdoc */
    public async completeCall(callSid: string): Promise<void> {
        await this.rest.UpdateCall(callSid, { Status: 'completed' });
    }

    /** @inheritdoc */
    public pushStreamAudio(callSid: string, pcm: ArrayBuffer): void {
        const streamSid = this.mediaPump.GetStreamSid(callSid);
        this.mediaPump.Send(callSid, encodeTwilioMediaFrame(pcm, streamSid));
    }

    /** @inheritdoc */
    public onStreamAudio(callSid: string, cb: (pcm: ArrayBuffer) => void): void {
        this.mediaPump.OnFrame(callSid, (frame) => {
            const pcm = parseTwilioMediaFrame(frame);
            if (pcm) {
                cb(pcm);
            }
        });
    }

    /** @inheritdoc */
    public async playDigits(callSid: string, digits: string): Promise<void> {
        await this.rest.UpdateCall(callSid, { Twiml: buildPlayDigitsTwiML(digits) });
    }

    /** @inheritdoc */
    public onDigits(callSid: string, cb: (digits: string) => void): void {
        this.mediaPump.OnFrame(callSid, (frame) => {
            const digit = readDtmfDigit(frame);
            if (digit) {
                cb(digit);
            }
        });
    }

    /** @inheritdoc */
    public async redirectCall(callSid: string, toNumber: string): Promise<void> {
        await this.rest.UpdateCall(callSid, { Twiml: buildDialTwiML(toNumber) });
    }

    /** @inheritdoc */
    public onCallStatus(callSid: string, cb: () => void): void {
        this.mediaPump.OnFrame(callSid, (frame) => {
            if (frame.event === 'stop') {
                cb();
            }
        });
    }
}

/** Builds the `<Play digits>` TwiML used to emit DTMF tones on a live call (REST update). */
export function buildPlayDigitsTwiML(digits: string): string {
    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
        `<Play digits="${escapeXmlAttribute(digits)}" />` +
        '</Response>'
    );
}

/** Builds the `<Dial>` TwiML used to transfer a live call to another number (REST update). */
export function buildDialTwiML(toNumber: string): string {
    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
        `<Dial>${escapeXmlAttribute(toNumber)}</Dial>` +
        '</Response>'
    );
}

/** Reads an optional `StatusCallback` string out of the loose dial args without widening to `any`. */
function readStatusCallback(args?: Record<string, unknown>): string | undefined {
    const value = args?.['StatusCallback'];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads a DTMF digit out of a Media-Streams `dtmf` event frame, or `undefined` for non-DTMF frames. */
function readDtmfDigit(frame: TwilioMediaFrame): string | undefined {
    if (frame.event !== 'dtmf') {
        return undefined;
    }
    const digit = frame.dtmf?.digit;
    return typeof digit === 'string' && digit.length > 0 ? digit : undefined;
}
