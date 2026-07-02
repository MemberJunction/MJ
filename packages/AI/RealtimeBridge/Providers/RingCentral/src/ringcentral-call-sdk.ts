/**
 * @fileoverview The **RingCentral** binding of the telephony call SDK seam — `RingCentralCallSdk` +
 * `RingCentralCallSdkFactory`.
 *
 * {@link RingCentralCallSdk} implements the platform-agnostic {@link ITelephonyCallSdk} (from
 * `@memberjunction/ai-bridge-base`) over the **RingCentral Voice / Call Control API**, so
 * {@link import('./ringcentral-bridge').RingCentralBridge} drives a real phone call without ever
 * importing the RingCentral SDK directly. As shipped, every operation throws an explicit **"bind the real
 * RingCentral client"** error — the real RingCentral binding is a documented deployment seam (below).
 * Production supplies the bound client via {@link RingCentralCallSdk}'s constructor / the factory; tests
 * inject a `FakeRingCentralCallSdk`.
 *
 * ## How the RingCentral operations map (production binding — deployment TODO)
 * RingCentral has two halves: a **REST / Call Control API** (place/supervise/transfer/hang-up call
 * sessions) and a **media stream** (bidirectional realtime audio + DTMF events on the active telephony
 * session). This SDK adapter sits over both:
 *
 * | {@link ITelephonyCallSdk} op | RingCentral binding |
 * |---|---|
 * | {@link RingCentralCallSdk.dial} (outbound) | RingOut / Call Control `POST /restapi/v1.0/account/~/telephony/sessions` (or `/extension/~/ring-out`) opening a telephony session whose media leg streams to the agent. Returns the telephony session id. |
 * | {@link RingCentralCallSdk.answer} (inbound) | An inbound call notification (subscription webhook) delivers the telephony session id; "answering" = `POST .../telephony/sessions/{id}/parties/{id}/answer` and accepting the media stream for that session. |
 * | {@link RingCentralCallSdk.hangup} | Call Control `DELETE .../telephony/sessions/{id}` (or party `/drop`). |
 * | {@link RingCentralCallSdk.sendAudioFrame} | An outbound **media** frame (base64 PCM payload) on the session's media stream — the agent's voice. |
 * | {@link RingCentralCallSdk.onAudioFrame} | Inbound **media** events on the session's media stream — what the agent hears (single remote party). |
 * | {@link RingCentralCallSdk.sendDtmf} | Call Control `POST .../telephony/sessions/{id}/parties/{id}/play` digits, or the party `/dtmf` action. |
 * | {@link RingCentralCallSdk.onDtmf} | Inbound DTMF events delivered on the session's media/event stream. |
 * | {@link RingCentralCallSdk.transfer} | Call Control `POST .../telephony/sessions/{id}/parties/{id}/transfer` (supervise/transfer to a number or extension). |
 * | {@link RingCentralCallSdk.onCallEnded} | The telephony-session `Disconnected`/`Finished` status event on the subscription, or the media-stream `stop`. |
 *
 * Binding the real RingCentral client is a thin adapter that supplies an {@link IRingCentralClientBindings}
 * implementation (Call Control REST + media stream) to {@link RingCentralCallSdk}; the driver and its
 * tests do not change. **None of the `@ringcentral/sdk` types leak into this package.**
 *
 * Credentials (clientId / clientSecret / JWT) resolve through MJ's credential system referenced by the
 * provider `Configuration` — never inline secrets.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @see {@link ITelephonyCallSdk} — the platform-agnostic seam this binds.
 * @see `/plans/realtime/realtime-bridges-architecture.md` §8 (RingCentral capability row) and §9 Phase 6.
 */

import { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';

/**
 * The minimal RingCentral client surface {@link RingCentralCallSdk} drives. A production deployment
 * implements this over the real `@ringcentral/sdk` (Call Control REST) + a media-stream handler; this
 * package never imports `@ringcentral/sdk` so it builds and tests with no network. When no bindings are
 * supplied, {@link RingCentralCallSdk} throws the explicit "bind the real RingCentral client" error from
 * every operation.
 *
 * The shapes are intentionally tiny and provider-neutral at the value level (strings / byte buffers) so
 * the RingCentral SDK's types do not leak into the bridge package.
 */
export interface IRingCentralClientBindings {
    /**
     * Places an outbound call via the RingCentral Voice / Call Control API (RingOut or
     * `POST /telephony/sessions`), opening a telephony session whose media leg streams to the agent.
     *
     * @param toNumber Destination number (E.164).
     * @param fromNumber The agent's RingCentral DID / caller-id the call originates from.
     * @param args Provider-specific options (account/extension id, subscription/webhook URL, recording flags, …).
     * @returns The created telephony session id.
     */
    createSession(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string>;

    /**
     * Accepts the media stream for an inbound telephony session already delivered by the subscription
     * notification (answers the session's party).
     *
     * @param sessionId The inbound telephony session id from the notification.
     */
    answerSession(sessionId: string): Promise<void>;

    /**
     * Ends the call (Call Control `DELETE .../telephony/sessions/{id}` / party drop).
     *
     * @param sessionId The telephony session id to end.
     */
    dropSession(sessionId: string): Promise<void>;

    /**
     * Pushes one outbound audio payload onto the session's media stream (the agent's voice).
     *
     * @param sessionId The telephony session id whose stream to write to.
     * @param pcm The audio bytes (the adapter encodes to the media-stream PCM frame).
     */
    pushStreamAudio(sessionId: string, pcm: ArrayBuffer): void;

    /**
     * Registers the inbound media-stream audio callback for the session (what the agent hears).
     *
     * @param sessionId The telephony session id whose inbound stream to subscribe to.
     * @param cb Invoked with each inbound PCM audio frame.
     */
    onStreamAudio(sessionId: string, cb: (pcm: ArrayBuffer) => void): void;

    /**
     * Sends DTMF digits on the call (Call Control party `play` / `dtmf` action).
     *
     * @param sessionId The telephony session id.
     * @param digits The DTMF digit string.
     */
    playDigits(sessionId: string, digits: string): Promise<void>;

    /**
     * Registers the inbound DTMF callback (DTMF events on the session's media/event stream).
     *
     * @param sessionId The telephony session id.
     * @param cb Invoked with each received DTMF digit string.
     */
    onDigits(sessionId: string, cb: (digits: string) => void): void;

    /**
     * Transfers the live call (Call Control party `transfer` — supervise/transfer to number or extension).
     *
     * @param sessionId The telephony session id to transfer.
     * @param toNumber The transfer destination.
     */
    transferSession(sessionId: string, toNumber: string): Promise<void>;

    /**
     * Registers the call-ended callback (telephony-session `Disconnected`/`Finished` event or stream `stop`).
     *
     * @param sessionId The telephony session id.
     * @param cb Invoked when the call ends.
     */
    onSessionStatus(sessionId: string, cb: () => void): void;
}

/** The default bindings used when none are supplied — every operation throws the bind-me error. */
const UNBOUND_BINDINGS: IRingCentralClientBindings = {
    createSession: () => throwUnbound('createSession (outbound dial)'),
    answerSession: () => throwUnbound('answerSession (inbound answer)'),
    dropSession: () => throwUnbound('dropSession (hangup)'),
    pushStreamAudio: () => throwUnboundVoid('pushStreamAudio (outbound media)'),
    onStreamAudio: () => throwUnboundVoid('onStreamAudio (inbound media)'),
    playDigits: () => throwUnbound('playDigits (send DTMF)'),
    onDigits: () => throwUnboundVoid('onDigits (receive DTMF)'),
    transferSession: () => throwUnbound('transferSession (transfer)'),
    onSessionStatus: () => throwUnboundVoid('onSessionStatus (call ended)'),
};

function throwUnbound(op: string): never {
    throw new Error(
        `RingCentralCallSdk has no real RingCentral client bound (operation '${op}'). Construct it with an ` +
            'IRingCentralClientBindings over the real @ringcentral/sdk (Call Control REST + media stream), ' +
            'or inject a fake in tests.',
    );
}

function throwUnboundVoid(op: string): never {
    throwUnbound(op);
}

/**
 * RingCentral's implementation of the {@link ITelephonyCallSdk} telephony seam over the **RingCentral
 * Voice / Call Control API**. {@link import('./ringcentral-bridge').RingCentralBridge} drives this;
 * production constructs it with real {@link IRingCentralClientBindings}, tests inject a
 * `FakeRingCentralCallSdk` directly (no need for this adapter at all in tests).
 *
 * The adapter tracks the active telephony session id so the per-call media / REST operations can be
 * addressed. It never imports `@ringcentral/sdk` — all RingCentral specifics live behind
 * {@link IRingCentralClientBindings}.
 */
export class RingCentralCallSdk implements ITelephonyCallSdk {
    /** The active call's telephony session id once dialled/answered, so per-call operations can address it. */
    private activeSessionId: string | null = null;

    private audioCb?: (pcm: ArrayBuffer) => void;
    private dtmfCb?: (digits: string) => void;
    private endedCb?: () => void;

    /**
     * @param bindings The real RingCentral client bindings (Call Control REST + media stream). Defaults to
     *   an unbound implementation whose every method throws the explicit "bind the real RingCentral
     *   client" error.
     */
    constructor(private readonly bindings: IRingCentralClientBindings = UNBOUND_BINDINGS) {}

    /** @inheritdoc */
    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const sessionId = await this.bindings.createSession(toNumber, fromNumber, args);
        this.bindCall(sessionId);
        return sessionId;
    }

    /** @inheritdoc */
    public async answer(callId: string): Promise<void> {
        await this.bindings.answerSession(callId);
        this.bindCall(callId);
    }

    /** @inheritdoc */
    public async hangup(callId: string): Promise<void> {
        await this.bindings.dropSession(callId);
        this.activeSessionId = null;
    }

    /** @inheritdoc */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        if (this.activeSessionId) {
            this.bindings.pushStreamAudio(this.activeSessionId, pcm);
        }
    }

    /** @inheritdoc */
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioCb = cb;
        if (this.activeSessionId) {
            this.bindings.onStreamAudio(this.activeSessionId, cb);
        }
    }

    /** @inheritdoc */
    public async sendDtmf(digits: string): Promise<void> {
        if (this.activeSessionId) {
            await this.bindings.playDigits(this.activeSessionId, digits);
        }
    }

    /** @inheritdoc */
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfCb = cb;
        if (this.activeSessionId) {
            this.bindings.onDigits(this.activeSessionId, cb);
        }
    }

    /** @inheritdoc */
    public async transfer(callId: string, toNumber: string): Promise<void> {
        await this.bindings.transferSession(callId, toNumber);
    }

    /** @inheritdoc */
    public onCallEnded(cb: () => void): void {
        this.endedCb = cb;
        if (this.activeSessionId) {
            this.bindings.onSessionStatus(this.activeSessionId, cb);
        }
    }

    /** Binds the active session id and (re-)registers any handlers the driver set before the call existed. */
    private bindCall(sessionId: string): void {
        this.activeSessionId = sessionId;
        if (this.audioCb) {
            this.bindings.onStreamAudio(sessionId, this.audioCb);
        }
        if (this.dtmfCb) {
            this.bindings.onDigits(sessionId, this.dtmfCb);
        }
        if (this.endedCb) {
            this.bindings.onSessionStatus(sessionId, this.endedCb);
        }
    }
}

/**
 * Builds a {@link RingCentralCallSdk} for a session — the RingCentral creation seam. Production supplies a
 * factory that constructs the SDK with real {@link IRingCentralClientBindings} (built from the resolved
 * provider `Configuration` — clientId, clientSecret, JWT, account/extension, subscription URL, all
 * resolved upstream). Out of the box this returns an **unbound** `RingCentralCallSdk` whose operations
 * throw until the real client is bound.
 *
 * @param _config The resolved provider/session configuration (credential refs already resolved upstream).
 * @returns An (unbound) {@link RingCentralCallSdk}. Override in deployment / inject a fake in tests.
 */
export const RingCentralCallSdkFactory = (_config?: Record<string, unknown>): RingCentralCallSdk => {
    return new RingCentralCallSdk();
};
