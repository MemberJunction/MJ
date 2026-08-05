import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
    verifyVonageSignature,
    computeVonageSignature,
    verifyVonageJwt,
    buildInboundAnswerNcco,
    resolveInboundCall,
} from '../vonage-ingress';

const SIGNATURE_SECRET = 'vonage-sig-secret';
const PARAMS: Record<string, string> = {
    conversation_uuid: 'CON-abc',
    from: '+14158675309',
    to: '+18005551212',
    timestamp: '1700000000',
    uuid: 'CALL-xyz',
};

/** Independently re-derive the expected signature so the test vector is self-checking. */
function referenceSignature(secret: string, params: Record<string, string>): string {
    const data = Object.keys(params)
        .filter((k) => k !== 'sig')
        .sort()
        .map((k) => `&${k}=${params[k]}`)
        .join('');
    return createHmac('sha256', secret).update(data, 'utf8').digest('hex').toUpperCase();
}

describe('verifyVonageSignature', () => {
    it('computeVonageSignature matches an independent reference derivation (HMAC-SHA256 hex, uppercased)', () => {
        expect(computeVonageSignature(SIGNATURE_SECRET, PARAMS)).toBe(referenceSignature(SIGNATURE_SECRET, PARAMS));
    });

    it('accepts a valid signature', () => {
        const sig = computeVonageSignature(SIGNATURE_SECRET, PARAMS);
        expect(verifyVonageSignature(SIGNATURE_SECRET, sig, PARAMS)).toBe(true);
    });

    it('excludes the sig param itself from the signed set', () => {
        const sig = computeVonageSignature(SIGNATURE_SECRET, PARAMS);
        expect(verifyVonageSignature(SIGNATURE_SECRET, sig, { ...PARAMS, sig })).toBe(true);
    });

    it('rejects a tampered param', () => {
        const sig = computeVonageSignature(SIGNATURE_SECRET, PARAMS);
        expect(verifyVonageSignature(SIGNATURE_SECRET, sig, { ...PARAMS, to: '+19998887777' })).toBe(false);
    });

    it('rejects a wrong secret', () => {
        const sig = computeVonageSignature(SIGNATURE_SECRET, PARAMS);
        expect(verifyVonageSignature('wrong-secret', sig, PARAMS)).toBe(false);
    });

    it('rejects a missing/empty sig', () => {
        expect(verifyVonageSignature(SIGNATURE_SECRET, undefined, PARAMS)).toBe(false);
        expect(verifyVonageSignature(SIGNATURE_SECRET, '', PARAMS)).toBe(false);
    });

    it('is order-independent (params sorted by key before concat)', () => {
        const reordered: Record<string, string> = {
            to: PARAMS.to,
            uuid: PARAMS.uuid,
            from: PARAMS.from,
            timestamp: PARAMS.timestamp,
            conversation_uuid: PARAMS.conversation_uuid,
        };
        const sig = computeVonageSignature(SIGNATURE_SECRET, PARAMS);
        expect(verifyVonageSignature(SIGNATURE_SECRET, sig, reordered)).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// JWT (HS256) verification.
// ──────────────────────────────────────────────────────────────────────────────

/** Builds a minimal HS256 JWT with the given claims, signed by the secret (the Vonage scheme). */
function makeJwt(secret: string, claims: Record<string, unknown>): string {
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const sig = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`, 'utf8').digest('base64url');
    return `${headerB64}.${payloadB64}.${sig}`;
}

describe('verifyVonageJwt', () => {
    const NOW = 1700000000;

    it('verifies a well-signed, unexpired token and returns its claims', () => {
        const token = makeJwt(SIGNATURE_SECRET, { application_id: 'app-1', exp: NOW + 60 });
        const claims = verifyVonageJwt(SIGNATURE_SECRET, `Bearer ${token}`, NOW);
        expect(claims).not.toBeNull();
        expect(claims?.application_id).toBe('app-1');
    });

    it('accepts a raw token without the Bearer prefix', () => {
        const token = makeJwt(SIGNATURE_SECRET, { exp: NOW + 60 });
        expect(verifyVonageJwt(SIGNATURE_SECRET, token, NOW)).not.toBeNull();
    });

    it('rejects a mis-signed token (wrong secret)', () => {
        const token = makeJwt('other-secret', { exp: NOW + 60 });
        expect(verifyVonageJwt(SIGNATURE_SECRET, `Bearer ${token}`, NOW)).toBeNull();
    });

    it('rejects an expired token', () => {
        const token = makeJwt(SIGNATURE_SECRET, { exp: NOW - 1 });
        expect(verifyVonageJwt(SIGNATURE_SECRET, `Bearer ${token}`, NOW)).toBeNull();
    });

    it('rejects a malformed token + a missing header', () => {
        expect(verifyVonageJwt(SIGNATURE_SECRET, 'not.a.jwt.too.many.parts', NOW)).toBeNull();
        expect(verifyVonageJwt(SIGNATURE_SECRET, 'onlyonepart', NOW)).toBeNull();
        expect(verifyVonageJwt(SIGNATURE_SECRET, undefined, NOW)).toBeNull();
    });
});

describe('buildInboundAnswerNcco', () => {
    it('connects the inbound call to the media WSS endpoint via a connect websocket action', () => {
        const ncco = buildInboundAnswerNcco('wss://api.example/telephony/vonage/media');
        expect(ncco[0].action).toBe('connect');
        expect(ncco[0].endpoint?.[0]).toMatchObject({
            type: 'websocket',
            uri: 'wss://api.example/telephony/vonage/media',
        });
    });
});

describe('resolveInboundCall', () => {
    it('maps Vonage webhook params to { callId, from, to } (prefers uuid)', () => {
        const resolved = resolveInboundCall({
            uuid: 'CALL-9',
            conversation_uuid: 'CON-9',
            from: '+14158675309',
            to: '+18005551212',
        });
        expect(resolved).toEqual({ callId: 'CALL-9', from: '+14158675309', to: '+18005551212' });
    });

    it('falls back to conversation_uuid when uuid is absent', () => {
        const resolved = resolveInboundCall({ conversation_uuid: 'CON-9', from: '+1', to: '+2' });
        expect(resolved.callId).toBe('CON-9');
    });

    it('throws when a required param is missing', () => {
        expect(() => resolveInboundCall({ from: '+1', to: '+2' })).toThrow(/missing a required param/);
        expect(() => resolveInboundCall({ uuid: 'X', to: '+2' })).toThrow(/from/);
    });
});
