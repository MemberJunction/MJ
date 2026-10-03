import { describe, it, expect } from 'vitest';
import { BuildCallbackUrl, ReadSharedTelephonySettings, ResolveOnMachine, TrimTrailingSlashes } from '../telephony/telephonySettings.js';

describe('ReadSharedTelephonySettings', () => {
    it('picks only the shared fields', () => {
        const picked = ReadSharedTelephonySettings({
            inboundRunAsUserEmail: 'bot@acme.com',
            maxCallSeconds: 600,
            outbound: { allowedPrefixes: ['+44'] },
            ...({ accountSid: 'AC1' } as object),
        });
        expect(picked).toEqual({ inboundRunAsUserEmail: 'bot@acme.com', maxCallSeconds: 600, outbound: { allowedPrefixes: ['+44'] } });
    });

    it('leaves unset values undefined so each service applies its default', () => {
        expect(ReadSharedTelephonySettings(undefined)).toEqual({ inboundRunAsUserEmail: undefined, maxCallSeconds: undefined, outbound: undefined });
    });
});

describe('ResolveOnMachine', () => {
    it("defaults to 'hangup' and treats unknown values as 'hangup'", () => {
        expect(ResolveOnMachine(undefined)).toBe('hangup');
        expect(ResolveOnMachine('hangup')).toBe('hangup');
        expect(ResolveOnMachine('banana')).toBe('hangup');
    });

    it("honours 'continue'", () => {
        expect(ResolveOnMachine('continue')).toBe('continue');
    });
});

describe('BuildCallbackUrl', () => {
    it('joins base, mount path and route without doubled slashes', () => {
        expect(BuildCallbackUrl('https://api.acme.com/', '/telephony/twilio/', '/status')).toBe('https://api.acme.com/telephony/twilio/status');
    });

    it('tolerates a mount path without a leading slash', () => {
        expect(BuildCallbackUrl('https://api.acme.com', 'telephony/vonage', '/event')).toBe('https://api.acme.com/telephony/vonage/event');
    });
});

describe('TrimTrailingSlashes', () => {
    it('removes every trailing slash and nothing else', () => {
        expect(TrimTrailingSlashes('https://api.example.com///')).toBe('https://api.example.com');
        expect(TrimTrailingSlashes('https://api.example.com/graphql')).toBe('https://api.example.com/graphql');
        expect(TrimTrailingSlashes('/')).toBe('');
        expect(TrimTrailingSlashes('')).toBe('');
    });

    it('stays linear on a pathological run of slashes', () => {
        const input = 'a' + '/'.repeat(200_000) + 'b';
        const start = Date.now();
        expect(TrimTrailingSlashes(input)).toBe(input);
        expect(TrimTrailingSlashes(input + '/'.repeat(200_000))).toBe(input);
        expect(Date.now() - start).toBeLessThan(500);
    });
});
