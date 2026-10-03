import { describe, it, expect, vi } from 'vitest';
import type { ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';
import { CallEndObserverSdk } from '../telephony/callEndObserver.js';

function fakeSdk(overrides: Partial<ITelephonyCallSdk> = {}): ITelephonyCallSdk & { endedCb?: () => void } {
    const sdk: ITelephonyCallSdk & { endedCb?: () => void } = {
        dial: vi.fn(async () => 'CA-DIALED'),
        answer: vi.fn(async () => undefined),
        hangup: vi.fn(async () => undefined),
        sendAudioFrame: vi.fn(),
        onAudioFrame: vi.fn(),
        sendDtmf: vi.fn(async () => undefined),
        onDtmf: vi.fn(),
        transfer: vi.fn(async () => undefined),
        onCallEnded: vi.fn((cb: () => void) => {
            sdk.endedCb = cb;
        }),
        flushOutbound: vi.fn(),
        ...overrides,
    };
    return sdk;
}

describe('CallEndObserverSdk', () => {
    it('reports the end when MJ hangs up, with the call id', async () => {
        const inner = fakeSdk();
        const onEnded = vi.fn();
        await new CallEndObserverSdk(inner, onEnded).hangup('CA1');
        expect(inner.hangup).toHaveBeenCalledWith('CA1');
        expect(onEnded).toHaveBeenCalledWith('CA1');
    });

    it('still reports the end when the carrier hang-up throws (the session is torn down regardless)', async () => {
        const inner = fakeSdk({ hangup: vi.fn(async () => { throw new Error('call not in progress'); }) });
        const onEnded = vi.fn();
        await expect(new CallEndObserverSdk(inner, onEnded).hangup('CA1')).rejects.toThrow('call not in progress');
        expect(onEnded).toHaveBeenCalledWith('CA1');
    });

    it('reports the end when the carrier says the call ended AND still delivers the driver\'s own callback', async () => {
        const inner = fakeSdk();
        const onEnded = vi.fn();
        const sdk = new CallEndObserverSdk(inner, onEnded);
        await sdk.dial('+1', '+2');
        const driverCb = vi.fn();
        sdk.onCallEnded(driverCb);

        inner.endedCb?.();

        expect(onEnded).toHaveBeenCalledWith('CA-DIALED');
        expect(driverCb).toHaveBeenCalledTimes(1);
    });

    it('learns the call id of an inbound call from answer()', async () => {
        const inner = fakeSdk();
        const onEnded = vi.fn();
        const sdk = new CallEndObserverSdk(inner, onEnded);
        await sdk.answer('CA-IN');
        sdk.onCallEnded(() => undefined);
        inner.endedCb?.();
        expect(onEnded).toHaveBeenCalledWith('CA-IN');
    });

    it('an end reported before the call id is known still reaches the driver but releases nothing', () => {
        const inner = fakeSdk();
        const onEnded = vi.fn();
        const sdk = new CallEndObserverSdk(inner, onEnded);
        const driverCb = vi.fn();
        sdk.onCallEnded(driverCb);
        inner.endedCb?.();
        expect(onEnded).not.toHaveBeenCalled();
        expect(driverCb).toHaveBeenCalledTimes(1);
    });

    it('delegates everything else untouched', async () => {
        const inner = fakeSdk();
        const sdk = new CallEndObserverSdk(inner, vi.fn());
        const pcm = new ArrayBuffer(4);
        sdk.sendAudioFrame(pcm);
        sdk.onAudioFrame(() => undefined);
        await sdk.sendDtmf('12#');
        sdk.onDtmf(() => undefined);
        await sdk.transfer('CA1', '+1555');
        sdk.flushOutbound();
        expect(inner.sendAudioFrame).toHaveBeenCalledWith(pcm);
        expect(inner.onAudioFrame).toHaveBeenCalled();
        expect(inner.sendDtmf).toHaveBeenCalledWith('12#');
        expect(inner.onDtmf).toHaveBeenCalled();
        expect(inner.transfer).toHaveBeenCalledWith('CA1', '+1555');
        expect(inner.flushOutbound).toHaveBeenCalled();
    });

    it('tolerates an inner SDK with no flushOutbound', () => {
        const inner = fakeSdk({ flushOutbound: undefined });
        expect(() => new CallEndObserverSdk(inner, vi.fn()).flushOutbound()).not.toThrow();
    });
});

describe('CallEndObserverSdk — carrier hand-off', () => {
    it('has no detach or goodbye when the wrapped SDK has none (so the bridge falls back to a plain hang-up)', () => {
        const sdk = new CallEndObserverSdk(fakeSdk(), vi.fn());
        expect(sdk.detach).toBeUndefined();
        expect(sdk.playMessageAndHangup).toBeUndefined();
    });

    it('forwards detach to the wrapped SDK and reports the end (MJ is done with a call it handed to the carrier)', async () => {
        const detach = vi.fn(async () => undefined);
        const onEnded = vi.fn();
        const sdk = new CallEndObserverSdk(fakeSdk({ detach }), onEnded);
        await sdk.detach?.('CA1');
        expect(detach).toHaveBeenCalledWith('CA1');
        expect(onEnded).toHaveBeenCalledWith('CA1');
    });

    it('forwards the carrier-side goodbye and reports the end, even when the carrier call throws', async () => {
        const playMessageAndHangup = vi.fn(async () => { throw new Error('twilio 500'); });
        const onEnded = vi.fn();
        const sdk = new CallEndObserverSdk(fakeSdk({ playMessageAndHangup }), onEnded);
        await expect(sdk.playMessageAndHangup?.('CA1', 'Goodbye')).rejects.toThrow('twilio 500');
        expect(playMessageAndHangup).toHaveBeenCalledWith('CA1', 'Goodbye');
        expect(onEnded).toHaveBeenCalledWith('CA1');
    });
});
