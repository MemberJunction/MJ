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
 * ## The audio contract (L16 PCM, NOT μ-law — this is where Vonage diverges hard from Twilio)
 * Vonage's WebSocket media leg carries audio as **raw binary WebSocket frames of 16-bit little-endian
 * L16 PCM** at the `content-type` rate (we negotiate `audio/l16;rate=8000`); NON-audio events (DTMF,
 * `websocket:connected`, close) arrive as **JSON text frames**. There is NO base64 envelope and NO
 * companding — the Twilio Media Streams `{event:'media',payload:<base64 μ-law>}` shape does not apply
 * here. At `rate=8000` the inbound binary already IS the PCM16 the {@link IVonageClientBindings} seam
 * speaks, so audio passes straight through; the carrier↔model resample lives downstream, exactly as on
 * the Twilio path after μ-law decode. The host ingress owns the binary-vs-text split on the wire and
 * pumps audio as `ArrayBuffer`s through {@link IVonageMediaPump}; {@link parseVonageControlEvent} parses
 * the JSON text events.
 *
 * ## Vonage deltas vs Twilio (the point of T2)
 * - **NCCO, not TwiML**: the answer/connect document is a JSON array of actions ({@link buildConnectNcco}),
 *   not an XML `<Connect><Stream>`.
 * - **WebSocket `connect` action**: media rides a `connect` action with an `endpoint` of `type: 'websocket'`
 *   (vs Twilio's `<Stream>`).
 * - **Binary L16 media, JSON text events**: audio is raw binary PCM (no base64, no μ-law); DTMF/close are
 *   JSON text frames with `digit` at the TOP level (`{event:'websocket:dtmf',digit:'5'}`) — vs Twilio's
 *   single all-JSON channel.
 * - **Voice API**: `createCall` is REST `POST /v1/calls`; transfer/hangup are REST `PUT /v1/calls/:uuid`
 *   ({@link buildTransferNccoAction}); DTMF is `PUT /v1/calls/:uuid/dtmf`.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @author MemberJunction.com
 * @see {@link IVonageClientBindings} — the seam this implements.
 * @see `/plans/realtime/bridges-and-widget/telephony-vendor-bindings.md` §1c, §T2, §4, §5.
 */

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

/**
 * One Vonage **control event** — a JSON *text* frame on the media leg (NOT audio; audio is raw binary).
 * Vonage sends `websocket:connected` on open, `websocket:dtmf` for keypad input (with `digit` at the TOP
 * level, not nested), and a close event when the leg ends.
 */
export interface VonageControlEvent {
    /** The event verb — e.g. `'websocket:connected'`, `'websocket:dtmf'`, `'close'`. */
    event: string;
    /** The pressed DTMF digit (`0`-`9`, `*`, `#`) — present on `websocket:dtmf` events, at the top level. */
    digit?: string;
    /** The DTMF press duration in ms — present on `websocket:dtmf` events. */
    duration?: number;
    /** Any other event fields, typed without widening to `any`. */
    [field: string]: unknown;
}

/**
 * **Pure** parse of one Vonage media-leg **text** frame (the JSON control events). Returns the parsed
 * {@link VonageControlEvent}, or `null` when the text is not a JSON object carrying an `event` string.
 * Audio frames are binary and never reach this function — the host ingress routes binary vs. text and
 * pumps audio straight through {@link IVonageMediaPump} as PCM `ArrayBuffer`s.
 *
 * @param text The UTF-8 text-frame payload Vonage sent.
 * @returns The parsed control event, or `null` when the frame is not a recognizable JSON event.
 */
export function parseVonageControlEvent(text: string): VonageControlEvent | null {
    try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && typeof (parsed as { event?: unknown }).event === 'string') {
            return parsed as VonageControlEvent;
        }
        return null;
    } catch {
        return null;
    }
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
 * The bidirectional WebSocket media pump for a single call's media leg, modeling Vonage's binary-audio /
 * text-event split. Production wires this over the accepted websocket for the call UUID (binary frames =
 * L16 PCM audio, text frames = JSON control events); tests inject a fake. Audio is raw PCM `ArrayBuffer`s
 * — no envelope, no transcode — so {@link RealVonageBindings} just forwards bytes.
 */
export interface IVonageMediaPump {
    /** Sends one outbound PCM16 audio frame as a BINARY websocket message (raw L16 PCM, no envelope). */
    SendAudio(callUuid: string, pcm: ArrayBuffer): void;
    /** Registers the inbound PCM16 audio handler for the call's binary media frames. */
    OnAudio(callUuid: string, handler: (pcm: ArrayBuffer) => void): void;
    /** Registers the inbound control-event handler for the call's JSON text frames (DTMF / connected / close). */
    OnEvent(callUuid: string, handler: (event: VonageControlEvent) => void): void;
    /** Discards the call's queued outbound audio (sends Vonage's `{"action":"clear"}` text command). */
    Clear(callUuid: string): void;
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
        // Raw binary L16 PCM out — no μ-law, no base64, no JSON envelope (that's Twilio's wire, not Vonage's).
        this.mediaPump.SendAudio(callUuid, pcm);
    }

    /** @inheritdoc */
    public onWebsocketAudio(callUuid: string, cb: (pcm: ArrayBuffer) => void): void {
        // Inbound binary frames at rate=8000 already ARE PCM16 — pass straight through (resample is downstream).
        this.mediaPump.OnAudio(callUuid, cb);
    }

    /** @inheritdoc */
    public async playDigits(callUuid: string, digits: string): Promise<void> {
        await this.voice.SendDtmf(callUuid, digits);
    }

    /** @inheritdoc */
    public onDigits(callUuid: string, cb: (digits: string) => void): void {
        this.mediaPump.OnEvent(callUuid, (event) => {
            const digit = readDtmfDigit(event);
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
        this.mediaPump.OnEvent(callUuid, (event) => {
            if (event.event === 'close' || event.event === 'websocket:closed') {
                cb();
            }
        });
    }

    /** @inheritdoc — barge-in: tell Vonage to discard its queued outbound audio so the agent stops mid-utterance. */
    public flushOutbound(callUuid: string): void {
        this.mediaPump.Clear(callUuid);
    }
}

/** Reads an optional `EventUrl` string out of the loose dial args without widening to `any`. */
function readEventUrl(args?: Record<string, unknown>): string | undefined {
    const value = args?.['EventUrl'];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Reads a DTMF digit out of a Vonage `websocket:dtmf` control event, or `undefined` for non-DTMF events.
 * Vonage carries the digit at the TOP level (`{event:'websocket:dtmf',digit:'5',duration:260}`), unlike
 * Twilio's nested shape — reading `event.digit`, not `event.dtmf.digit`, is the whole point of this fix.
 */
function readDtmfDigit(event: VonageControlEvent): string | undefined {
    if (event.event !== 'websocket:dtmf') {
        return undefined;
    }
    const digit = event.digit;
    return typeof digit === 'string' && digit.length > 0 ? digit : undefined;
}
