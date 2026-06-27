import { describe, it, expect } from 'vitest';
import {
    handleValidationToken,
    verifyRingCentralWebhook,
    resolveInboundCall,
} from '../ringcentral-ingress';

// ──────────────────────────────────────────────────────────────────────────────
// Validation-token handshake (RingCentral subscription registration delta).
// ──────────────────────────────────────────────────────────────────────────────

describe('handleValidationToken', () => {
    it('echoes the Validation-Token back when present (the registration handshake)', () => {
        expect(handleValidationToken('vt-abc-123')).toEqual({ ValidationToken: 'vt-abc-123' });
    });

    it('returns null for a normal delivery (no validation token → fall through to verification)', () => {
        expect(handleValidationToken(undefined)).toBeNull();
        expect(handleValidationToken('')).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Delivery verification-token check.
// ──────────────────────────────────────────────────────────────────────────────

describe('verifyRingCentralWebhook', () => {
    const EXPECTED = 'subscription-verification-token';

    it('accepts a matching verification-token (constant-time)', () => {
        expect(verifyRingCentralWebhook(EXPECTED, EXPECTED)).toBe(true);
    });

    it('rejects a mismatched token', () => {
        expect(verifyRingCentralWebhook(EXPECTED, 'wrong-token')).toBe(false);
    });

    it('rejects a length-mismatched token (constant-time length guard)', () => {
        expect(verifyRingCentralWebhook(EXPECTED, EXPECTED + 'x')).toBe(false);
    });

    it('rejects a missing/empty header', () => {
        expect(verifyRingCentralWebhook(EXPECTED, undefined)).toBe(false);
        expect(verifyRingCentralWebhook(EXPECTED, '')).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Notification → session mapper.
// ──────────────────────────────────────────────────────────────────────────────

describe('resolveInboundCall', () => {
    it('maps a telephony-session notification to { sessionId, from, to }', () => {
        const resolved = resolveInboundCall({
            telephonySessionId: 'rc-session-9',
            parties: [{ from: { phoneNumber: '+14158675309' }, to: { phoneNumber: '+18005551212' } }],
        });
        expect(resolved).toEqual({ sessionId: 'rc-session-9', from: '+14158675309', to: '+18005551212' });
    });

    it('throws when telephonySessionId is missing', () => {
        expect(() =>
            resolveInboundCall({ parties: [{ from: { phoneNumber: '+1' }, to: { phoneNumber: '+2' } }] }),
        ).toThrow(/telephonySessionId/);
    });

    it('throws when the party from/to is missing', () => {
        expect(() => resolveInboundCall({ telephonySessionId: 'rc1', parties: [{}] })).toThrow(
            /missing a required field/,
        );
        expect(() => resolveInboundCall({ telephonySessionId: 'rc1' })).toThrow(/missing a required field/);
    });
});
