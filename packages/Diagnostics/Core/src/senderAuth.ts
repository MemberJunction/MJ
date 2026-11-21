/**
 * Registered-sender request authentication for the diagnostics intake (`MJDiag-Ed25519`).
 *
 * A sender signs each intake request with its installation `Ed25519` private key. The signature
 * covers the UTF-8 canonical string
 * `mjdiag-http-v1:${METHOD}:${path}:${aud}:${installId}:${ts}:${nonce}:${bodySha256}` and travels in
 * `Authorization: MJDiag-Ed25519 keyId="…",installId="…",aud="…",ts="…",nonce="…",sig="…"`.
 *
 * Enrolment proves possession of a new key with a signature over
 * `mjdiag-enrol-v1:${installId}:${keyId}:${registrationCode}:${aud}`.
 *
 * Keys use the formats `GenerateDiagnosticKeyPair('Ed25519')` returns (SPKI public, PKCS#8 private,
 * Base64). Everything runs on WebCrypto, so the module works in browsers and Node 20+. Replay
 * protection and registration lookups belong to the collector, not to this module.
 */

import { Base64ToBytes, BytesToBase64 } from './crypto.js';

export const MJDIAG_HTTP_AUTH_SCHEME = 'MJDiag-Ed25519';
export const MJDIAG_HTTP_CANONICAL_PREFIX = 'mjdiag-http-v1';
export const MJDIAG_ENROL_CANONICAL_PREFIX = 'mjdiag-enrol-v1';
export const MJDIAG_MAX_CLOCK_SKEW_SECONDS = 300;

/** The parsed parameters of an `MJDiag-Ed25519` Authorization header. */
export interface MJDiagSenderAssertion {
    KeyID: string;
    InstallID: string;
    Audience: string;
    /** Unix time in seconds. */
    Timestamp: number;
    Nonce: string;
    SignatureBase64: string;
}

export type MJDiagAssertionFailure = 'malformed' | 'skew' | 'audience' | 'signature';

const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const PARAM_NAMES = ['keyId', 'installId', 'aud', 'ts', 'nonce', 'sig'] as const;
type ParamName = (typeof PARAM_NAMES)[number];
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_HEADER_LENGTH = 4096;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function toBytes(data: Uint8Array | string): Uint8Array {
    return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

/** Pads a message to whole 64-byte SHA-256 blocks with the bit length at the end. */
function padSha256Message(message: Uint8Array): Uint8Array {
    const totalLength = Math.ceil((message.byteLength + 9) / 64) * 64;
    const padded = new Uint8Array(totalLength);
    padded.set(message);
    padded[message.byteLength] = 0x80;
    const view = new DataView(padded.buffer);
    const bitLength = message.byteLength * 8;
    view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(totalLength - 4, bitLength >>> 0, false);
    return padded;
}

function rotr(value: number, bits: number): number {
    return (value >>> bits) | (value << (32 - bits));
}

/** Runs the SHA-256 compression function on one 64-byte block, updating `state`. */
function compressSha256Block(state: Uint32Array, view: DataView, offset: number, w: Uint32Array): void {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) state[i] = (state[i] + next[i]) >>> 0;
}

/**
 * Returns the lower-case hex SHA-256 of `data` (a string is hashed as UTF-8).
 * Synchronous and dependency-free so it runs the same in browsers and Node.
 */
export function Sha256Hex(data: Uint8Array | string): string {
    const padded = padSha256Message(toBytes(data));
    const view = new DataView(padded.buffer);
    const state = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.byteLength; offset += 64) {
        compressSha256Block(state, view, offset, w);
    }
    return Array.from(state, (word) => word.toString(16).padStart(8, '0')).join('');
}

/** Builds the string a sender signs for one intake request. */
export function BuildCanonicalRequestString(p: {
    Method: string;
    Path: string;
    Audience: string;
    InstallID: string;
    Timestamp: number;
    Nonce: string;
    BodySha256Hex: string;
}): string {
    return [
        MJDIAG_HTTP_CANONICAL_PREFIX,
        p.Method.toUpperCase(),
        p.Path,
        p.Audience,
        p.InstallID,
        String(p.Timestamp),
        p.Nonce,
        p.BodySha256Hex.toLowerCase(),
    ].join(':');
}

async function signUtf8(text: string, privateKeyBase64: string): Promise<string> {
    const subtle = globalThis.crypto.subtle;
    const key = await subtle.importKey('pkcs8', toArrayBuffer(Base64ToBytes(privateKeyBase64)), { name: 'Ed25519' }, false, ['sign']);
    const signature = await subtle.sign({ name: 'Ed25519' }, key, toArrayBuffer(new TextEncoder().encode(text)));
    return BytesToBase64(new Uint8Array(signature));
}

/** Verifies an Ed25519 signature over a UTF-8 string. Returns false for any bad key or signature. */
async function verifyUtf8(text: string, signatureBase64: string, publicKeyBase64: string): Promise<boolean> {
    try {
        const subtle = globalThis.crypto.subtle;
        const key = await subtle.importKey('spki', toArrayBuffer(Base64ToBytes(publicKeyBase64)), { name: 'Ed25519' }, false, ['verify']);
        return await subtle.verify(
            { name: 'Ed25519' },
            key,
            toArrayBuffer(Base64ToBytes(signatureBase64)),
            toArrayBuffer(new TextEncoder().encode(text))
        );
    } catch {
        return false;
    }
}

/** Signs one intake request and returns the `Authorization` header value and the assertion. */
export async function SignSenderRequest(p: {
    Method: string;
    Path: string;
    Audience: string;
    InstallID: string;
    KeyID: string;
    PrivateKeyBase64: string;
    Body: Uint8Array | string;
    Now?: Date;
    Nonce?: string;
}): Promise<{ AuthorizationHeader: string; Assertion: MJDiagSenderAssertion }> {
    const timestamp = Math.floor((p.Now ?? new Date()).getTime() / 1000);
    const nonce = p.Nonce ?? globalThis.crypto.randomUUID();
    const canonical = BuildCanonicalRequestString({
        Method: p.Method,
        Path: p.Path,
        Audience: p.Audience,
        InstallID: p.InstallID,
        Timestamp: timestamp,
        Nonce: nonce,
        BodySha256Hex: Sha256Hex(p.Body),
    });
    const assertion: MJDiagSenderAssertion = {
        KeyID: p.KeyID,
        InstallID: p.InstallID,
        Audience: p.Audience,
        Timestamp: timestamp,
        Nonce: nonce,
        SignatureBase64: await signUtf8(canonical, p.PrivateKeyBase64),
    };
    return { AuthorizationHeader: FormatSenderAuthorizationHeader(assertion), Assertion: assertion };
}

/** Formats an assertion as an `MJDiag-Ed25519` Authorization header value. */
export function FormatSenderAuthorizationHeader(a: MJDiagSenderAssertion): string {
    return (
        `${MJDIAG_HTTP_AUTH_SCHEME} keyId="${a.KeyID}",installId="${a.InstallID}",aud="${a.Audience}",` +
        `ts="${a.Timestamp}",nonce="${a.Nonce}",sig="${a.SignatureBase64}"`
    );
}

/** Reads `name="value"` pairs separated by commas. Returns null on any syntax error or repeat. */
function parseHeaderParams(text: string): Map<string, string> | null {
    const params = new Map<string, string>();
    const pattern = /\s*([A-Za-z]+)="([^"]*)"\s*(,|$)/y;
    let index = 0;
    while (index < text.length) {
        pattern.lastIndex = index;
        const match = pattern.exec(text);
        if (!match || params.has(match[1])) return null;
        params.set(match[1], match[2]);
        index = pattern.lastIndex;
        if (match[3] === '' && index < text.length) return null;
        if (match[3] === ',' && index >= text.length) return null;
    }
    return params;
}

/** Returns the six known parameters when every one is present and non-empty, else null. */
function readKnownParams(params: Map<string, string>): Record<ParamName, string> | null {
    if (params.size !== PARAM_NAMES.length) return null;
    const out = {} as Record<ParamName, string>;
    for (const name of PARAM_NAMES) {
        const value = params.get(name);
        if (!value) return null;
        out[name] = value;
    }
    return out;
}

/**
 * Parses an `MJDiag-Ed25519` Authorization header. Strict: the scheme and exactly the six quoted
 * parameters `keyId`, `installId`, `aud`, `ts` (unix seconds), `nonce` (UUID) and `sig` must be
 * present; anything else returns null.
 */
export function ParseSenderAuthorizationHeader(value: string | undefined | null): MJDiagSenderAssertion | null {
    if (!value || value.length > MAX_HEADER_LENGTH) return null;
    const prefix = `${MJDIAG_HTTP_AUTH_SCHEME} `;
    if (!value.startsWith(prefix)) return null;
    const parsed = parseHeaderParams(value.slice(prefix.length).trim());
    const params = parsed ? readKnownParams(parsed) : null;
    if (!params || !/^\d{1,12}$/.test(params.ts) || !UUID_PATTERN.test(params.nonce)) return null;
    return {
        KeyID: params.keyId,
        InstallID: params.installId,
        Audience: params.aud,
        Timestamp: Number(params.ts),
        Nonce: params.nonce,
        SignatureBase64: params.sig,
    };
}

/**
 * Verifies a parsed assertion against the request and the sender's registered public key.
 * Checks clock skew, then the audience, then the signature over the canonical string (which
 * covers the body hash, method and path).
 */
export async function VerifySenderAssertion(p: {
    Assertion: MJDiagSenderAssertion;
    Method: string;
    Path: string;
    ExpectedAudience: string;
    BodySha256Hex: string;
    PublicKeyBase64: string;
    Now?: Date;
    MaxSkewSeconds?: number;
}): Promise<{ Ok: true } | { Ok: false; Reason: MJDiagAssertionFailure }> {
    const a = p.Assertion;
    if (!Number.isFinite(a.Timestamp) || !a.Nonce || !a.InstallID || !a.SignatureBase64) {
        return { Ok: false, Reason: 'malformed' };
    }
    const nowSeconds = Math.floor((p.Now ?? new Date()).getTime() / 1000);
    if (Math.abs(nowSeconds - a.Timestamp) > (p.MaxSkewSeconds ?? MJDIAG_MAX_CLOCK_SKEW_SECONDS)) {
        return { Ok: false, Reason: 'skew' };
    }
    if (a.Audience !== p.ExpectedAudience) {
        return { Ok: false, Reason: 'audience' };
    }
    const canonical = BuildCanonicalRequestString({
        Method: p.Method,
        Path: p.Path,
        Audience: p.ExpectedAudience,
        InstallID: a.InstallID,
        Timestamp: a.Timestamp,
        Nonce: a.Nonce,
        BodySha256Hex: p.BodySha256Hex,
    });
    const ok = await verifyUtf8(canonical, a.SignatureBase64, p.PublicKeyBase64);
    return ok ? { Ok: true } : { Ok: false, Reason: 'signature' };
}

/** Builds the string an enrolling sender signs to prove it holds the new private key. */
export function BuildEnrolProofString(p: { InstallID: string; KeyID: string; RegistrationCode: string; Audience: string }): string {
    return [MJDIAG_ENROL_CANONICAL_PREFIX, p.InstallID, p.KeyID, p.RegistrationCode, p.Audience].join(':');
}

/** Signs the enrolment proof with the new private key. Returns the Base64 signature. */
export async function SignEnrolProof(p: {
    InstallID: string;
    KeyID: string;
    RegistrationCode: string;
    Audience: string;
    PrivateKeyBase64: string;
}): Promise<string> {
    return signUtf8(BuildEnrolProofString(p), p.PrivateKeyBase64);
}

/** Verifies an enrolment proof against the public key being enrolled. */
export async function VerifyEnrolProof(p: {
    InstallID: string;
    KeyID: string;
    RegistrationCode: string;
    Audience: string;
    PublicKeyBase64: string;
    ProofBase64: string;
}): Promise<boolean> {
    if (!p.ProofBase64) return false;
    return verifyUtf8(BuildEnrolProofString(p), p.ProofBase64, p.PublicKeyBase64);
}
