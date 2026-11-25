/**
 * Hybrid Envelope Cryptography for `.mjdiag.enc` bundles using WebCrypto (`crypto.subtle`):
 * - Key Agreement: Ephemeral `X25519` + `HKDF-SHA256` (`info = "mjdiag-v1-aead"`)
 * - Symmetric AEAD: `AES-256-GCM` with 96-bit CSPRNG IV and unencrypted header bound as `additionalData` (AAD)
 * - Authority Key Pinning: `Ed25519` signature verification over `keyId || publicKey`
 * - Sender Authentication: Optional `Ed25519` customer signature over `manifestSha256 || ephemeralPublicKey`
 *
 * Binary Envelope Wire Format (`.mjdiag.enc`):
 *   - Bytes 0..3: Magic ASCII `"MJDB"` (`0x4d, 0x4a, 0x44, 0x42`)
 *   - Byte 4: Format version `0x01`
 *   - Bytes 5..8: Uint32BE JSON header length `L` (max 16384 bytes)
 *   - Bytes 9..(9 + L - 1): UTF-8 JSON `EncryptedEnvelopeHeader`
 *   - Bytes (9 + L)..end: `AES-256-GCM` ciphertext + 128-bit authentication tag
 */

import { ComputeSha256Hex, VerifyBundleArchive, type BundleArchiveVerificationResult } from './archive.js';

const ENVELOPE_MAGIC = new Uint8Array([0x4d, 0x4a, 0x44, 0x42]); // "MJDB"
const ENVELOPE_VERSION = 0x01;
const MAX_HEADER_BYTES = 16384;
const HKDF_INFO_BYTES = new TextEncoder().encode('mjdiag-v1-aead');

export interface DiagnosticKeyPair {
    algorithm: 'X25519' | 'Ed25519';
    keyId: string;
    publicKeyBase64: string;
    privateKeyBase64: string;
}

export interface EncryptedEnvelopeHeader {
    version: 1;
    algorithm: 'X25519-HKDF-SHA256-AES256GCM';
    recipientKeyId: string;
    ephemeralPublicKeyBase64: string;
    hkdfSaltBase64: string;
    ivBase64: string;
    senderEnvironmentId?: string;
    senderKeyId?: string;
    senderSignatureBase64?: string;
    /** SHA-256 hex of the plaintext `.mjdiag` archive; covered by the sender signature. */
    manifestSha256?: string;
    createdAt: string;
}

export function BytesToBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    }
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function Base64ToBytes(b64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(b64, 'base64');
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

/**
 * Generates an `X25519` or `Ed25519` keypair exported as SPKI (public) and PKCS#8 (private) Base64 strings.
 */
export async function GenerateDiagnosticKeyPair(
    algorithm: 'X25519' | 'Ed25519',
    keyId?: string
): Promise<DiagnosticKeyPair> {
    const subtle = globalThis.crypto.subtle;
    const resolvedKeyId = keyId ?? `${algorithm.toLowerCase()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
    const usages: KeyUsage[] = algorithm === 'X25519' ? ['deriveBits'] : ['sign', 'verify'];
    const pair = (await subtle.generateKey({ name: algorithm }, true, usages)) as CryptoKeyPair;
    const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey));
    const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
    return {
        algorithm,
        keyId: resolvedKeyId,
        publicKeyBase64: BytesToBase64(spki),
        privateKeyBase64: BytesToBase64(pkcs8),
    };
}

/**
 * Signs a recipient's X25519 public key (`keyId` + `publicKeyBase64`) using an Ed25519 authority private key.
 */
export async function SignRecipientPublicKey(
    keyId: string,
    recipientPublicKeyBase64: string,
    authorityPrivateKeyBase64: string
): Promise<string> {
    const subtle = globalThis.crypto.subtle;
    const signingKey = await subtle.importKey(
        'pkcs8',
        toArrayBuffer(Base64ToBytes(authorityPrivateKeyBase64)),
        { name: 'Ed25519' },
        false,
        ['sign']
    );
    const payload = new TextEncoder().encode(`mjdiag-recipient-key-v1:${keyId}:${recipientPublicKeyBase64}`);
    const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, signingKey, toArrayBuffer(payload)));
    return BytesToBase64(sig);
}

/**
 * Verifies an Ed25519 authority signature over a recipient's X25519 public key.
 */
export async function VerifyRecipientPublicKeySignature(
    keyId: string,
    recipientPublicKeyBase64: string,
    signatureBase64: string,
    authorityPublicKeyBase64: string
): Promise<boolean> {
    try {
        const subtle = globalThis.crypto.subtle;
        const verifyKey = await subtle.importKey(
            'spki',
            toArrayBuffer(Base64ToBytes(authorityPublicKeyBase64)),
            { name: 'Ed25519' },
            false,
            ['verify']
        );
        const payload = new TextEncoder().encode(`mjdiag-recipient-key-v1:${keyId}:${recipientPublicKeyBase64}`);
        return await subtle.verify(
            { name: 'Ed25519' },
            verifyKey,
            toArrayBuffer(Base64ToBytes(signatureBase64)),
            toArrayBuffer(payload)
        );
    } catch {
        return false;
    }
}

/**
 * Builds the string the envelope sender signature covers:
 * `mjdiag-sender-v1:${recipientKeyId}:${ephemeralPublicKeyBase64}:${manifestSha256}`.
 */
export function BuildEnvelopeSenderSignatureString(
    recipientKeyId: string,
    ephemeralPublicKeyBase64: string,
    manifestSha256?: string
): string {
    return `mjdiag-sender-v1:${recipientKeyId}:${ephemeralPublicKeyBase64}:${manifestSha256 ?? ''}`;
}

export interface EncryptDiagnosticBundleOptions {
    recipientKeyId: string;
    recipientPublicKeyBase64: string;
    recipientKeySignatureBase64?: string;
    pinnedAuthorityPublicKeyBase64?: string;
    senderSigningPrivateKeyBase64?: string;
    senderKeyId?: string;
    senderEnvironmentId?: string;
    manifestSha256?: string;
}

async function deriveAesGcmKey(sharedSecretBytes: Uint8Array, saltBytes: Uint8Array): Promise<CryptoKey> {
    const subtle = globalThis.crypto.subtle;
    const baseKey = await subtle.importKey('raw', toArrayBuffer(sharedSecretBytes), 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: toArrayBuffer(saltBytes),
            info: toArrayBuffer(HKDF_INFO_BYTES),
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a `.mjdiag` ZIP archive into a `.mjdiag.enc` authenticated hybrid envelope.
 * Binds the unencrypted 9+L byte prefix as AES-256-GCM Additional Authenticated Data (AAD).
 */
export async function EncryptDiagnosticBundle(
    archiveBytes: Uint8Array,
    options: EncryptDiagnosticBundleOptions
): Promise<Uint8Array> {
    if (options.pinnedAuthorityPublicKeyBase64) {
        if (!options.recipientKeySignatureBase64) {
            throw new Error('Pinned authority public key configured, but recipient key signature is missing');
        }
        const verified = await VerifyRecipientPublicKeySignature(
            options.recipientKeyId,
            options.recipientPublicKeyBase64,
            options.recipientKeySignatureBase64,
            options.pinnedAuthorityPublicKeyBase64
        );
        if (!verified) {
            throw new Error('Recipient public key failed Ed25519 authority signature verification');
        }
    }

    const subtle = globalThis.crypto.subtle;
    const recipientPublicKey = await subtle.importKey(
        'spki',
        toArrayBuffer(Base64ToBytes(options.recipientPublicKeyBase64)),
        { name: 'X25519' },
        false,
        []
    );

    const ephemeralPair = (await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
    const ephemeralSpki = new Uint8Array(await subtle.exportKey('spki', ephemeralPair.publicKey));
    const ephemeralPublicKeyBase64 = BytesToBase64(ephemeralSpki);

    const sharedBits = await subtle.deriveBits(
        { name: 'X25519', public: recipientPublicKey },
        ephemeralPair.privateKey,
        256
    );
    const sharedSecret = new Uint8Array(sharedBits);

    const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await deriveAesGcmKey(sharedSecret, salt);

    let senderSignatureBase64: string | undefined;
    if (options.senderSigningPrivateKeyBase64) {
        const senderKey = await subtle.importKey(
            'pkcs8',
            toArrayBuffer(Base64ToBytes(options.senderSigningPrivateKeyBase64)),
            { name: 'Ed25519' },
            false,
            ['sign']
        );
        const sigInput = new TextEncoder().encode(
            BuildEnvelopeSenderSignatureString(options.recipientKeyId, ephemeralPublicKeyBase64, options.manifestSha256)
        );
        const sigBytes = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, senderKey, toArrayBuffer(sigInput)));
        senderSignatureBase64 = BytesToBase64(sigBytes);
    }

    const header: EncryptedEnvelopeHeader = {
        version: 1,
        algorithm: 'X25519-HKDF-SHA256-AES256GCM',
        recipientKeyId: options.recipientKeyId,
        ephemeralPublicKeyBase64,
        hkdfSaltBase64: BytesToBase64(salt),
        ivBase64: BytesToBase64(iv),
        ...(options.senderEnvironmentId ? { senderEnvironmentId: options.senderEnvironmentId } : {}),
        ...(options.senderKeyId ? { senderKeyId: options.senderKeyId } : {}),
        ...(senderSignatureBase64 ? { senderSignatureBase64 } : {}),
        ...(options.manifestSha256 ? { manifestSha256: options.manifestSha256 } : {}),
        createdAt: new Date().toISOString(),
    };

    const headerJsonBytes = new TextEncoder().encode(JSON.stringify(header));
    if (headerJsonBytes.byteLength > MAX_HEADER_BYTES) {
        throw new Error(`Envelope header exceeds maximum allowed size (${MAX_HEADER_BYTES} bytes)`);
    }

    const prefixLen = 9 + headerJsonBytes.byteLength;
    const prefix = new Uint8Array(prefixLen);
    prefix.set(ENVELOPE_MAGIC, 0);
    prefix[4] = ENVELOPE_VERSION;
    const prefixView = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
    prefixView.setUint32(5, headerJsonBytes.byteLength, false);
    prefix.set(headerJsonBytes, 9);

    const ciphertextBuffer = await subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: toArrayBuffer(iv),
            additionalData: toArrayBuffer(prefix),
            tagLength: 128,
        },
        aesKey,
        toArrayBuffer(archiveBytes)
    );
    const ciphertext = new Uint8Array(ciphertextBuffer);

    const envelope = new Uint8Array(prefix.byteLength + ciphertext.byteLength);
    envelope.set(prefix, 0);
    envelope.set(ciphertext, prefix.byteLength);
    return envelope;
}

export interface EnvelopeHeaderInspectionResult {
    valid: boolean;
    reasonCode?: string;
    reason?: string;
    header?: EncryptedEnvelopeHeader;
    prefixBytes?: Uint8Array;
    ciphertextOffset?: number;
}

const OPTIONAL_STRING_HEADER_FIELDS = ['senderEnvironmentId', 'senderKeyId', 'senderSignatureBase64', 'manifestSha256'] as const;

/** True when `header` is an object with the required envelope fields, and each optional field present is a string. */
function isValidEnvelopeHeader(header: EncryptedEnvelopeHeader | null): header is EncryptedEnvelopeHeader {
    if (typeof header !== 'object' || header === null || Array.isArray(header)) {
        return false;
    }
    const requiredOk =
        header.version === 1 &&
        header.algorithm === 'X25519-HKDF-SHA256-AES256GCM' &&
        typeof header.recipientKeyId === 'string' &&
        header.recipientKeyId.length > 0 &&
        typeof header.ephemeralPublicKeyBase64 === 'string' &&
        typeof header.hkdfSaltBase64 === 'string' &&
        typeof header.ivBase64 === 'string';
    return requiredOk && OPTIONAL_STRING_HEADER_FIELDS.every((field) => header[field] === undefined || typeof header[field] === 'string');
}

/**
 * Fast `<1ms` pre-check on an uploaded `.mjdiag.enc` buffer before streaming or decrypting.
 * Verifies the `MJDB` magic bytes, version `0x01`, header length bounds, and JSON schema.
 */
export function InspectEncryptedEnvelopeHeader(
    envelopeBytes: Uint8Array,
    allowedRecipientKeyIds?: ReadonlyArray<string>
): EnvelopeHeaderInspectionResult {
    if (envelopeBytes.byteLength < 9 + 16) {
        return { valid: false, reasonCode: 'ENVELOPE_TOO_SMALL', reason: 'Envelope is smaller than minimum header + GCM tag size' };
    }
    for (let i = 0; i < 4; i++) {
        if (envelopeBytes[i] !== ENVELOPE_MAGIC[i]) {
            return { valid: false, reasonCode: 'INVALID_ENVELOPE_MAGIC', reason: 'Invalid magic bytes (expected MJDB)' };
        }
    }
    if (envelopeBytes[4] !== ENVELOPE_VERSION) {
        return { valid: false, reasonCode: 'UNSUPPORTED_ENVELOPE_VERSION', reason: `Unsupported envelope version: ${envelopeBytes[4]}` };
    }
    const view = new DataView(envelopeBytes.buffer, envelopeBytes.byteOffset, envelopeBytes.byteLength);
    const headerLen = view.getUint32(5, false);
    if (headerLen < 20 || headerLen > MAX_HEADER_BYTES) {
        return { valid: false, reasonCode: 'INVALID_HEADER_LENGTH', reason: `Invalid envelope header length (${headerLen})` };
    }
    const ciphertextOffset = 9 + headerLen;
    if (envelopeBytes.byteLength < ciphertextOffset + 16) {
        return { valid: false, reasonCode: 'TRUNCATED_CIPHERTEXT', reason: 'Envelope truncated before GCM authentication tag' };
    }

    let parsed: EncryptedEnvelopeHeader | null;
    try {
        const headerSlice = envelopeBytes.subarray(9, ciphertextOffset);
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(headerSlice)) as EncryptedEnvelopeHeader | null;
    } catch {
        return { valid: false, reasonCode: 'MALFORMED_HEADER_JSON', reason: 'Envelope header is not valid UTF-8 JSON' };
    }

    if (!isValidEnvelopeHeader(parsed)) {
        return { valid: false, reasonCode: 'INVALID_HEADER_FIELDS', reason: 'Envelope header failed schema check' };
    }
    const header = parsed;

    if (allowedRecipientKeyIds && allowedRecipientKeyIds.length > 0) {
        if (!allowedRecipientKeyIds.includes(header.recipientKeyId)) {
            return {
                valid: false,
                reasonCode: 'UNKNOWN_RECIPIENT_KEY_ID',
                reason: `Unknown recipientKeyId "${header.recipientKeyId}"`,
            };
        }
    }

    return {
        valid: true,
        header,
        prefixBytes: envelopeBytes.subarray(0, ciphertextOffset),
        ciphertextOffset,
    };
}

export interface DecryptDiagnosticBundleOptions {
    /**
     * Map of `recipientKeyId` -> PKCS#8 Base64 private key (supports key rotation).
     */
    PrivateKeysByKeyId: Record<string, string>;
    /**
     * Optional map of `senderKeyId` -> SPKI Base64 Ed25519 public key for customer sender verification.
     */
    SenderPublicKeysByKeyId?: Record<string, string>;
    /**
     * If true, rejects bundles that do not carry a valid `senderSignatureBase64`.
     */
    RequireSenderSignature?: boolean;
}

export interface DecryptDiagnosticBundleResult {
    valid: boolean;
    reasonCode?: string;
    reason?: string;
    header?: EncryptedEnvelopeHeader;
    senderVerified: boolean;
    decryptedZipBytes?: Uint8Array;
    archiveVerification?: BundleArchiveVerificationResult;
}

/**
 * Decrypts and verifies a `.mjdiag.enc` envelope:
 * 1. Inspects header and resolves recipient private key by `recipientKeyId`
 * 2. Optionally verifies customer `Ed25519` sender signature
 * 3. Performs `X25519` + `HKDF-SHA256` key derivation and `AES-256-GCM` decryption with header AAD
 * 4. When the header carries `manifestSha256`, requires it to equal the SHA-256 of the decrypted bytes -> `MANIFEST_SHA256_MISMATCH`
 * 5. Runs `VerifyBundleArchive()` on the decrypted `.mjdiag` ZIP bytes
 */
export async function DecryptDiagnosticBundle(
    envelopeBytes: Uint8Array,
    options: DecryptDiagnosticBundleOptions
): Promise<DecryptDiagnosticBundleResult> {
    const allowedIds = Object.keys(options.PrivateKeysByKeyId);
    const inspection = InspectEncryptedEnvelopeHeader(envelopeBytes, allowedIds);
    if (!inspection.valid || !inspection.header || !inspection.prefixBytes || inspection.ciphertextOffset === undefined) {
        return {
            valid: false,
            reasonCode: inspection.reasonCode ?? 'INVALID_ENVELOPE_HEADER',
            reason: inspection.reason,
            senderVerified: false,
        };
    }

    const { header, prefixBytes, ciphertextOffset } = inspection;
    const recipientPrivB64 = options.PrivateKeysByKeyId[header.recipientKeyId];
    if (!recipientPrivB64) {
        return {
            valid: false,
            reasonCode: 'MISSING_PRIVATE_KEY',
            reason: `No private key available for recipientKeyId "${header.recipientKeyId}"`,
            header,
            senderVerified: false,
        };
    }

    const subtle = globalThis.crypto.subtle;
    let senderVerified = false;
    if (header.senderSignatureBase64 && header.senderKeyId && options.SenderPublicKeysByKeyId?.[header.senderKeyId]) {
        try {
            const senderPubKey = await subtle.importKey(
                'spki',
                toArrayBuffer(Base64ToBytes(options.SenderPublicKeysByKeyId[header.senderKeyId])),
                { name: 'Ed25519' },
                false,
                ['verify']
            );
            const sigInput = new TextEncoder().encode(
                BuildEnvelopeSenderSignatureString(header.recipientKeyId, header.ephemeralPublicKeyBase64, header.manifestSha256)
            );
            senderVerified = await subtle.verify(
                { name: 'Ed25519' },
                senderPubKey,
                toArrayBuffer(Base64ToBytes(header.senderSignatureBase64)),
                toArrayBuffer(sigInput)
            );
        } catch {
            senderVerified = false;
        }
    }

    if (options.RequireSenderSignature && !senderVerified) {
        return {
            valid: false,
            reasonCode: 'INVALID_SENDER_SIGNATURE',
            reason: 'Required Ed25519 sender signature is missing or invalid',
            header,
            senderVerified: false,
        };
    }

    let decryptedZipBytes: Uint8Array;
    try {
        const recipientPrivKey = await subtle.importKey(
            'pkcs8',
            toArrayBuffer(Base64ToBytes(recipientPrivB64)),
            { name: 'X25519' },
            false,
            ['deriveBits']
        );
        const ephemeralPubKey = await subtle.importKey(
            'spki',
            toArrayBuffer(Base64ToBytes(header.ephemeralPublicKeyBase64)),
            { name: 'X25519' },
            false,
            []
        );
        const sharedBits = await subtle.deriveBits(
            { name: 'X25519', public: ephemeralPubKey },
            recipientPrivKey,
            256
        );
        const salt = Base64ToBytes(header.hkdfSaltBase64);
        const iv = Base64ToBytes(header.ivBase64);
        const aesKey = await deriveAesGcmKey(new Uint8Array(sharedBits), salt);

        const ciphertext = envelopeBytes.subarray(ciphertextOffset);
        const plainBuffer = await subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: toArrayBuffer(iv),
                additionalData: toArrayBuffer(prefixBytes),
                tagLength: 128,
            },
            aesKey,
            toArrayBuffer(ciphertext)
        );
        decryptedZipBytes = new Uint8Array(plainBuffer);
    } catch (err) {
        return {
            valid: false,
            reasonCode: 'AEAD_AUTH_FAILED',
            reason: `AES-256-GCM authentication or key derivation failed: ${err instanceof Error ? err.message : String(err)}`,
            header,
            senderVerified,
        };
    }

    if (header.manifestSha256) {
        const actualSha256 = await ComputeSha256Hex(decryptedZipBytes);
        if (actualSha256 !== header.manifestSha256.toLowerCase()) {
            return {
                valid: false,
                reasonCode: 'MANIFEST_SHA256_MISMATCH',
                reason: 'Envelope manifestSha256 does not match the SHA-256 of the decrypted archive',
                header,
                senderVerified,
            };
        }
    }

    const archiveVerification = await VerifyBundleArchive(decryptedZipBytes);
    if (!archiveVerification.valid) {
        return {
            valid: false,
            reasonCode: archiveVerification.reasonCode ?? 'INVALID_INNER_ARCHIVE',
            reason: `Decrypted payload failed .mjdiag verification: ${archiveVerification.reason}`,
            header,
            senderVerified,
            decryptedZipBytes,
            archiveVerification,
        };
    }

    return {
        valid: true,
        header,
        senderVerified,
        decryptedZipBytes,
        archiveVerification,
    };
}
