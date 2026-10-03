import { describe, it, expect } from 'vitest';
import { BuildCallbackUrl, PublicOrigin, ReadSharedTelephonySettings, ResolveOnMachine, TrimTrailingSlashes } from '../telephony/telephonySettings.js';

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

describe('PublicOrigin', () => {
    it('keeps scheme, host and port and drops any path', () => {
        expect(PublicOrigin('https://api.acme.com/graphql')).toBe('https://api.acme.com');
        expect(PublicOrigin('http://localhost:4000/')).toBe('http://localhost:4000');
        expect(PublicOrigin('https://api.acme.com')).toBe('https://api.acme.com');
    });

    it('falls back to a slash trim for a value that is not a URL', () => {
        expect(PublicOrigin('not a url//')).toBe('not a url');
    });

    it('does not double-count the GraphQL path in a callback URL', () => {
        expect(BuildCallbackUrl('https://api.acme.com/graphql', '/telephony/twilio', '/status')).toBe('https://api.acme.com/telephony/twilio/status');
    });
});

describe('ReadSharedTelephonySettings', () => {
    it('passes the transfer directory through', () => {
        const targets = [{ name: 'Front desk', number: '+14155550100' }];
        expect(ReadSharedTelephonySettings({ transferTargets: targets }).transferTargets).toEqual(targets);
        expect(ReadSharedTelephonySettings(undefined).transferTargets).toBeUndefined();
    });

    it('passes the concurrency cap through', () => {
        expect(ReadSharedTelephonySettings({ maxConcurrentCalls: 10 }).maxConcurrentCalls).toBe(10);
        expect(ReadSharedTelephonySettings(undefined).maxConcurrentCalls).toBeUndefined();
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
