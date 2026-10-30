/**
 * @fileoverview The sign-in handoff between Explorer's connect page and the Excel add-in pane.
 *
 * The pane makes a one-time RSA-OAEP key pair and sends only the public half to Explorer (in the
 * connect page's URL). After the person approves, Explorer seals the new API key to that public key
 * and returns the sealed text in a URL fragment, which the add-in's own page hands to the pane. Only
 * the pane holds the private key, so the API key never appears in a URL, a server log or the
 * browser history in plain text, and a replayed or intercepted envelope is useless.
 *
 * The envelope is hybrid: a fresh AES-GCM key encrypts the payload, and RSA-OAEP wraps that key
 * (RSA-OAEP alone caps the plaintext at ~190 bytes). Uses only Web Crypto, which browsers and
 * Node 20+ both provide as `globalThis.crypto`.
 *
 * Dependency-free on purpose: the pane bundle imports it.
 *
 * @module @memberjunction/excel-addin
 */

/** Bumped when {@link ExcelConnectionPayload} or the envelope changes incompatibly. */
export const EXCEL_HANDOFF_VERSION = 1;

/** What Explorer hands the pane once the person approves the connection. */
export interface ExcelConnectionPayload {
    Version: number;
    /** Echo of the pane's random state, so the pane only accepts the answer to its own request. */
    State: string;
    /** The scoped API key, sent as `X-API-Key`. */
    APIKey: string;
    /** The GraphQL endpoint Explorer itself uses on this host. */
    GraphQLUrl: string;
    UserName: string;
    UserEmail: string;
    /** ISO timestamp, or null for a key that doesn't expire. */
    ExpiresAt: string | null;
}

interface SealedEnvelope {
    V: number;
    /** The AES key, wrapped with RSA-OAEP. */
    K: string;
    IV: string;
    /** The AES-GCM ciphertext of the payload JSON. */
    C: string;
}

const RSA_PARAMS: RsaHashedKeyGenParams = {
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
};
const RSA_IMPORT_PARAMS: RsaHashedImportParams = { name: 'RSA-OAEP', hash: 'SHA-256' };
const MAX_ENCODED_LENGTH = 16384;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Makes the pane's one-time key pair. The private key can't be exported. */
export async function CreateHandoffKeyPair(): Promise<CryptoKeyPair> {
    return subtle().generateKey(RSA_PARAMS, false, ['encrypt', 'decrypt']);
}

/** The public key as base64url JSON Web Key text, safe to put in a URL. */
export async function ExportHandoffPublicKey(publicKey: CryptoKey): Promise<string> {
    const jwk = await subtle().exportKey('jwk', publicKey);
    return EncodeBase64Url(new TextEncoder().encode(JSON.stringify(jwk)));
}

/** A random value the pane checks on the way back. */
export function CreateHandoffState(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return EncodeBase64Url(bytes);
}

/** True when a value from a URL could be one of this module's base64url strings. */
export function IsHandoffToken(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_ENCODED_LENGTH && BASE64URL_PATTERN.test(value);
}

/**
 * Seals a payload to the pane's public key (run by Explorer's connect page).
 * Throws when the public key text is malformed.
 */
export async function SealConnectionPayload(publicKeyText: string, payload: ExcelConnectionPayload): Promise<string> {
    if (!IsHandoffToken(publicKeyText)) {
        throw new Error('The sign-in request from Excel is malformed. Start the sign-in again from Excel.');
    }
    const jwk = JSON.parse(new TextDecoder().decode(DecodeBase64Url(publicKeyText))) as JsonWebKey;
    const publicKey = await subtle().importKey('jwk', jwk, RSA_IMPORT_PARAMS, false, ['encrypt']);
    const aesKey = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
    const rawAes = await subtle().exportKey('raw', aesKey);
    const wrapped = await subtle().encrypt({ name: 'RSA-OAEP' }, publicKey, rawAes);
    const envelope: SealedEnvelope = {
        V: EXCEL_HANDOFF_VERSION,
        K: EncodeBase64Url(new Uint8Array(wrapped)),
        IV: EncodeBase64Url(iv),
        C: EncodeBase64Url(new Uint8Array(ciphertext)),
    };
    return EncodeBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
}

/**
 * Opens a sealed payload with the pane's private key and checks it answers `expectedState`.
 * Throws with a message fit to show the person when anything doesn't match.
 */
export async function OpenConnectionPayload(privateKey: CryptoKey, sealed: string, expectedState: string): Promise<ExcelConnectionPayload> {
    if (!IsHandoffToken(sealed)) {
        throw new Error('The sign-in answer is malformed. Sign in again.');
    }
    const envelope = JSON.parse(new TextDecoder().decode(DecodeBase64Url(sealed))) as Partial<SealedEnvelope>;
    if (envelope.V !== EXCEL_HANDOFF_VERSION || !envelope.K || !envelope.IV || !envelope.C) {
        throw new Error('The sign-in answer came from a different version of MemberJunction. Sign in again.');
    }
    const rawAes = await subtle().decrypt({ name: 'RSA-OAEP' }, privateKey, toBuffer(DecodeBase64Url(envelope.K)));
    const aesKey = await subtle().importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await subtle().decrypt({ name: 'AES-GCM', iv: toBuffer(DecodeBase64Url(envelope.IV)) }, aesKey, toBuffer(DecodeBase64Url(envelope.C)));
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<ExcelConnectionPayload>;
    return validatePayload(payload, expectedState);
}

/** Base64url without padding. */
export function EncodeBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes base64url, with or without padding. */
export function DecodeBase64Url(text: string): Uint8Array {
    const base64 = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function validatePayload(payload: Partial<ExcelConnectionPayload>, expectedState: string): ExcelConnectionPayload {
    if (payload.Version !== EXCEL_HANDOFF_VERSION || payload.State !== expectedState) {
        throw new Error('That sign-in answer wasn\'t for this window. Sign in again.');
    }
    if (typeof payload.APIKey !== 'string' || !payload.APIKey || typeof payload.GraphQLUrl !== 'string' || !isHttpUrl(payload.GraphQLUrl)) {
        throw new Error('The sign-in answer is incomplete. Sign in again.');
    }
    return {
        Version: payload.Version,
        State: payload.State,
        APIKey: payload.APIKey,
        GraphQLUrl: payload.GraphQLUrl,
        UserName: typeof payload.UserName === 'string' ? payload.UserName : '',
        UserEmail: typeof payload.UserEmail === 'string' ? payload.UserEmail : '',
        ExpiresAt: typeof payload.ExpiresAt === 'string' ? payload.ExpiresAt : null,
    };
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

/** Copies bytes into a standalone ArrayBuffer, which every Web Crypto implementation accepts. */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return copy.buffer;
}

function subtle(): SubtleCrypto {
    const s = globalThis.crypto?.subtle;
    if (!s) {
        throw new Error('This browser can\'t do the encryption sign-in needs. Use a current version of Excel.');
    }
    return s;
}
