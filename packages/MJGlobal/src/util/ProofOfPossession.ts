/**
 * @fileoverview Proof of possession for bearer tokens, in the DPoP shape (RFC 9449), shared by the browser
 * that holds a key and the server that checks it.
 *
 * The holder makes a P-256 key pair whose private half can never be exported, registers the public half
 * when its token is issued (the server records the key's RFC 7638 thumbprint in the token), and signs a
 * short-lived proof for each protected request. A token copied off the holder's machine is then useless for
 * that request: the copier cannot produce a proof, because the key never left the browser.
 *
 * Uses only the Web Crypto API (`crypto.subtle`), available in browsers (secure contexts) and Node.js 15+.
 */
import { Base64ToBytes, BytesToBase64 } from './BinaryEncoding';

/** The public half of a proof key, as a JWK with only the members RFC 7638 hashes. */
export interface ProofPublicJwk {
    kty: 'EC';
    crv: 'P-256';
    x: string;
    y: string;
}

/** A proof key: the non-extractable private key that signs, and its public JWK that the server records. */
export interface ProofOfPossessionKey {
    PrivateKey: CryptoKey;
    PublicJwk: ProofPublicJwk;
}

/** What one proof is made for. */
export interface ProofOfPossessionRequest {
    /** HTTP method of the protected request (`htm`). */
    Method: string;
    /** Full URL of the protected request (`htu`). */
    Url: string;
    /** The bearer token sent with the request; the proof carries its hash (`ath`), so it works for that token only. */
    AccessToken: string;
    /** Signing time (`iat`), epoch seconds. Defaults to now. */
    NowSeconds?: number;
}

/** What the verifier expects of a proof. */
export interface ProofOfPossessionExpectation {
    Method: string;
    /**
     * The path the proof must name, matched as a suffix of the proof URL's path. This binds a proof to one
     * endpoint, so a proof made for another route of the same API cannot be reused here. The origin and any
     * base path are not compared: one API can be reached under several public origins and base paths (a
     * proxy, `MJAPI_BASE_PATH`), and the caller cannot reliably list them. Leaving them open grants nothing,
     * because only the holder of the bound key can sign a proof, and `ath` ties the proof to one token.
     */
    PathSuffix: string;
    /** The bearer token presented with the proof. */
    AccessToken: string;
    NowSeconds: number;
    /** How far `iat` may be from `NowSeconds`, either way. */
    MaxSkewSeconds: number;
}

/** Why a proof was refused. */
export type ProofOfPossessionRefusal = 'malformed' | 'bad_signature' | 'request_mismatch' | 'token_mismatch' | 'stale';

/** Outcome of {@link VerifyProofOfPossessionJwt}; `Thumbprint` identifies the key that signed. */
export type ProofOfPossessionVerification =
    | { Valid: true; Thumbprint: string }
    | { Valid: false; Reason: ProofOfPossessionRefusal };

const PROOF_TYPE = 'dpop+jwt';
const PROOF_ALGORITHM = 'ES256';
const KEY_ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

/** Creates a proof key. The private key is non-extractable, so no script can read it out, only use it. */
export async function CreateProofOfPossessionKey(): Promise<ProofOfPossessionKey> {
    const subtle = requireSubtle();
    const pair = await subtle.generateKey(KEY_ALGORITHM, false, ['sign', 'verify']);
    const exported = await subtle.exportKey('jwk', pair.publicKey);
    const publicJwk = ToProofPublicJwk(exported);
    if (!publicJwk) {
        throw new Error('CreateProofOfPossessionKey: the generated public key did not export as a P-256 JWK.');
    }
    return { PrivateKey: pair.privateKey, PublicJwk: publicJwk };
}

/** The RFC 7638 SHA-256 thumbprint of a proof key, base64url-encoded (the value of a token's `cnf.jkt`). */
export async function ComputeJwkThumbprint(jwk: ProofPublicJwk): Promise<string> {
    // RFC 7638 §3.2: the required members only, in lexicographic order, with no whitespace.
    const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
    return sha256Base64Url(canonical);
}

/** Signs a proof that the holder of `key` is making `request`. */
export async function CreateProofOfPossessionJwt(key: ProofOfPossessionKey, request: ProofOfPossessionRequest): Promise<string> {
    const header = { typ: PROOF_TYPE, alg: PROOF_ALGORITHM, jwk: key.PublicJwk };
    const payload = {
        htm: request.Method,
        htu: request.Url,
        iat: request.NowSeconds ?? Math.floor(Date.now() / 1000),
        jti: bytesToBase64Url(requireCrypto().getRandomValues(new Uint8Array(16))),
        ath: await sha256Base64Url(request.AccessToken),
    };
    const signingInput = `${encodeJsonPart(header)}.${encodeJsonPart(payload)}`;
    const signature = await requireSubtle().sign(SIGN_ALGORITHM, key.PrivateKey, new TextEncoder().encode(signingInput));
    return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Checks a proof against what the request expects. Never throws: anything unparseable is `malformed`.
 * Does not keep a replay cache of `jti`; a proof is bound to one token (`ath`) and to `MaxSkewSeconds`, so a
 * replay needs both the proof and that token within the window.
 */
export async function VerifyProofOfPossessionJwt(proof: string, expected: ProofOfPossessionExpectation): Promise<ProofOfPossessionVerification> {
    const parts = typeof proof === 'string' ? proof.split('.') : [];
    if (parts.length !== 3) {
        return { Valid: false, Reason: 'malformed' };
    }
    const header = decodeJsonPart(parts[0]);
    const payload = decodeJsonPart(parts[1]);
    const signature = decodeBase64Url(parts[2]);
    if (!header || !payload || !signature || header.typ !== PROOF_TYPE || header.alg !== PROOF_ALGORITHM) {
        return { Valid: false, Reason: 'malformed' };
    }
    const jwk = ToProofPublicJwk(header.jwk);
    if (!jwk) {
        return { Valid: false, Reason: 'malformed' };
    }
    const signed = await verifySignature(jwk, `${parts[0]}.${parts[1]}`, signature);
    if (!signed) {
        return { Valid: false, Reason: 'bad_signature' };
    }
    if (payload.htm !== expected.Method || !pathEndsWith(payload.htu, expected.PathSuffix)) {
        return { Valid: false, Reason: 'request_mismatch' };
    }
    if (typeof payload.iat !== 'number' || Math.abs(expected.NowSeconds - payload.iat) > expected.MaxSkewSeconds) {
        return { Valid: false, Reason: 'stale' };
    }
    if (payload.ath !== (await sha256Base64Url(expected.AccessToken))) {
        return { Valid: false, Reason: 'token_mismatch' };
    }
    return { Valid: true, Thumbprint: await ComputeJwkThumbprint(jwk) };
}

/**
 * Narrows a value (e.g. a JWK a client sent) to a public P-256 JWK, keeping only the members RFC 7638 hashes;
 * null for anything else, including a JWK that carries a private key.
 */
export function ToProofPublicJwk(value: unknown): ProofPublicJwk | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const jwk = value as Record<string, unknown>;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string' || 'd' in jwk) {
        return null;
    }
    return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

async function verifySignature(jwk: ProofPublicJwk, signingInput: string, signature: Uint8Array): Promise<boolean> {
    try {
        const subtle = requireSubtle();
        const publicKey = await subtle.importKey('jwk', { ...jwk, ext: true }, KEY_ALGORITHM, false, ['verify']);
        return await subtle.verify(SIGN_ALGORITHM, publicKey, signature as BufferSource, new TextEncoder().encode(signingInput));
    } catch {
        // An unimportable key (e.g. coordinates off the curve) is the same as a bad signature: the proof is refused.
        return false;
    }
}

function pathEndsWith(url: unknown, suffix: string): boolean {
    if (typeof url !== 'string') {
        return false;
    }
    try {
        return new URL(url).pathname.endsWith(suffix);
    } catch {
        return false;
    }
}

async function sha256Base64Url(text: string): Promise<string> {
    const digest = await requireSubtle().digest('SHA-256', new TextEncoder().encode(text));
    return bytesToBase64Url(new Uint8Array(digest));
}

function encodeJsonPart(value: object): string {
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJsonPart(part: string): Record<string, unknown> | null {
    const bytes = decodeBase64Url(part);
    if (!bytes) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function bytesToBase64Url(bytes: Uint8Array): string {
    return BytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(part: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]+$/.test(part)) {
        return null;
    }
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    try {
        return Base64ToBytes(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    } catch {
        return null;
    }
}

function requireCrypto(): Crypto {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('Web Crypto API not available: proof of possession needs a secure context. Serve the page over HTTPS (or from localhost).');
    }
    return crypto;
}

function requireSubtle(): SubtleCrypto {
    return requireCrypto().subtle;
}
