import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
    CreateProofOfPossessionKey,
    ComputeJwkThumbprint,
    CreateProofOfPossessionJwt,
    VerifyProofOfPossessionJwt,
    type ProofOfPossessionKey,
} from '../util/ProofOfPossession';

const URL_PATH = '/widget/session/refresh';
const URL = `https://api.example.com/base${URL_PATH}`;
const TOKEN = 'header.payload.signature';
const NOW = 1_792_713_600;

function b64url(bytes: Buffer): string {
    return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePart(part: string): Record<string, unknown> {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function encodePart(value: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function proof(key: ProofOfPossessionKey, overrides: { Method?: string; Url?: string; AccessToken?: string; NowSeconds?: number } = {}): Promise<string> {
    return CreateProofOfPossessionJwt(key, {
        Method: overrides.Method ?? 'POST',
        Url: overrides.Url ?? URL,
        AccessToken: overrides.AccessToken ?? TOKEN,
        NowSeconds: overrides.NowSeconds ?? NOW,
    });
}

/** Signs an arbitrary header and payload with the key, so a test can change one part and still pass the signature check. */
async function signed(key: ProofOfPossessionKey, header: Record<string, unknown>, payload: Record<string, unknown>): Promise<string> {
    const input = `${encodePart(header)}.${encodePart(payload)}`;
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.PrivateKey, new TextEncoder().encode(input));
    return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

function verify(jwt: string, overrides: { AccessToken?: string; NowSeconds?: number } = {}) {
    return VerifyProofOfPossessionJwt(jwt, {
        Method: 'POST',
        PathSuffix: URL_PATH,
        AccessToken: overrides.AccessToken ?? TOKEN,
        NowSeconds: overrides.NowSeconds ?? NOW,
        MaxSkewSeconds: 60,
    });
}

describe('CreateProofOfPossessionKey', () => {
    it('makes a P-256 key whose private half cannot be exported', async () => {
        const key = await CreateProofOfPossessionKey();
        expect(key.PrivateKey.extractable).toBe(false);
        await expect(crypto.subtle.exportKey('jwk', key.PrivateKey)).rejects.toThrow();
        expect(key.PublicJwk).toEqual({ kty: 'EC', crv: 'P-256', x: expect.any(String), y: expect.any(String) });
    });
});

describe('without Web Crypto (a page outside a secure context)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fails with a message a page author can act on: serve the page over HTTPS', async () => {
        vi.stubGlobal('crypto', {});
        await expect(CreateProofOfPossessionKey()).rejects.toThrow(/HTTPS/);
        await expect(CreateProofOfPossessionKey()).rejects.not.toThrow(/Node\.js/);
    });
});

describe('ComputeJwkThumbprint', () => {
    it('is the RFC 7638 SHA-256 thumbprint: required members only, in lexicographic order', async () => {
        const jwk = { kty: 'EC' as const, crv: 'P-256' as const, x: 'xValue', y: 'yValue' };
        const expected = b64url(createHash('sha256').update('{"crv":"P-256","kty":"EC","x":"xValue","y":"yValue"}').digest());
        await expect(ComputeJwkThumbprint(jwk)).resolves.toBe(expected);
    });
});

describe('VerifyProofOfPossessionJwt', () => {
    it('accepts a proof made by the key for this request and token, and returns the key thumbprint', async () => {
        const key = await CreateProofOfPossessionKey();
        const result = await verify(await proof(key));
        expect(result).toEqual({ Valid: true, Thumbprint: await ComputeJwkThumbprint(key.PublicJwk) });
    });

    it('carries the standard DPoP header and claims', async () => {
        const key = await CreateProofOfPossessionKey();
        const [header, payload] = (await proof(key)).split('.');
        expect(decodePart(header)).toEqual({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.PublicJwk });
        expect(decodePart(payload)).toMatchObject({ htm: 'POST', htu: URL, iat: NOW, jti: expect.any(String) });
    });

    it('refuses a proof whose signature does not match its key', async () => {
        const key = await CreateProofOfPossessionKey();
        const other = await CreateProofOfPossessionKey();
        const [, payload, signature] = (await proof(key)).split('.');
        const swapped = `${encodePart({ typ: 'dpop+jwt', alg: 'ES256', jwk: other.PublicJwk })}.${payload}.${signature}`;
        expect((await verify(swapped)).Valid).toBe(false);
    });

    it('refuses a proof made for another token', async () => {
        const key = await CreateProofOfPossessionKey();
        expect(await verify(await proof(key, { AccessToken: 'another.token.value' }))).toEqual({ Valid: false, Reason: 'token_mismatch' });
    });

    it('refuses a proof made for another method or another endpoint', async () => {
        const key = await CreateProofOfPossessionKey();
        expect(await verify(await proof(key, { Method: 'GET' }))).toEqual({ Valid: false, Reason: 'request_mismatch' });
        expect(await verify(await proof(key, { Url: 'https://api.example.com/widget/session' }))).toEqual({ Valid: false, Reason: 'request_mismatch' });
    });

    it('refuses a proof older or newer than the allowed skew', async () => {
        const key = await CreateProofOfPossessionKey();
        expect(await verify(await proof(key, { NowSeconds: NOW - 61 }))).toEqual({ Valid: false, Reason: 'stale' });
        expect(await verify(await proof(key, { NowSeconds: NOW + 61 }))).toEqual({ Valid: false, Reason: 'stale' });
    });

    it('refuses a header that names another algorithm or type, or carries a private key, even when validly signed', async () => {
        const key = await CreateProofOfPossessionKey();
        const payload = decodePart((await proof(key)).split('.')[1]);
        expect(await verify(await signed(key, { typ: 'dpop+jwt', alg: 'none', jwk: key.PublicJwk }, payload))).toEqual({ Valid: false, Reason: 'malformed' });
        expect(await verify(await signed(key, { typ: 'JWT', alg: 'ES256', jwk: key.PublicJwk }, payload))).toEqual({ Valid: false, Reason: 'malformed' });
        expect(await verify(await signed(key, { typ: 'dpop+jwt', alg: 'ES256', jwk: { ...key.PublicJwk, d: 'secret' } }, payload))).toEqual({ Valid: false, Reason: 'malformed' });
    });

    it('accepts a proof re-signed by its own key (control for the header and claim tests)', async () => {
        const key = await CreateProofOfPossessionKey();
        const [header, payload] = (await proof(key)).split('.');
        expect((await verify(await signed(key, decodePart(header), decodePart(payload)))).Valid).toBe(true);
    });

    it('refuses a validly signed proof with no iat, or a non-numeric one', async () => {
        const key = await CreateProofOfPossessionKey();
        const header = decodePart((await proof(key)).split('.')[0]);
        const { iat: _iat, ...withoutIat } = decodePart((await proof(key)).split('.')[1]);
        expect(await verify(await signed(key, header, withoutIat))).toEqual({ Valid: false, Reason: 'stale' });
        expect(await verify(await signed(key, header, { ...withoutIat, iat: String(NOW) }))).toEqual({ Valid: false, Reason: 'stale' });
    });

    it('refuses malformed input without throwing', async () => {
        expect(await verify('')).toEqual({ Valid: false, Reason: 'malformed' });
        expect(await verify('not-a-jwt')).toEqual({ Valid: false, Reason: 'malformed' });
        expect(await verify('a.b.c')).toEqual({ Valid: false, Reason: 'malformed' });
    });
});
