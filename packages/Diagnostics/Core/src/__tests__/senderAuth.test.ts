import { describe, it, expect, beforeAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import {
    GenerateDiagnosticKeyPair,
    type DiagnosticKeyPair,
    Sha256Hex,
    BuildCanonicalRequestString,
    SignSenderRequest,
    ParseSenderAuthorizationHeader,
    FormatSenderAuthorizationHeader,
    VerifySenderAssertion,
    BuildEnrolProofString,
    SignEnrolProof,
    VerifyEnrolProof,
    MJDIAG_HTTP_AUTH_SCHEME,
} from '../index';

const AUD = 'https://collector.example.com/api/diagnostics/intake/v1';
const PATH = '/api/diagnostics/intake/v1/bundles';
const INSTALL = '7c0d1c52-6f1e-4b8e-9a63-0e0d5b8f6a11';
const NOW = new Date('2026-11-02T12:00:00Z');

let keys: DiagnosticKeyPair;
let otherKeys: DiagnosticKeyPair;

beforeAll(async () => {
    keys = await GenerateDiagnosticKeyPair('Ed25519', 'sender-key-1');
    otherKeys = await GenerateDiagnosticKeyPair('Ed25519', 'sender-key-2');
});

async function signBody(body: string) {
    return SignSenderRequest({
        Method: 'post', Path: PATH, Audience: AUD, InstallID: INSTALL, KeyID: keys.keyId,
        PrivateKeyBase64: keys.privateKeyBase64, Body: body, Now: NOW,
    });
}

describe('Sha256Hex', () => {
    it('matches node:crypto for empty, short and multi-block input', () => {
        for (const input of ['', 'abc', 'x'.repeat(55), 'y'.repeat(64), 'z'.repeat(1000)]) {
            expect(Sha256Hex(input)).toBe(createHash('sha256').update(input).digest('hex'));
        }
        const bytes = new Uint8Array(randomBytes(4099));
        expect(Sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    });
});

describe('BuildCanonicalRequestString', () => {
    it('joins the fields with the prefix and upper-cases the method', () => {
        expect(BuildCanonicalRequestString({
            Method: 'put', Path: '/p', Audience: 'aud', InstallID: 'i', Timestamp: 10, Nonce: 'n', BodySha256Hex: 'ABC',
        })).toBe('mjdiag-http-v1:PUT:/p:aud:i:10:n:abc');
    });
});

describe('sign, parse and verify', () => {
    it('round-trips a valid request', async () => {
        const body = '{"installId":"x"}';
        const signed = await signBody(body);
        expect(signed.AuthorizationHeader.startsWith(`${MJDIAG_HTTP_AUTH_SCHEME} `)).toBe(true);
        const parsed = ParseSenderAuthorizationHeader(signed.AuthorizationHeader);
        expect(parsed).toEqual(signed.Assertion);
        const result = await VerifySenderAssertion({
            Assertion: parsed!, Method: 'POST', Path: PATH, ExpectedAudience: AUD,
            BodySha256Hex: Sha256Hex(body), PublicKeyBase64: keys.publicKeyBase64, Now: NOW,
        });
        expect(result).toEqual({ Ok: true });
    });

    it('formats what it parses', async () => {
        const signed = await signBody('');
        expect(FormatSenderAuthorizationHeader(signed.Assertion)).toBe(signed.AuthorizationHeader);
    });

    async function verifyWith(overrides: Partial<Parameters<typeof VerifySenderAssertion>[0]>) {
        const signed = await signBody('body');
        return VerifySenderAssertion({
            Assertion: signed.Assertion, Method: 'POST', Path: PATH, ExpectedAudience: AUD,
            BodySha256Hex: Sha256Hex('body'), PublicKeyBase64: keys.publicKeyBase64, Now: NOW,
            ...overrides,
        });
    }

    it('rejects clock skew over 300 s', async () => {
        expect(await verifyWith({ Now: new Date(NOW.getTime() + 301_000) })).toEqual({ Ok: false, Reason: 'skew' });
        expect(await verifyWith({ Now: new Date(NOW.getTime() - 301_000) })).toEqual({ Ok: false, Reason: 'skew' });
        expect(await verifyWith({ Now: new Date(NOW.getTime() + 300_000) })).toEqual({ Ok: true });
    });

    it('rejects another audience', async () => {
        expect(await verifyWith({ ExpectedAudience: 'https://other.example.com/api/diagnostics/intake/v1' }))
            .toEqual({ Ok: false, Reason: 'audience' });
    });

    it('rejects a changed body, path, method or key', async () => {
        expect(await verifyWith({ BodySha256Hex: Sha256Hex('other') })).toEqual({ Ok: false, Reason: 'signature' });
        expect(await verifyWith({ Path: '/api/diagnostics/intake/v1/enroll' })).toEqual({ Ok: false, Reason: 'signature' });
        expect(await verifyWith({ Method: 'PUT' })).toEqual({ Ok: false, Reason: 'signature' });
        expect(await verifyWith({ PublicKeyBase64: otherKeys.publicKeyBase64 })).toEqual({ Ok: false, Reason: 'signature' });
        expect(await verifyWith({ PublicKeyBase64: 'not-a-key' })).toEqual({ Ok: false, Reason: 'signature' });
    });

    it('rejects a changed install id inside the assertion', async () => {
        const signed = await signBody('body');
        const result = await VerifySenderAssertion({
            Assertion: { ...signed.Assertion, InstallID: 'someone-else' }, Method: 'POST', Path: PATH,
            ExpectedAudience: AUD, BodySha256Hex: Sha256Hex('body'), PublicKeyBase64: keys.publicKeyBase64, Now: NOW,
        });
        expect(result).toEqual({ Ok: false, Reason: 'signature' });
    });

    it('reports malformed for a non-finite timestamp', async () => {
        const signed = await signBody('body');
        const result = await VerifySenderAssertion({
            Assertion: { ...signed.Assertion, Timestamp: Number.NaN }, Method: 'POST', Path: PATH,
            ExpectedAudience: AUD, BodySha256Hex: Sha256Hex('body'), PublicKeyBase64: keys.publicKeyBase64, Now: NOW,
        });
        expect(result).toEqual({ Ok: false, Reason: 'malformed' });
    });
});

describe('ParseSenderAuthorizationHeader', () => {
    const good = 'MJDiag-Ed25519 keyId="k",installId="i",aud="a",ts="1700000000",' +
        'nonce="7c0d1c52-6f1e-4b8e-9a63-0e0d5b8f6a11",sig="c2ln"';

    it('accepts a well-formed header', () => {
        expect(ParseSenderAuthorizationHeader(good)?.Timestamp).toBe(1700000000);
    });

    it.each([
        ['missing', undefined],
        ['empty', ''],
        ['API key', 'Bearer abc'],
        ['wrong scheme', good.replace('MJDiag-Ed25519', 'MJDiag-RSA')],
        ['missing param', good.replace(',sig="c2ln"', '')],
        ['empty param', good.replace('keyId="k"', 'keyId=""')],
        ['extra param', `${good},extra="x"`],
        ['repeated param', good.replace('aud="a"', 'keyId="a"')],
        ['unquoted value', good.replace('ts="1700000000"', 'ts=1700000000')],
        ['non-numeric ts', good.replace('1700000000', '17x0')],
        ['non-uuid nonce', good.replace('7c0d1c52-6f1e-4b8e-9a63-0e0d5b8f6a11', 'abc')],
        ['trailing junk', `${good} junk`],
        ['trailing comma', `${good},`],
    ])('returns null for %s', (_label, value) => {
        expect(ParseSenderAuthorizationHeader(value)).toBeNull();
    });
});

describe('enrolment proof', () => {
    const base = { InstallID: INSTALL, KeyID: 'sender-key-1', RegistrationCode: 'CODE123', Audience: AUD };

    it('builds the proof string', () => {
        expect(BuildEnrolProofString(base)).toBe(`mjdiag-enrol-v1:${INSTALL}:sender-key-1:CODE123:${AUD}`);
    });

    it('verifies a proof signed with the enrolled key', async () => {
        const proof = await SignEnrolProof({ ...base, PrivateKeyBase64: keys.privateKeyBase64 });
        expect(await VerifyEnrolProof({ ...base, PublicKeyBase64: keys.publicKeyBase64, ProofBase64: proof })).toBe(true);
    });

    it('rejects a proof from another key, code or audience', async () => {
        const proof = await SignEnrolProof({ ...base, PrivateKeyBase64: otherKeys.privateKeyBase64 });
        expect(await VerifyEnrolProof({ ...base, PublicKeyBase64: keys.publicKeyBase64, ProofBase64: proof })).toBe(false);
        const own = await SignEnrolProof({ ...base, PrivateKeyBase64: keys.privateKeyBase64 });
        expect(await VerifyEnrolProof({ ...base, RegistrationCode: 'OTHER', PublicKeyBase64: keys.publicKeyBase64, ProofBase64: own })).toBe(false);
        expect(await VerifyEnrolProof({ ...base, Audience: 'x', PublicKeyBase64: keys.publicKeyBase64, ProofBase64: own })).toBe(false);
        expect(await VerifyEnrolProof({ ...base, PublicKeyBase64: keys.publicKeyBase64, ProofBase64: '' })).toBe(false);
    });
});
