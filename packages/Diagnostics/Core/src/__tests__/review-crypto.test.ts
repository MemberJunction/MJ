import { describe, it, expect, beforeAll } from 'vitest';
import {
    BuildMjdiagArchive,
    GenerateDiagnosticKeyPair,
    SignRecipientPublicKey,
    EncryptDiagnosticBundle,
    DecryptDiagnosticBundle,
    InspectEncryptedEnvelopeHeader,
    type DiagnosticKeyPair,
} from '../index.js';
import { EmptyBundleData } from './reviewFixtures.js';

/** Builds an envelope prefix with `headerJson` as its header, followed by a zeroed 16-byte tag. */
function envelopeWithHeader(headerJson: string): Uint8Array {
    const header = new TextEncoder().encode(headerJson);
    const out = new Uint8Array(9 + header.byteLength + 16);
    out.set([0x4d, 0x4a, 0x44, 0x42, 0x01], 0);
    new DataView(out.buffer).setUint32(5, header.byteLength, false);
    out.set(header, 9);
    return out;
}

/** Returns the byte offset of `text` inside the envelope header. */
function headerOffsetOf(envelope: Uint8Array, text: string): number {
    const headerLen = new DataView(envelope.buffer, envelope.byteOffset).getUint32(5, false);
    const header = new TextDecoder().decode(envelope.subarray(9, 9 + headerLen));
    const idx = header.indexOf(text);
    if (idx < 0) {
        throw new Error(`${text} not in header`);
    }
    return 9 + new TextEncoder().encode(header.slice(0, idx)).byteLength;
}

let recipient: DiagnosticKeyPair;
let sender: DiagnosticKeyPair;
let archive: Uint8Array;

beforeAll(async () => {
    recipient = await GenerateDiagnosticKeyPair('X25519', 'review-recipient');
    sender = await GenerateDiagnosticKeyPair('Ed25519', 'review-sender');
    archive = await BuildMjdiagArchive(EmptyBundleData());
});

describe('InspectEncryptedEnvelopeHeader malformed headers', () => {
    it('returns INVALID_HEADER_FIELDS for a header JSON of null', () => {
        const result = InspectEncryptedEnvelopeHeader(envelopeWithHeader('null'.padEnd(24, ' ')));
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('INVALID_HEADER_FIELDS');
    });

    it('returns INVALID_HEADER_FIELDS when manifestSha256 is not a string', () => {
        const header = {
            version: 1,
            algorithm: 'X25519-HKDF-SHA256-AES256GCM',
            recipientKeyId: 'k',
            ephemeralPublicKeyBase64: 'AA==',
            hkdfSaltBase64: 'AA==',
            ivBase64: 'AA==',
            manifestSha256: 42,
            createdAt: '2026-11-02T00:00:00Z',
        };
        const result = InspectEncryptedEnvelopeHeader(envelopeWithHeader(JSON.stringify(header)));
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('INVALID_HEADER_FIELDS');
    });
});

describe('DecryptDiagnosticBundle signed manifestSha256', () => {
    it('refuses a bundle whose manifestSha256 is not the SHA-256 of the decrypted archive', async () => {
        const envelope = await EncryptDiagnosticBundle(archive, {
            recipientKeyId: recipient.keyId,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            senderSigningPrivateKeyBase64: sender.privateKeyBase64,
            senderKeyId: sender.keyId,
            manifestSha256: 'b'.repeat(64),
        });
        const result = await DecryptDiagnosticBundle(envelope, {
            PrivateKeysByKeyId: { [recipient.keyId]: recipient.privateKeyBase64 },
            SenderPublicKeysByKeyId: { [sender.keyId]: sender.publicKeyBase64 },
            RequireSenderSignature: true,
        });
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('MANIFEST_SHA256_MISMATCH');
    });
});

describe('Envelope checks (mutation-checked)', () => {
    it('binds the header as AAD: a header edit that keeps valid JSON fails authentication', async () => {
        const envelope = await EncryptDiagnosticBundle(archive, {
            recipientKeyId: recipient.keyId,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            senderEnvironmentId: 'env-AAAA',
        });
        const keys = { PrivateKeysByKeyId: { [recipient.keyId]: recipient.privateKeyBase64 } };
        expect((await DecryptDiagnosticBundle(envelope, keys)).valid).toBe(true);

        const tampered = new Uint8Array(envelope);
        tampered[headerOffsetOf(envelope, 'env-AAAA') + 4] = 'B'.charCodeAt(0);
        expect(InspectEncryptedEnvelopeHeader(tampered).header?.senderEnvironmentId).toBe('env-BAAA');
        const result = await DecryptDiagnosticBundle(tampered, keys);
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('AEAD_AUTH_FAILED');
    });

    it('RequireSenderSignature refuses an unsigned bundle and a bundle signed by another key', async () => {
        const other = await GenerateDiagnosticKeyPair('Ed25519', 'review-sender');
        const unsigned = await EncryptDiagnosticBundle(archive, {
            recipientKeyId: recipient.keyId,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
        });
        const wrongSigner = await EncryptDiagnosticBundle(archive, {
            recipientKeyId: recipient.keyId,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            senderSigningPrivateKeyBase64: other.privateKeyBase64,
            senderKeyId: sender.keyId,
        });
        const options = {
            PrivateKeysByKeyId: { [recipient.keyId]: recipient.privateKeyBase64 },
            SenderPublicKeysByKeyId: { [sender.keyId]: sender.publicKeyBase64 },
            RequireSenderSignature: true,
        };
        for (const envelope of [unsigned, wrongSigner]) {
            const result = await DecryptDiagnosticBundle(envelope, options);
            expect(result.valid).toBe(false);
            expect(result.reasonCode).toBe('INVALID_SENDER_SIGNATURE');
        }
    });

    it('authority-key pinning refuses a recipient key signed by another authority or not signed', async () => {
        const authority = await GenerateDiagnosticKeyPair('Ed25519', 'review-authority');
        const rogue = await GenerateDiagnosticKeyPair('Ed25519', 'review-rogue');
        const rogueSignature = await SignRecipientPublicKey(recipient.keyId, recipient.publicKeyBase64, rogue.privateKeyBase64);
        const base = {
            recipientKeyId: recipient.keyId,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            pinnedAuthorityPublicKeyBase64: authority.publicKeyBase64,
        };
        await expect(EncryptDiagnosticBundle(archive, { ...base, recipientKeySignatureBase64: rogueSignature })).rejects.toThrow(
            /authority signature verification/
        );
        await expect(EncryptDiagnosticBundle(archive, base)).rejects.toThrow(/signature is missing/);
    });

    it('refuses an envelope whose format version byte is not 1', async () => {
        const envelope = await EncryptDiagnosticBundle(archive, {
            recipientKeyId: recipient.keyId,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
        });
        const tampered = new Uint8Array(envelope);
        tampered[4] = 0x02;
        const result = await DecryptDiagnosticBundle(tampered, {
            PrivateKeysByKeyId: { [recipient.keyId]: recipient.privateKeyBase64 },
        });
        expect(result.valid).toBe(false);
        expect(result.reasonCode).toBe('UNSUPPORTED_ENVELOPE_VERSION');
    });
});
