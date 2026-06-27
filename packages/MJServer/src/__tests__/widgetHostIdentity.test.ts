import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';
import { verifyHostAssertion, extractHostIdentity } from '../widget/host-identity.js';
import { buildWidgetGuestClaims } from '../widget/widgetCore.js';

/** A throwaway RSA keypair for signing test host assertions. */
function keypair(): { privatePem: string; publicPem: string } {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return {
        privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
        publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    };
}

const WIDGET_KEY = 'pk_live_acme';

function sign(privatePem: string, claims: Record<string, unknown>, opts: jwt.SignOptions = {}): string {
    return jwt.sign(claims, privatePem, { algorithm: 'RS256', audience: WIDGET_KEY, expiresIn: '5m', ...opts });
}

describe('verifyHostAssertion', () => {
    it('accepts a valid host assertion and extracts the identity', () => {
        const kp = keypair();
        const token = sign(kp.privatePem, { email: 'jane@acme.com', given_name: 'Jane', family_name: 'Doe', sub: 'host-123' });
        const result = verifyHostAssertion(token, kp.publicPem, WIDGET_KEY);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.identity).toMatchObject({ email: 'jane@acme.com', firstName: 'Jane', lastName: 'Doe', hostUserId: 'host-123' });
        }
    });

    it('rejects a missing assertion', () => {
        const kp = keypair();
        expect(verifyHostAssertion(undefined, kp.publicPem, WIDGET_KEY)).toEqual({ ok: false, errorCode: 'missing' });
    });

    it('rejects when no host key is configured (fail-closed)', () => {
        const kp = keypair();
        const token = sign(kp.privatePem, { email: 'x@y.com' });
        expect(verifyHostAssertion(token, undefined, WIDGET_KEY)).toEqual({ ok: false, errorCode: 'no_key' });
    });

    it('rejects a signature from the wrong key', () => {
        const signer = keypair();
        const other = keypair();
        const token = sign(signer.privatePem, { email: 'x@y.com' });
        expect(verifyHostAssertion(token, other.publicPem, WIDGET_KEY)).toEqual({ ok: false, errorCode: 'bad_signature' });
    });

    it('rejects a wrong-audience assertion', () => {
        const kp = keypair();
        const token = sign(kp.privatePem, { email: 'x@y.com' }, { audience: 'pk_live_someone_else' });
        expect(verifyHostAssertion(token, kp.publicPem, WIDGET_KEY)).toEqual({ ok: false, errorCode: 'bad_signature' });
    });

    it('rejects an expired assertion', () => {
        const kp = keypair();
        const token = sign(kp.privatePem, { email: 'x@y.com' }, { expiresIn: -10 });
        expect(verifyHostAssertion(token, kp.publicPem, WIDGET_KEY)).toEqual({ ok: false, errorCode: 'expired' });
    });

    it('rejects an assertion with no email', () => {
        const kp = keypair();
        const token = sign(kp.privatePem, { given_name: 'NoEmail' });
        expect(verifyHostAssertion(token, kp.publicPem, WIDGET_KEY)).toEqual({ ok: false, errorCode: 'no_email' });
    });
});

describe('buildWidgetGuestClaims with hostIdentity', () => {
    it('carries the host identity as INFORMATIONAL claims but keeps the Anonymous principal email', () => {
        const claims = buildWidgetGuestClaims({
            issuer: 'iss',
            audience: 'mj-magic-link',
            widgetId: 'W',
            sessionId: 's',
            anonymousEmail: 'anonymous@magic-link.local',
            applicationId: 'A',
            guestRoleName: 'Widget Guest',
            nowSeconds: 1000,
            ttlSeconds: 900,
            hostIdentity: { email: 'jane@acme.com', firstName: 'Jane', lastName: 'Doe' },
        });
        // Principal-resolving email stays anonymous (no escalation into a real account).
        expect(claims.email).toBe('anonymous@magic-link.local');
        expect(claims.mj_anon).toBe(true);
        // Host identity rides as informational claims.
        expect(claims.mj_host_email).toBe('jane@acme.com');
        expect(claims.given_name).toBe('Jane');
        expect(claims.name).toBe('Jane Doe');
    });
});

describe('extractHostIdentity', () => {
    it('tolerates firstName/lastName fallbacks', () => {
        const id = extractHostIdentity({ email: 'a@b.com', firstName: 'Al', lastName: 'Bo' });
        expect(id).toMatchObject({ email: 'a@b.com', firstName: 'Al', lastName: 'Bo' });
    });
});
