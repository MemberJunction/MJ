/**
 * @fileoverview A transparent {@link ITelephonyCallSdk} decorator that reports when a call has ended.
 *
 * The bridge engine ends a phone session through exactly two seams of the SDK it was handed: the SDK's own
 * `onCallEnded` callback (the remote party hung up / the carrier dropped it) and `hangup()` (MJ is tearing
 * the session down — explicit stop, status callback, max duration, janitor, shutdown). Wrapping the SDK lets
 * the telephony services learn about **every** end of a call from one place — without taking over the
 * driver's single, "latest handler wins" `onCallEnded` slot (which the engine owns) — so they can release
 * per-call state such as the max-duration timer deterministically.
 *
 * Pure delegation otherwise: every call is forwarded unchanged.
 *
 * @module @memberjunction/telephony-adapters
 */

import type { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';

/**
 * Wraps an SDK so `onEnded(callId)` fires when the call ends by either route. `onEnded` may fire more than
 * once for one call (the carrier reports the end, then MJ hangs up); it must be idempotent.
 */
export class CallEndObserverSdk implements ITelephonyCallSdk {
    /** The call id once known (set by `dial` / `answer`); `hangup` also receives it explicitly. */
    private callId: string | null = null;

    constructor(
        private readonly inner: ITelephonyCallSdk,
        private readonly onEnded: (callId: string) => void,
    ) {}

    public async dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string> {
        const callId = await this.inner.dial(toNumber, fromNumber, args);
        this.callId = callId;
        return callId;
    }

    public async answer(callId: string): Promise<void> {
        this.callId = callId;
        await this.inner.answer(callId);
    }

    public async hangup(callId: string): Promise<void> {
        try {
            await this.inner.hangup(callId);
        } finally {
            // Released even when the carrier REST hang-up throws: the session is being torn down regardless.
            this.onEnded(callId);
        }
    }

    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.inner.sendAudioFrame(pcm);
    }

    public onAudioFrame(cb: (pcm: ArrayBuffer) => void): void {
        this.inner.onAudioFrame(cb);
    }

    public sendDtmf(digits: string): Promise<void> {
        return this.inner.sendDtmf(digits);
    }

    public onDtmf(cb: (digits: string) => void): void {
        this.inner.onDtmf(cb);
    }

    public transfer(callId: string, toNumber: string): Promise<void> {
        return this.inner.transfer(callId, toNumber);
    }

    public onCallEnded(cb: () => void): void {
        this.inner.onCallEnded(() => {
            if (this.callId) {
                this.onEnded(this.callId);
            }
            cb();
        });
    }

    public flushOutbound(): void {
        this.inner.flushOutbound?.();
    }
}
