import * as crypto from 'node:crypto';
import { BuildEnvelopeSenderSignatureString, EncryptedEnvelopeHeader } from '@memberjunction/diagnostics';

/**
 * Returns true when the SPKI Base64 public key is the one derived from the PKCS#8 Base64 private
 * key. Any key that does not parse returns false.
 */
export function KeyPairMatches(publicKeyBase64: string, privateKeyBase64: string): boolean {
  try {
    const privateKey = crypto.createPrivateKey({ key: Buffer.from(privateKeyBase64, 'base64'), format: 'der', type: 'pkcs8' });
    const derived = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
    const given = crypto.createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' })
      .export({ format: 'der', type: 'spki' });
    return derived.byteLength === given.byteLength && crypto.timingSafeEqual(derived, given);
  } catch {
    return false;
  }
}

/**
 * Verifies the Ed25519 sender signature in an envelope header without decrypting the payload.
 * The signed string comes from Core's `BuildEnvelopeSenderSignatureString`.
 */
export function VerifyEnvelopeSenderSignature(header: EncryptedEnvelopeHeader, senderPublicKeyBase64: string): boolean {
  if (!header.senderSignatureBase64) {
    return false;
  }
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(senderPublicKeyBase64, 'base64'), format: 'der', type: 'spki' });
    const data = Buffer.from(
      BuildEnvelopeSenderSignatureString(header.recipientKeyId, header.ephemeralPublicKeyBase64, header.manifestSha256),
      'utf8'
    );
    return crypto.verify(null, data, key, Buffer.from(header.senderSignatureBase64, 'base64'));
  } catch {
    return false;
  }
}
