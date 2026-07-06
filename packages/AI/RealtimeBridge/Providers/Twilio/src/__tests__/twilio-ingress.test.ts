import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
    verifyTwilioSignature,
    computeTwilioSignature,
    buildInboundVoiceTwiML,
    resolveInboundCall,
} from '../twilio-ingress';

// ──────────────────────────────────────────────────────────────────────────────
// A known Twilio signature test vector, constructed via the documented scheme:
//   data = url + sorted(key+value...)   →   base64(HMAC-SHA1(authToken, data))
// This is Twilio's published example (authToken '12345', the voice-on-no-answer URL
// with the CallSid/Caller/Digits/From/To params).
// ──────────────────────────────────────────────────────────────────────────────

const AUTH_TOKEN = '12345';
const URL = 'https://mycompany.com/myapp.php?foo=1&bar=2';
const PARAMS: Record<string, string> = {
    CallSid: 'CA1234567890ABCDE',
    Caller: '+14158675309',
    Digits: '1234',
    From: '+14158675309',
    To: '+18005551212',
};

/** Independently re-derive the expected signature so the test vector is self-checking. */
function referenceSignature(authToken: string, url: string, params: Record<string, string>): string {
    const data =
        url +
        Object.keys(params)
            .sort()
            .map((k) => k + params[k])
            .join('');
    return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

describe('verifyTwilioSignature', () => {
    it('computeTwilioSignature matches an independent reference derivation', () => {
        expect(computeTwilioSignature(AUTH_TOKEN, URL, PARAMS)).toBe(referenceSignature(AUTH_TOKEN, URL, PARAMS));
    });

    it('accepts a valid signature', () => {
        const sig = computeTwilioSignature(AUTH_TOKEN, URL, PARAMS);
        expect(verifyTwilioSignature(AUTH_TOKEN, sig, URL, PARAMS)).toBe(true);
    });

    it('rejects a tampered param (signature no longer matches)', () => {
        const sig = computeTwilioSignature(AUTH_TOKEN, URL, PARAMS);
        const tampered = { ...PARAMS, To: '+19998887777' };
        expect(verifyTwilioSignature(AUTH_TOKEN, sig, URL, tampered)).toBe(false);
    });

    it('rejects a tampered URL', () => {
        const sig = computeTwilioSignature(AUTH_TOKEN, URL, PARAMS);
        expect(verifyTwilioSignature(AUTH_TOKEN, sig, URL + '&evil=1', PARAMS)).toBe(false);
    });

    it('rejects when the auth token is wrong', () => {
        const sig = computeTwilioSignature(AUTH_TOKEN, URL, PARAMS);
        expect(verifyTwilioSignature('wrong-token', sig, URL, PARAMS)).toBe(false);
    });

    it('rejects a missing/empty signature header', () => {
        expect(verifyTwilioSignature(AUTH_TOKEN, undefined, URL, PARAMS)).toBe(false);
        expect(verifyTwilioSignature(AUTH_TOKEN, '', URL, PARAMS)).toBe(false);
    });

    it('is order-independent (params sorted by key before concat)', () => {
        const reordered: Record<string, string> = {
            To: PARAMS.To,
            CallSid: PARAMS.CallSid,
            From: PARAMS.From,
            Digits: PARAMS.Digits,
            Caller: PARAMS.Caller,
        };
        const sig = computeTwilioSignature(AUTH_TOKEN, URL, PARAMS);
        expect(verifyTwilioSignature(AUTH_TOKEN, sig, URL, reordered)).toBe(true);
    });
});

describe('buildInboundVoiceTwiML', () => {
    it('connects the inbound call to the media WSS endpoint', () => {
        const twiml = buildInboundVoiceTwiML('wss://api.example/telephony/twilio/media');
        expect(twiml).toContain('<Connect>');
        expect(twiml).toContain('<Stream url="wss://api.example/telephony/twilio/media" />');
    });
});

describe('resolveInboundCall', () => {
    it('maps Twilio webhook params to { callSid, from, to }', () => {
        const resolved = resolveInboundCall({
            CallSid: 'CA-inbound-9',
            From: '+14158675309',
            To: '+18005551212',
            Extra: 'ignored',
        });
        expect(resolved).toEqual({ callSid: 'CA-inbound-9', from: '+14158675309', to: '+18005551212' });
    });

    it('throws when a required param is missing', () => {
        expect(() => resolveInboundCall({ From: '+1', To: '+2' })).toThrow(/CallSid/);
        expect(() => resolveInboundCall({ CallSid: 'CA1', To: '+2' })).toThrow(/missing a required param/);
    });
});
