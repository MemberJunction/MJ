/**
 * @fileoverview The **Vonage** binding of the telephony call SDK seam — `VonageCallSdk` +
 * `VonageCallSdkFactory`.
 *
 * {@link VonageCallSdk} implements the platform-agnostic {@link ITelephonyCallSdk} (from
 * `@memberjunction/ai-bridge-base`) over the **Vonage Voice API + websocket media**, so
 * {@link import('./vonage-bridge').VonageBridge} drives a real phone call without ever importing the
 * Vonage SDK directly. As shipped, every operation throws an explicit **"bind the real Vonage client"**
 * error — the real Vonage binding is a documented deployment seam (below). Production supplies the bound
 * client via {@link VonageCallSdk}'s constructor / the factory; tests inject a `FakeVonageCallSdk`.
 *
 * ## How the Vonage operations map (production binding — deployment TODO)
 * Vonage has two halves: the **Voice API** (place/modify/hang-up calls, driven by NCCO documents) and a
 * **websocket** media leg the call's NCCO `connect`s to (bidirectional realtime audio + DTMF events).
 * This SDK adapter sits over both:
 *
 * | {@link ITelephonyCallSdk} op | Vonage binding |
 * |---|---|
 * | {@link VonageCallSdk.dial} (outbound) | Voice API `POST /v1/calls` with an NCCO whose `connect` action opens a bidirectional websocket to the agent's media leg. Returns the call UUID. |
 * | {@link VonageCallSdk.answer} (inbound) | The inbound answer webhook (a call to the agent's number) returns an NCCO with a `connect` websocket action; "answering" = accepting that websocket for the delivered call UUID. |
 * | {@link VonageCallSdk.hangup} | Voice API `PUT /v1/calls/:uuid` with `{ action: 'hangup' }`. |
 * | {@link VonageCallSdk.sendAudioFrame} | An outbound audio frame on the call's websocket media leg (the agent's voice). |
 * | {@link VonageCallSdk.onAudioFrame} | Inbound websocket audio frames — what the agent hears (single remote party). |
 * | {@link VonageCallSdk.sendDtmf} | Voice API `PUT /v1/calls/:uuid/dtmf` with `{ digits }` (or an NCCO `input` action). |
 * | {@link VonageCallSdk.onDtmf} | NCCO `input` (`dtmf`) results delivered to the event webhook. |
 * | {@link VonageCallSdk.transfer} | Voice API `PUT /v1/calls/:uuid` with `{ action: 'transfer', destination: { type: 'ncco', ncco: [{ action: 'connect', endpoint: [...] }] } }`. |
 * | {@link VonageCallSdk.onCallEnded} | The event webhook for `completed` / `failed` / `rejected` / `cancelled`, OR the websocket `close` event. |
 *
 * Binding the real Vonage client is a thin adapter that supplies an {@link IVonageClientBindings}
 * implementation (Voice API + websocket) to {@link VonageCallSdk}; the driver and its tests do not change.
 * **None of the `@vonage/server-sdk` types leak into this package.**
 *
 * Credentials (API key, API secret, the Voice application id + private key, the websocket media URL)
 * resolve through MJ's credential system referenced by the provider `Configuration` — never inline
 * secrets.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @see {@link ITelephonyCallSdk} — the platform-agnostic seam this binds.
 * @see `/plans/realtime/realtime-bridges-architecture.md` §8 (Vonage capability row) and §9 Phase 6.
 */

import { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';

/**
 * The minimal Vonage client surface {@link VonageCallSdk} drives. A production deployment implements
 * this over the real `@vonage/server-sdk` (Voice API) + a websocket media handler; this package never
 * imports `@vonage/server-sdk` so it builds and tests with no network. When no bindings are supplied,
 * {@link VonageCallSdk} throws the explicit "bind the real Vonage client" error from every operation.
 *
 * The shapes are intentionally tiny and provider-neutral at the value level (strings / byte buffers) so
 * the Vonage SDK's types do not leak into the bridge package.
 */
export interface IVonageClientBindings {
    /**
     * Places an outbound call via the Vonage Voice API (`POST /v1/calls`) with an NCCO that `connect`s a
     * bidirectional websocket to the agent's media leg.
     *
     * @param toNumber Destination number (E.164).
     * @param fromNumber The agent's Vonage number / verified caller-id the call originates from.
     * @param args Provider-specific options (event-webhook URL, websocket media URL, recording flags, …).
     * @returns The created call UUID.
     */
    createCall(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string>;

    /**
     * Accepts the websocket media leg for an inbound call already delivered by the answer webhook.
     *
     * @param callUuid The inbound call UUID from the webhook.
     */
    acceptInbound(callUuid: string): Promise<void>;

    /**
     * Ends the call (Voice API `PUT /v1/calls/:uuid` with `{ action: 'hangup' }`).
     *
     * @param callUuid The call UUID to hang up.
     */
    hangupCall(callUuid: string): Promise<void>;

    /**
     * Pushes one outbound audio payload onto the call's websocket media leg (the agent's voice).
     *
     * @param callUuid The call UUID whose media leg to write to.
     * @param pcm The audio bytes (the adapter encodes to the websocket media frame).
     */
    pushWebsocketAudio(callUuid: string, pcm: ArrayBuffer): void;

    /**
     * Registers the inbound websocket audio callback for the call (what the agent hears).
     *
     * @param callUuid The call UUID whose inbound media to subscribe to.
     * @param cb Invoked with each inbound PCM audio frame.
     */
    onWebsocketAudio(callUuid: string, cb: (pcm: ArrayBuffer) => void): void;

    /**
     * Sends DTMF digits on the call (Voice API `PUT /v1/calls/:uuid/dtmf` with `{ digits }`).
     *
     * @param callUuid The call UUID.
     * @param digits The DTMF digit string.
     */
    playDigits(callUuid: string, digits: string): Promise<void>;

    /**
     * Registers the inbound DTMF callback (NCCO `input`/`dtmf` results delivered to the event webhook).
     *
     * @param callUuid The call UUID.
     * @param cb Invoked with each received DTMF digit string.
     */
    onDigits(callUuid: string, cb: (digits: string) => void): void;

    /**
     * Transfers the live call (Voice API `PUT /v1/calls/:uuid` with `{ action: 'transfer', destination:
     * { type: 'ncco', ncco: [...] } }`).
     *
     * @param callUuid The call UUID to redirect.
     * @param toNumber The transfer destination.
     */
    transferCall(callUuid: string, toNumber: string): Promise<void>;

    /**
     * Registers the call-ended callback (event-webhook `completed`/`failed`/`rejected`/`cancelled` or the
     * websocket `close` event).
     *
     * @param callUuid The call UUID.
     * @param cb Invoked when the call ends.
     */
    onCallStatus(callUuid: string, cb: () => void): void;

    /**
     * Discards the audio Vonage has QUEUED on the media leg (sends the `{"action":"clear"}` websocket
     * command). Called on barge-in so the agent's not-yet-played voice is dropped instead of draining
     * Vonage's deep (~60s) playback queue over the caller's new turn.
     *
     * @param callUuid The call UUID whose queued outbound audio to flush.
     */
    flushOutbound(callUuid: string): void;
}

/** The default bindings used when none are supplied — every operation throws the bind-me error. */
const UNBOUND_BINDINGS: IVonageClientBindings = {
    createCall: () => throwUnbound('createCall (outbound dial)'),
    acceptInbound: () => throwUnbound('acceptInbound (inbound answer)'),
    hangupCall: () => throwUnbound('hangupCall (hangup)'),
    pushWebsocketAudio: () => throwUnboundVoid('pushWebsocketAudio (outbound media)'),
    onWebsocketAudio: () => throwUnboundVoid('onWebsocketAudio (inbound media)'),
    playDigits: () => throwUnbound('playDigits (send DTMF)'),
    onDigits: () => throwUnboundVoid('onDigits (receive DTMF)'),
    transferCall: () => throwUnbound('transferCall (transfer)'),
    onCallStatus: () => throwUnboundVoid('onCallStatus (call ended)'),
    flushOutbound: () => throwUnboundVoid('flushOutbound (clear queued audio)'),
};

function throwUnbound(op: string): never {
    throw new Error(
        `VonageCallSdk has no real Vonage client bound (operation '${op}'). Construct it with an ` +
            'IVonageClientBindings over the real @vonage/server-sdk (Voice API + websocket media), or inject a fake in tests.',
    );
}

function throwUnboundVoid(op: string): never {
    throwUnbound(op);
}

/**
 * Vonage's implementation of the {@link ITelephonyCallSdk} telephony seam over the **Vonage Voice API +
 * websocket media**. {@link import('./vonage-bridge').VonageBridge} drives this; production constructs it
 * with real {@link IVonageClientBindings}, tests inject a `FakeVonageCallSdk` directly (no need for this
 * adapter at all in tests).
 *
 * The adapter tracks the active call UUID so the per-call websocket / Voice API operations can be
 * addressed. It never imports the `@vonage/server-sdk` SDK — all Vonage specifics live behind
 * {@link IVonageClientBindings}.
 */
export class VonageCallSdk implements ITelephonyCallSdk {
    /** The active call's UUID once dialled/answered, so per-call operations can address it. */
    private activeCallUuid: string | null = null;

    private audioCb?: (pcm: ArrayBuffer) => void;
    private dtmfCb?: (digits: string) => void;
    private endedCb?: () => void;

    /**
     * @param bindings The real Vonage client bindings (Voice API + websocket media). Defaults to an
     *   unbound implementation whose every method throws the explicit "bind the real Vonage client" error.
     */
    constructor(private readonly bindings: IVonageClientBindings = UNBOUND_BINDINGS) {}

    /** @inheritdoc */
    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const uuid = await this.bindings.createCall(toNumber, fromNumber, args);
        this.bindCall(uuid);
        return uuid;
    }

    /** @inheritdoc */
    public async answer(callId: string): Promise<void> {
        await this.bindings.acceptInbound(callId);
        this.bindCall(callId);
    }

    /** @inheritdoc */
    public async hangup(callId: string): Promise<void> {
        await this.bindings.hangupCall(callId);
        this.activeCallUuid = null;
    }

    /** @inheritdoc */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        if (this.activeCallUuid) {
            this.bindings.pushWebsocketAudio(this.activeCallUuid, pcm);
        }
    }

    /** @inheritdoc */
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioCb = cb;
        if (this.activeCallUuid) {
            this.bindings.onWebsocketAudio(this.activeCallUuid, cb);
        }
    }

    /** @inheritdoc */
    public async sendDtmf(digits: string): Promise<void> {
        if (this.activeCallUuid) {
            await this.bindings.playDigits(this.activeCallUuid, digits);
        }
    }

    /** @inheritdoc */
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfCb = cb;
        if (this.activeCallUuid) {
            this.bindings.onDigits(this.activeCallUuid, cb);
        }
    }

    /** @inheritdoc */
    public async transfer(callId: string, toNumber: string): Promise<void> {
        await this.bindings.transferCall(callId, toNumber);
    }

    /** @inheritdoc */
    public onCallEnded(cb: () => void): void {
        this.endedCb = cb;
        if (this.activeCallUuid) {
            this.bindings.onCallStatus(this.activeCallUuid, cb);
        }
    }

    /** @inheritdoc — flushes Vonage's queued outbound audio for the active call (barge-in). No-op if no live call. */
    public flushOutbound(): void {
        if (this.activeCallUuid) {
            this.bindings.flushOutbound(this.activeCallUuid);
        }
    }

    /** Binds the active call UUID and (re-)registers any handlers the driver set before the call existed. */
    private bindCall(callUuid: string): void {
        this.activeCallUuid = callUuid;
        if (this.audioCb) {
            this.bindings.onWebsocketAudio(callUuid, this.audioCb);
        }
        if (this.dtmfCb) {
            this.bindings.onDigits(callUuid, this.dtmfCb);
        }
        if (this.endedCb) {
            this.bindings.onCallStatus(callUuid, this.endedCb);
        }
    }
}

/**
 * Builds a {@link VonageCallSdk} for a session — the Vonage creation seam. Production supplies a factory
 * that constructs the SDK with real {@link IVonageClientBindings} (built from the resolved provider
 * `Configuration` — API key, API secret, Voice application id + private key, websocket media URL, all
 * resolved upstream). Out of the box this returns an **unbound** `VonageCallSdk` whose operations throw
 * until the real client is bound.
 *
 * @param _config The resolved provider/session configuration (credential refs already resolved upstream).
 * @returns An (unbound) {@link VonageCallSdk}. Override in deployment / inject a fake in tests.
 */
export const VonageCallSdkFactory = (_config?: Record<string, unknown>): VonageCallSdk => {
    return new VonageCallSdk();
};
