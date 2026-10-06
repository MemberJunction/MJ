import { describe, it, expect, vi } from 'vitest';
import { TwilioCallSdk, ITwilioClientBindings } from '../twilio-call-sdk';

function makeBindings(overrides: Partial<ITwilioClientBindings> = {}): ITwilioClientBindings {
    return {
        createCall: vi.fn(async () => 'CA1'),
        acceptInbound: vi.fn(async () => {}),
        completeCall: vi.fn(async () => {}),
        pushStreamAudio: vi.fn(),
        onStreamAudio: vi.fn(),
        playDigits: vi.fn(async () => {}),
        onDigits: vi.fn(),
        redirectCall: vi.fn(async () => {}),
        onCallStatus: vi.fn(),
        flushOutbound: vi.fn(),
        ...overrides,
    };
}

describe('TwilioCallSdk — carrier hand-off hooks', () => {
    it('playMessageAndHangup speaks and hangs up in one carrier step when the bindings can', async () => {
        const sayAndHangup = vi.fn(async () => {});
        const bindings = makeBindings({ sayAndHangup });
        const sdk = new TwilioCallSdk(bindings);
        await sdk.playMessageAndHangup('CA1', 'bye');
        expect(sayAndHangup).toHaveBeenCalledWith('CA1', 'bye');
        expect(bindings.completeCall).not.toHaveBeenCalled();
    });

    it('playMessageAndHangup completes the call when the bindings cannot speak', async () => {
        const bindings = makeBindings();
        await new TwilioCallSdk(bindings).playMessageAndHangup('CA1', 'bye');
        expect(bindings.completeCall).toHaveBeenCalledWith('CA1');
    });

    it('detach forgets the call locally without completing it', async () => {
        const bindings = makeBindings();
        const sdk = new TwilioCallSdk(bindings);
        await sdk.dial('+1', '+2');
        await sdk.detach('CA1');
        sdk.sendAudioFrame(new ArrayBuffer(2)); // no active call any more
        expect(bindings.pushStreamAudio).not.toHaveBeenCalled();
        expect(bindings.completeCall).not.toHaveBeenCalled();
    });
});
