import { describe, it, expect, vi } from 'vitest';
import { TwilioTelephonyService } from '../telephony/TwilioTelephonyService.js';
import { TwilioCallMediaRegistry } from '../telephony/twilioMediaRegistry.js';
import { TwilioCallSdk } from '@memberjunction/ai-bridge-twilio';
import type { BaseTelephonyBridge } from '@memberjunction/ai-bridge-base';

const CONFIG = { accountSid: 'AC1', authToken: 'tok', streamPublicUrl: 'wss://api.test/telephony/twilio/media' };

describe('TwilioTelephonyService.buildBindSdk', () => {
    it('binds a TwilioCallSdk factory onto the telephony driver (the live REST + media wiring seam)', () => {
        const service = new TwilioTelephonyService(CONFIG, new TwilioCallMediaRegistry());
        const setSdkFactory = vi.fn();
        const fakeDriver = { SetSdkFactory: setSdkFactory } as unknown as BaseTelephonyBridge;

        service.buildBindSdk()(fakeDriver);

        expect(setSdkFactory).toHaveBeenCalledTimes(1);
        const factory = setSdkFactory.mock.calls[0][0] as () => unknown;
        expect(typeof factory).toBe('function');
        // The factory yields a real (bound) TwilioCallSdk — proving the offline seam meets live plumbing.
        expect(factory()).toBeInstanceOf(TwilioCallSdk);
    });
});
