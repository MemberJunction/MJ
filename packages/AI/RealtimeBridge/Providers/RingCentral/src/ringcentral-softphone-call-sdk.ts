/**
 * @fileoverview `RingCentralSoftphoneCallSdk` — a **real, full-duplex** {@link ITelephonyCallSdk} over the
 * `ringcentral-softphone` SIP/RTP path. This is the RingCentral telephony seam that actually works:
 * unlike RingCentral's WebSocket "Call Streaming" product (receive-only — no way to inject the agent's
 * voice), a registered SIP softphone carries bidirectional RTP, so the agent both hears the caller
 * (`audioPacket` → {@link onAudioFrame}) and speaks back ({@link sendAudioFrame} → the
 * {@link RealtimeRtpSender}'s 20 ms RTP clock).
 *
 * ## Where the session comes from
 * A `Softphone` is a long-lived, process-wide SIP **registration** shared across calls (one inbound INVITE
 * stream, one caller-id), NOT a per-call object — so this per-call SDK does not own a softphone. It is
 * handed a {@link SoftphoneCallSource} (the shared registration handle): {@link dial} places an outbound
 * call through it; {@link answer} answers the inbound INVITE the handle parked for this call id. Once the
 * live {@link SoftphoneCallSession} exists, the SDK replays the handlers the bridge registered at connect
 * (the base wires `onAudioFrame` / `onDtmf` / `onCallEnded` BEFORE dialling) onto it.
 *
 * ## Sample rate
 * With OPUS/16000 the session's audio is clean PCM16 **mono 16 kHz** in both directions — so the bridge
 * runs with {@link CARRIER_SAMPLE_RATE_CONFIG_KEY} = 16000 (set by the server service), not the 8 kHz
 * G.711 default. No companding, no narrowband bottleneck.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 * @see {@link ITelephonyCallSdk} — the platform-agnostic telephony seam this binds.
 */

import { LogError } from '@memberjunction/core';
import { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';
import { RealtimeRtpSender } from './realtime-rtp-sender';
import type { RtpConstructors, SoftphoneCallSession } from './softphone-types';

/**
 * **Pure helper** — copies a Node `Buffer` (a `Uint8Array` view, possibly into a pooled allocation) into a
 * standalone `ArrayBuffer` so the result never aliases a larger backing window. Used to hand inbound audio
 * to the bridge as a clean `ArrayBuffer`.
 */
export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
    const out = new ArrayBuffer(buf.byteLength);
    new Uint8Array(out).set(buf);
    return out;
}

/**
 * The shared SIP-registration seam this per-call SDK draws sessions from. Implemented by the process-wide
 * {@link import('./ringcentral-softphone-handle').RingCentralSoftphoneHandle}; tests inject a fake. None of
 * the softphone SDK's concrete types leak — only the structural {@link SoftphoneCallSession}.
 */
export interface SoftphoneCallSource {
    /** Places an OUTBOUND call (the caller-id is fixed by the registration; `toNumber` is the destination). */
    placeCall(toNumber: string): Promise<SoftphoneCallSession>;
    /** Answers the inbound INVITE the handle parked under `callId` (the SIP `Call-ID`). */
    answerCall(callId: string): Promise<SoftphoneCallSession>;
    /** The `werift-rtp` constructors the outbound RTP sender needs (loaded with the softphone). */
    readonly rtp: RtpConstructors;
}

/**
 * A full-duplex {@link ITelephonyCallSdk} over one `ringcentral-softphone` call session, drawn from a shared
 * {@link SoftphoneCallSource}. Construct via the server service's bind factory (which closes over the
 * process-wide registration handle), not directly.
 */
export class RingCentralSoftphoneCallSdk implements ITelephonyCallSdk {
    /** The live call session once {@link dial} / {@link answer} brings it up. */
    private session: SoftphoneCallSession | null = null;

    /** The outbound RTP clock for this call (created when the session goes live). */
    private sender: RealtimeRtpSender | null = null;

    /** Inbound-audio handler the bridge registered (replayed onto the session once live). */
    private audioCb?: (pcm: ArrayBuffer) => void;

    /** Inbound-DTMF handler the bridge registered. */
    private dtmfCb?: (digits: string) => void;

    /** Call-ended handler the bridge registered. */
    private endedCb?: () => void;

    /** @param source The shared SIP-registration handle this call's session is drawn from. */
    constructor(private readonly source: SoftphoneCallSource) {}

    // ── ITelephonyCallSdk — lifecycle ────────────────────────────────────────────────

    /**
     * Places an **outbound** call through the shared registration and brings duplex audio online.
     *
     * @param toNumber The destination phone number to dial.
     * @param _fromNumber Ignored — the caller-id is fixed by the softphone's SIP registration (one DID per
     *   registration); a different caller-id needs a different registration.
     * @returns The SIP `Call-ID` of the placed call (the bridge's external connection id).
     */
    public async dial(toNumber: string, _fromNumber: string): Promise<string> {
        const session = await this.source.placeCall(toNumber);
        this.wireSession(session, /* outbound */ true);
        return session.callId ?? '';
    }

    /**
     * Answers a routed **inbound** call by resolving the INVITE the handle parked under `callId`.
     *
     * @param callId The SIP `Call-ID` of the inbound call (parked by the registration handle on INVITE).
     */
    public async answer(callId: string): Promise<void> {
        const session = await this.source.answerCall(callId);
        this.wireSession(session, /* outbound */ false);
    }

    /**
     * Hangs up the call and stops the RTP clock. Tolerant of teardown errors.
     *
     * @param _callId The platform call id (unused — the live session is hung up directly).
     */
    public async hangup(_callId: string): Promise<void> {
        const session = this.session;
        this.sender?.stop();
        this.sender = null;
        this.session = null;
        if (session) {
            try {
                await session.hangup();
            } catch (err) {
                LogError(`[RingCentralSoftphoneCallSdk] hangup() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ── ITelephonyCallSdk — duplex audio ─────────────────────────────────────────────

    /**
     * Queues one PCM16 frame as the agent's outbound voice — the RTP sender paces it onto the wire at
     * 20 ms. No-ops before the call is up so an early model frame never crashes the session.
     *
     * @param pcm The PCM audio bytes to speak into the call (at the codec rate — 16 kHz for OPUS/16000).
     */
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.sender?.enqueue(pcm);
    }

    /**
     * Registers the inbound-audio handler (what the agent hears). Replayed onto the session when it comes
     * online; if the session is already live, wired immediately.
     *
     * @param cb Invoked with each inbound PCM16 frame.
     */
    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.audioCb = cb;
        if (this.session) {
            this.session.on('audioPacket', (rtp) => cb(bufferToArrayBuffer(rtp.payload)));
        }
    }

    // ── ITelephonyCallSdk — DTMF / transfer / lifecycle / barge-in ────────────────────

    /**
     * Sends DTMF digits one character at a time over the live call. No-ops before the call is up.
     *
     * @param digits The DTMF digit string (e.g. `'1234#'`).
     */
    public async sendDtmf(digits: string): Promise<void> {
        const session = this.session;
        if (!session) {
            return;
        }
        for (const char of digits) {
            session.sendDTMF(char);
        }
    }

    /**
     * Registers the inbound-DTMF handler. Replayed onto the session when it comes online.
     *
     * @param cb Invoked with each received DTMF digit.
     */
    public onDtmf(cb: (digits: string) => void): void {
        this.dtmfCb = cb;
        if (this.session) {
            this.session.on('dtmf', cb);
        }
    }

    /**
     * Blind-transfers the live call to another number (SIP REFER). No-ops before the call is up.
     *
     * @param _callId The platform call id (unused — the live session is transferred directly).
     * @param toNumber The transfer destination.
     */
    public async transfer(_callId: string, toNumber: string): Promise<void> {
        await this.session?.transfer(toNumber);
    }

    /**
     * Registers the call-ended handler. Replayed onto the session when it comes online (fires on either
     * party hanging up — the softphone's `disposed` — and, for outbound, on `busy`).
     *
     * @param cb Invoked when the call has ended.
     */
    public onCallEnded(cb: () => void): void {
        this.endedCb = cb;
        if (this.session) {
            this.session.once('disposed', cb);
        }
    }

    /** Barge-in: drop the agent's queued (not-yet-sent) outbound audio so it goes silent immediately. */
    public flushOutbound(): void {
        this.sender?.flush();
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Binds the bridge's pre-registered handlers + the RTP sender onto a freshly-live call session. */
    private wireSession(session: SoftphoneCallSession, outbound: boolean): void {
        this.session = session;
        this.sender = new RealtimeRtpSender(session, this.source.rtp);
        this.sender.start();

        if (this.audioCb) {
            const cb = this.audioCb;
            session.on('audioPacket', (rtp) => cb(bufferToArrayBuffer(rtp.payload)));
        }
        if (this.dtmfCb) {
            session.on('dtmf', this.dtmfCb);
        }
        if (this.endedCb) {
            const ended = this.endedCb;
            session.once('disposed', ended);
            if (outbound) {
                // An outbound call that never connects emits 'busy' instead of 'disposed'.
                session.once('busy', ended);
            }
        }
    }
}
