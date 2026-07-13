/**
 * @fileoverview The **Twilio** binding of the telephony call SDK seam — `TwilioCallSdk` +
 * `TwilioCallSdkFactory`.
 *
 * {@link TwilioCallSdk} implements the platform-agnostic {@link ITelephonyCallSdk} (from
 * `@memberjunction/ai-bridge-base`) over **Twilio Programmable Voice + Media Streams**, so
 * {@link import('./twilio-bridge').TwilioBridge} drives a real phone call without ever importing the
 * Twilio SDK directly. As shipped, every operation throws an explicit **"bind the real Twilio client"**
 * error — the real Twilio binding is a documented deployment seam (below). Production supplies the bound
 * client via {@link TwilioCallSdk}'s constructor / the factory; tests inject a `FakeTwilioCallSdk`.
 *
 * ## How the Twilio operations map (production binding — deployment TODO)
 * Twilio has two halves: a **REST API** (place/modify/hang-up calls) and a **Media Streams** websocket
 * (bidirectional realtime audio + DTMF events). This SDK adapter sits over both:
 *
 * | {@link ITelephonyCallSdk} op | Twilio binding |
 * |---|---|
 * | {@link TwilioCallSdk.dial} (outbound) | REST `client.calls.create({ to, from, twiml })` where the TwiML opens a bidirectional `<Connect><Stream>` to the Media-Streams websocket. Returns the Call SID. |
 * | {@link TwilioCallSdk.answer} (inbound) | The inbound webhook (a call to the agent's DID) returns TwiML with `<Connect><Stream>`; "answering" = accepting that Media-Streams websocket for the delivered Call SID. |
 * | {@link TwilioCallSdk.hangup} | REST `client.calls(callSid).update({ status: 'completed' })`. |
 * | {@link TwilioCallSdk.sendAudioFrame} | A Media-Streams **outbound `media`** message (base64 μ-law/PCM payload) on the call's websocket — the agent's voice. |
 * | {@link TwilioCallSdk.onAudioFrame} | Inbound Media-Streams **`media`** events on the websocket — what the agent hears (single remote party). |
 * | {@link TwilioCallSdk.sendDtmf} | REST `client.calls(callSid).update({ twiml: '<Play digits="...">' })` (or a `<Dial>` `sendDigits`). |
 * | {@link TwilioCallSdk.onDtmf} | `<Gather input="dtmf">` results delivered to the voice webhook, OR Media-Streams DTMF `dtmf` events. |
 * | {@link TwilioCallSdk.transfer} | REST `client.calls(callSid).update({ twiml: '<Dial>+1...</Dial>' })` redirecting the live call. |
 * | {@link TwilioCallSdk.onCallEnded} | The `status-callback` webhook for `completed` / `failed` / `canceled`, OR the Media-Streams `stop` event. |
 *
 * Binding the real Twilio client is a thin adapter that supplies an {@link ITwilioClientBindings}
 * implementation (REST + websocket) to {@link TwilioCallSdk}; the driver and its tests do not change.
 * **None of the `twilio` SDK's types leak into this package.**
 *
 * Credentials (Account SID, Auth Token, the Media-Streams websocket URL) resolve through MJ's credential
 * system referenced by the provider `Configuration` — never inline secrets.
 *
 * @module @memberjunction/ai-bridge-twilio
 * @see {@link ITelephonyCallSdk} — the platform-agnostic seam this binds.
 * @see `/plans/realtime/realtime-bridges-architecture.md` §8 (Twilio capability row) and §9 Phase 6.
 */

import { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';

/**
 * The minimal Twilio client surface {@link TwilioCallSdk} drives. A production deployment implements
 * this over the real `twilio` SDK (REST) + a Media-Streams websocket handler; this package never imports
 * `twilio` so it builds and tests with no network. When no bindings are supplied, {@link TwilioCallSdk}
 * throws the explicit "bind the real Twilio client" error from every operation.
 *
 * The shapes are intentionally tiny and provider-neutral at the value level (strings / byte buffers) so
 * the Twilio SDK's types do not leak into the bridge package.
 */
export interface ITwilioClientBindings {
    /**
     * Places an outbound call via the Twilio REST API (`calls.create`) with TwiML that opens a
     * bidirectional Media-Streams `<Connect><Stream>` to the agent's websocket.
     *
     * @param toNumber Destination number (E.164).
     * @param fromNumber The agent's Twilio number / verified caller-id the call originates from.
     * @param args Provider-specific options (status-callback URL, stream URL, recording flags, …).
     * @returns The created Call SID.
     */
    createCall(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string>;

    /**
     * Accepts the Media-Streams websocket for an inbound call already delivered by the voice webhook.
     *
     * @param callSid The inbound Call SID from the webhook.
     */
    acceptInbound(callSid: string): Promise<void>;

    /**
     * Ends the call (REST `calls(sid).update({ status: 'completed' })`).
     *
     * @param callSid The Call SID to complete.
     */
    completeCall(callSid: string): Promise<void>;

    /**
     * Pushes one outbound audio payload onto the call's Media-Streams websocket (the agent's voice).
     *
     * @param callSid The Call SID whose stream to write to.
     * @param pcm The audio bytes (the adapter encodes to the Media-Streams μ-law/PCM `media` frame).
     */
    pushStreamAudio(callSid: string, pcm: ArrayBuffer): void;

    /**
     * Registers the inbound Media-Streams audio callback for the call (what the agent hears).
     *
     * @param callSid The Call SID whose inbound stream to subscribe to.
     * @param cb Invoked with each inbound PCM audio frame.
     */
    onStreamAudio(callSid: string, cb: (pcm: ArrayBuffer) => void): void;

    /**
     * Sends DTMF digits on the call (REST `calls(sid).update` with `<Play digits>` / `<Dial sendDigits>`).
     *
     * @param callSid The Call SID.
     * @param digits The DTMF digit string.
     */
    playDigits(callSid: string, digits: string): Promise<void>;

    /**
     * Registers the inbound DTMF callback (`<Gather>` webhook results or Media-Streams `dtmf` events).
     *
     * @param callSid The Call SID.
     * @param cb Invoked with each received DTMF digit string.
     */
    onDigits(callSid: string, cb: (digits: string) => void): void;

    /**
     * Transfers the live call (REST `calls(sid).update({ twiml: '<Dial>...' })`).
     *
     * @param callSid The Call SID to redirect.
     * @param toNumber The transfer destination.
     */
    redirectCall(callSid: string, toNumber: string): Promise<void>;

    /**
     * Registers the call-ended callback (status-callback `completed`/`failed`/`canceled` or stream `stop`).
     *
     * @param callSid The Call SID.
     * @param cb Invoked when the call ends.
     */
    onCallStatus(callSid: string, cb: () => void): void;
}

/** The default bindings used when none are supplied — every operation throws the bind-me error. */
const UNBOUND_BINDINGS: ITwilioClientBindings = {
    createCall: () => throwUnbound('createCall (outbound dial)'),
    acceptInbound: () => throwUnbound('acceptInbound (inbound answer)'),
    completeCall: () => throwUnbound('completeCall (hangup)'),
    pushStreamAudio: () => throwUnboundVoid('pushStreamAudio (outbound media)'),
    onStreamAudio: () => throwUnboundVoid('onStreamAudio (inbound media)'),
    playDigits: () => throwUnbound('playDigits (send DTMF)'),
    onDigits: () => throwUnboundVoid('onDigits (receive DTMF)'),
    redirectCall: () => throwUnbound('redirectCall (transfer)'),
    onCallStatus: () => throwUnboundVoid('onCallStatus (call ended)'),
};

function throwUnbound(op: string): never {
    throw new Error(
        `TwilioCallSdk has no real Twilio client bound (operation '${op}'). Construct it with an ` +
            'ITwilioClientBindings over the real twilio SDK (REST + Media Streams), or inject a fake in tests.',
    );
}

function throwUnboundVoid(op: string): never {
    throwUnbound(op);
}

/**
 * Twilio's implementation of the {@link ITelephonyCallSdk} telephony seam over **Twilio Programmable
 * Voice + Media Streams**. {@link import('./twilio-bridge').TwilioBridge} drives this; production
 * constructs it with real {@link ITwilioClientBindings}, tests inject a `FakeTwilioCallSdk` directly
 * (no need for this adapter at all in tests).
 *
 * The adapter tracks the active Call SID so the per-call websocket / REST operations can be addressed.
 * It never imports the `twilio` SDK — all Twilio specifics live behind {@link ITwilioClientBindings}.
 */
export class TwilioCallSdk implements ITelephonyCallSdk {
    /** The active call's SID once dialled/answered, so per-call operations can address it. */
    private activeCallSid: string | null = null;

    private audioCb?: (pcm: ArrayBuffer) => void;
    private dtmfCb?: (digits: string) => void;
    private endedCb?: () => void;

    /**
     * @param bindings The real Twilio client bindings (REST + Media Streams). Defaults to an unbound
     *   implementation whose every method throws the explicit "bind the real Twilio client" error.
     */
    constructor(private readonly bindings: ITwilioClientBindings = UNBOUND_BINDINGS) {}

    /** @inheritdoc */
    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const sid = await this.bindings.createCall(toNumber, fromNumber, args);
        this.bindCall(sid);
        return sid;
    }

    /** @inheritdoc */
    public async answer(callId: string): Promise<void> {
        await this.bindings.acceptInbound(callId);
        this.bindCall(callId);
    }

    /** @inheritdoc */
    public async hangup(callId: string): Promise<void> {
        await this.bindings.completeCall(callId);
        this.activeCallSid = null;
    }

    /** @inheritdoc */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        if (this.activeCallSid) {
            this.bindings.pushStreamAudio(this.activeCallSid, pcm);
        }
    }

    /** @inheritdoc */
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioCb = cb;
        if (this.activeCallSid) {
            this.bindings.onStreamAudio(this.activeCallSid, cb);
        }
    }

    /** @inheritdoc */
    public async sendDtmf(digits: string): Promise<void> {
        if (this.activeCallSid) {
            await this.bindings.playDigits(this.activeCallSid, digits);
        }
    }

    /** @inheritdoc */
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfCb = cb;
        if (this.activeCallSid) {
            this.bindings.onDigits(this.activeCallSid, cb);
        }
    }

    /** @inheritdoc */
    public async transfer(callId: string, toNumber: string): Promise<void> {
        await this.bindings.redirectCall(callId, toNumber);
    }

    /** @inheritdoc */
    public onCallEnded(cb: () => void): void {
        this.endedCb = cb;
        if (this.activeCallSid) {
            this.bindings.onCallStatus(this.activeCallSid, cb);
        }
    }

    /** Binds the active Call SID and (re-)registers any handlers the driver set before the call existed. */
    private bindCall(callSid: string): void {
        this.activeCallSid = callSid;
        if (this.audioCb) {
            this.bindings.onStreamAudio(callSid, this.audioCb);
        }
        if (this.dtmfCb) {
            this.bindings.onDigits(callSid, this.dtmfCb);
        }
        if (this.endedCb) {
            this.bindings.onCallStatus(callSid, this.endedCb);
        }
    }
}

/**
 * Builds a {@link TwilioCallSdk} for a session — the Twilio creation seam. Production supplies a factory
 * that constructs the SDK with real {@link ITwilioClientBindings} (built from the resolved provider
 * `Configuration` — Account SID, Auth Token, Media-Streams URL, all resolved upstream). Out of the box
 * this returns an **unbound** `TwilioCallSdk` whose operations throw until the real client is bound.
 *
 * @param _config The resolved provider/session configuration (credential refs already resolved upstream).
 * @returns An (unbound) {@link TwilioCallSdk}. Override in deployment / inject a fake in tests.
 */
export const TwilioCallSdkFactory = (_config?: Record<string, unknown>): TwilioCallSdk => {
    return new TwilioCallSdk();
};
