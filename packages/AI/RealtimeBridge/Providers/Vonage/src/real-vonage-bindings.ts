/**
 * @fileoverview `RealVonageBindings` — a production {@link IVonageClientBindings} implementation over the
 * real **Vonage Voice API** (REST) + the **WebSocket media leg** an NCCO `connect` action opens, plus the
 * **pure** NCCO / media-frame helpers it (and the MJAPI ingress) build on.
 *
 * ## Why an injected client surface (not `import @vonage/server-sdk`)
 * To stay buildable + unit-testable WITHOUT `@vonage/server-sdk` installed and WITHOUT any network, this
 * module does NOT import `@vonage/server-sdk` directly. Instead it depends on a tiny, local structural
 * surface — {@link IVonageVoiceLike} (the few Voice-API calls we use: `createCall(...)`,
 * `updateCall(...)`, `sendDtmf(...)`) and {@link IVonageMediaPump} (the bidirectional WebSocket media
 * pump). Production wires these over the real `@vonage/server-sdk` Voice API + a websocket; tests inject
 * fakes. `@vonage/server-sdk` is declared in `optionalDependencies` (CLAUDE rule 8, category 2 — optional
 * peer SDK loaded only when the provider is configured) and is resolved by the host's native-adapter
 * wiring, never statically imported here.
 *
 * ## The audio contract (T0 codec)
 * Vonage's WebSocket media leg carries **G.711 μ-law @ 8 kHz mono** PSTN audio (the same companded
 * telephony format Twilio Media Streams use); the {@link IVonageClientBindings} seam speaks **PCM16
 * `ArrayBuffer`**. All transcoding goes through the shared T0 codec ({@link muLawToPcm16Buffer} /
 * {@link pcm16ToMuLawBuffer} from `@memberjunction/ai-bridge-base`) — never reimplemented here. The pure
 * helpers {@link parseVonageMediaFrame} / {@link encodeVonageMediaFrame} do the codec mapping so they
 * unit-test with no network.
 *
 * ## Vonage deltas vs Twilio (the point of T2)
 * - **NCCO, not TwiML**: the answer/connect document is a JSON array of actions ({@link buildConnectNcco}),
 *   not an XML `<Connect><Stream>`.
 * - **WebSocket `connect` action**: media rides a `connect` action with an `endpoint` of `type: 'websocket'`
 *   (vs Twilio's `<Stream>`).
 * - **Voice API**: `createCall` is REST `POST /v1/calls`; transfer/hangup are REST `PUT /v1/calls/:uuid`
 *   ({@link buildTransferNccoAction}); DTMF is `PUT /v1/calls/:uuid/dtmf`.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @author MemberJunction.com
 * @see {@link IVonageClientBindings} — the seam this implements.
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §1c, §T2, §4, §5.
 */

import { muLawToPcm16Buffer, pcm16ToMuLawBuffer } from '@memberjunction/ai-bridge-base';
import { IVonageClientBindings } from './vonage-call-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers — NCCO builders + WebSocket media-frame transcode. No network, no SDK.
// ──────────────────────────────────────────────────────────────────────────────

/** One NCCO action (the JSON building block of a Vonage Call Control Object document). */
export interface NccoAction {
    /** The action verb (`'connect'`, `'talk'`, `'input'`, …). */
    action: string;
    /** The `connect`-action endpoints (the websocket media leg for media-bridged calls). */
    endpoint?: NccoEndpoint[];
    /** Arbitrary action-specific fields (e.g. `eventUrl`, `from`) without widening to `any`. */
    [key: string]: unknown;
}

/** One NCCO `connect`-action endpoint. For media bridging this is a `websocket` endpoint. */
export interface NccoEndpoint {
    /** Endpoint type — `'websocket'` for the bidirectional media leg. */
    type: string;
    /** The `wss://…` media URL Vonage opens the bidirectional audio leg to. */
    uri?: string;
    /** The wire content-type (e.g. `'audio/l16;rate=8000'`). */
    'content-type'?: string;
    /** Optional headers Vonage forwards on the websocket handshake (call metadata). */
    headers?: Record<string, unknown>;
}

/**
 * Builds the **NCCO** (Nexmo Call Control Object) that opens a **bidirectional** WebSocket media leg to
 * the agent's media endpoint — the Vonage analogue of Twilio's `<Connect><Stream>`. A `connect` action
 * with a `websocket` endpoint is the full-duplex form: Vonage streams inbound caller audio to the socket
 * AND plays back outbound audio frames the agent writes — the leg the agent needs.
 *
 * Pure + exported so it unit-tests with no network and the MJAPI `POST /telephony/vonage/answer` router
 * can return it verbatim.
 *
 * @param mediaWssUrl The `wss://…` media endpoint Vonage connects the call's audio to.
 * @param contentType The wire content-type (defaults to `audio/l16;rate=8000` — 8 kHz linear, the PSTN rate).
 * @param headers Optional metadata headers Vonage forwards on the websocket handshake.
 * @returns The NCCO document (a JSON array of actions) to return to Vonage.
 */
export function buildConnectNcco(
    mediaWssUrl: string,
    contentType = 'audio/l16;rate=8000',
    headers?: Record<string, unknown>,
): NccoAction[] {
    const endpoint: NccoEndpoint = { type: 'websocket', uri: mediaWssUrl, 'content-type': contentType };
    if (headers) {
        endpoint.headers = headers;
    }
    return [{ action: 'connect', endpoint: [endpoint] }];
}

/**
 * Builds the NCCO `connect` action used to **transfer** a live call to another number — the document
 * supplied to the Voice API `PUT /v1/calls/:uuid` transfer (`{ action: 'transfer', destination: { type:
 * 'ncco', ncco: [...] } }`). Pure + exported so the transfer payload is testable without the SDK.
 *
 * @param toNumber The transfer destination (E.164).
 * @returns A one-action NCCO connecting the call to a `phone` endpoint.
 */
export function buildTransferNccoAction(toNumber: string): NccoAction[] {
    return [{ action: 'connect', endpoint: [{ type: 'phone', number: toNumber } as unknown as NccoEndpoint] }];
}

/** One Vonage WebSocket media frame as it appears (post-JSON-parse) on the media leg. */
export interface VonageMediaFrame {
    /** The event verb — `'media'` for an audio frame, `'websocket:dtmf'` for a DTMF event, `'close'` for end. */
    event: string;
    /** The base64-encoded μ-law audio payload (present on `media` events). */
    payload?: string;
    /** The DTMF payload (present on `websocket:dtmf` events). */
    dtmf?: {
        /** The pressed DTMF digit (`0`-`9`, `*`, `#`). */
        digit: string;
    };
}

/**
 * **Pure** decode of one inbound Vonage media frame to a PCM16 `ArrayBuffer` — base64 μ-law → μ-law bytes
 * → PCM16 via the T0 codec ({@link muLawToPcm16Buffer}). Returns `null` for any non-`media` event or a
 * frame with no payload, so the caller can ignore `websocket:dtmf` / `close` cleanly.
 *
 * @param frame The parsed Vonage media frame object.
 * @returns The decoded PCM16 audio, or `null` when the frame carries no audio payload.
 */
export function parseVonageMediaFrame(frame: VonageMediaFrame): ArrayBuffer | null {
    if (frame.event !== 'media' || !frame.payload) {
        return null;
    }
    const mulaw = base64ToArrayBuffer(frame.payload);
    return muLawToPcm16Buffer(mulaw);
}

/**
 * **Pure** encode of one outbound PCM16 `ArrayBuffer` into the Vonage outbound `media` frame shape —
 * PCM16 → μ-law via the T0 codec ({@link pcm16ToMuLawBuffer}) → base64 payload. The returned object is
 * `JSON.stringify`-ready for the websocket send.
 *
 * @param pcm The agent's outbound PCM16 audio.
 * @returns A Vonage outbound `media` frame ready to JSON-serialize and send.
 */
export function encodeVonageMediaFrame(pcm: ArrayBuffer): VonageMediaFrame {
    const mulaw = pcm16ToMuLawBuffer(pcm);
    return { event: 'media', payload: arrayBufferToBase64(mulaw) };
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
// Injected minimal client surfaces — the seams RealVonageBindings drives. Production
// wires these over the real `@vonage/server-sdk` Voice API + a websocket; tests inject
// fakes. NONE of `@vonage/server-sdk`'s types leak into this package.
// ──────────────────────────────────────────────────────────────────────────────

/** The REST payload {@link IVonageVoiceLike.CreateCall} accepts (the subset we use). */
export interface VonageCreateCallParams {
    /** Destination number (E.164). Maps to Vonage's `to: [{ type: 'phone', number }]`. */
    To: string;
    /** Originating caller-id / DID. Maps to Vonage's `from: { type: 'phone', number }`. */
    From: string;
    /** The NCCO executed when the call connects (our `connect` websocket action). Maps to `ncco`. */
    Ncco: NccoAction[];
    /** Optional event-webhook URL for lifecycle events. Maps to Vonage's `event_url`. */
    EventUrl?: string;
}

/** The REST transfer payload {@link IVonageVoiceLike.TransferCall} accepts. */
export interface VonageTransferParams {
    /** The replacement NCCO transferred into (our `<connect><phone>` analogue). */
    Ncco: NccoAction[];
}

/**
 * The minimal Vonage **Voice API** surface {@link RealVonageBindings} drives — the calls we need:
 * `createCall` (outbound dial), `hangupCall` (end), `transferCall` (`PUT /v1/calls/:uuid` transfer),
 * and `sendDtmf` (`PUT /v1/calls/:uuid/dtmf`). A production wiring implements this over a `@vonage/server-sdk`
 * `Voice` client; tests inject a fake.
 */
export interface IVonageVoiceLike {
    /** Places an outbound call (`POST /v1/calls`); resolves the created call UUID. */
    CreateCall(params: VonageCreateCallParams): Promise<string>;
    /** Hangs up a call (`PUT /v1/calls/:uuid` `{ action: 'hangup' }`) by UUID. */
    HangupCall(callUuid: string): Promise<void>;
    /** Transfers a call (`PUT /v1/calls/:uuid` `{ action: 'transfer', destination }`) by UUID. */
    TransferCall(callUuid: string, params: VonageTransferParams): Promise<void>;
    /** Sends DTMF digits on a call (`PUT /v1/calls/:uuid/dtmf`) by UUID. */
    SendDtmf(callUuid: string, digits: string): Promise<void>;
}

/**
 * The bidirectional WebSocket media pump for a single call's media leg. Production wires this over the
 * accepted websocket for the call UUID; tests inject a fake. The pump speaks raw frame objects — transcode
 * happens in {@link RealVonageBindings} via the pure helpers above.
 */
export interface IVonageMediaPump {
    /** Sends one outbound media frame on the call's websocket. */
    Send(callUuid: string, frame: VonageMediaFrame): void;
    /** Registers the inbound-frame handler for the call's websocket (latest handler wins). */
    OnFrame(callUuid: string, handler: (frame: VonageMediaFrame) => void): void;
}

/** Options {@link RealVonageBindings} needs at construction — the injected client surfaces + the media URL. */
export interface RealVonageBindingsOptions {
    /** The Voice-API client surface (outbound dial / hangup / transfer / DTMF). */
    Voice: IVonageVoiceLike;
    /** The WebSocket media pump (bidirectional audio). */
    MediaPump: IVonageMediaPump;
    /** The `wss://…` media endpoint the call's `connect` NCCO opens. */
    MediaWssUrl: string;
    /** Optional event-webhook URL passed on outbound `createCall`. */
    EventUrl?: string;
    /** Optional wire content-type for the websocket leg (defaults to `audio/l16;rate=8000`). */
    ContentType?: string;
}

/**
 * Production {@link IVonageClientBindings} over the real Vonage Voice API + WebSocket media, expressed
 * against the injected {@link IVonageVoiceLike} / {@link IVonageMediaPump} surfaces so it builds and
 * unit-tests with no `@vonage/server-sdk` install and no network.
 *
 * - `createCall` → Voice REST `createCall` with the NCCO `connect` websocket action.
 * - `acceptInbound` → no REST call (the answer webhook already returned the connect NCCO); the websocket
 *   for the delivered call UUID is what "accepting" means — handled by {@link onWebsocketAudio}.
 * - `hangupCall` / `transferCall` / `playDigits` → Voice REST.
 * - `pushWebsocketAudio` / `onWebsocketAudio` → WebSocket media frames, transcoded through the T0 codec.
 */
export class RealVonageBindings implements IVonageClientBindings {
    private readonly voice: IVonageVoiceLike;
    private readonly mediaPump: IVonageMediaPump;
    private readonly mediaWssUrl: string;
    private readonly eventUrl?: string;
    private readonly contentType?: string;

    constructor(options: RealVonageBindingsOptions) {
        this.voice = options.Voice;
        this.mediaPump = options.MediaPump;
        this.mediaWssUrl = options.MediaWssUrl;
        this.eventUrl = options.EventUrl;
        this.contentType = options.ContentType;
    }

    /** @inheritdoc */
    public async createCall(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const eventUrl = readEventUrl(args) ?? this.eventUrl;
        return this.voice.CreateCall({
            To: toNumber,
            From: fromNumber,
            Ncco: buildConnectNcco(this.mediaWssUrl, this.contentType),
            ...(eventUrl ? { EventUrl: eventUrl } : {}),
        });
    }

    /** @inheritdoc */
    public async acceptInbound(_callUuid: string): Promise<void> {
        // No REST call: the inbound answer webhook already returned the `connect` websocket NCCO that opens
        // the media leg. "Accepting" is consuming that socket — wired via onWebsocketAudio/pushWebsocketAudio.
    }

    /** @inheritdoc */
    public async hangupCall(callUuid: string): Promise<void> {
        await this.voice.HangupCall(callUuid);
    }

    /** @inheritdoc */
    public pushWebsocketAudio(callUuid: string, pcm: ArrayBuffer): void {
        this.mediaPump.Send(callUuid, encodeVonageMediaFrame(pcm));
    }

    /** @inheritdoc */
    public onWebsocketAudio(callUuid: string, cb: (pcm: ArrayBuffer) => void): void {
        this.mediaPump.OnFrame(callUuid, (frame) => {
            const pcm = parseVonageMediaFrame(frame);
            if (pcm) {
                cb(pcm);
            }
        });
    }

    /** @inheritdoc */
    public async playDigits(callUuid: string, digits: string): Promise<void> {
        await this.voice.SendDtmf(callUuid, digits);
    }

    /** @inheritdoc */
    public onDigits(callUuid: string, cb: (digits: string) => void): void {
        this.mediaPump.OnFrame(callUuid, (frame) => {
            const digit = readDtmfDigit(frame);
            if (digit) {
                cb(digit);
            }
        });
    }

    /** @inheritdoc */
    public async transferCall(callUuid: string, toNumber: string): Promise<void> {
        await this.voice.TransferCall(callUuid, { Ncco: buildTransferNccoAction(toNumber) });
    }

    /** @inheritdoc */
    public onCallStatus(callUuid: string, cb: () => void): void {
        this.mediaPump.OnFrame(callUuid, (frame) => {
            if (frame.event === 'close') {
                cb();
            }
        });
    }
}

/** Reads an optional `EventUrl` string out of the loose dial args without widening to `any`. */
function readEventUrl(args?: Record<string, unknown>): string | undefined {
    const value = args?.['EventUrl'];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads a DTMF digit out of a Vonage `websocket:dtmf` event frame, or `undefined` for non-DTMF frames. */
function readDtmfDigit(frame: VonageMediaFrame): string | undefined {
    if (frame.event !== 'websocket:dtmf') {
        return undefined;
    }
    const digit = frame.dtmf?.digit;
    return typeof digit === 'string' && digit.length > 0 ? digit : undefined;
}
