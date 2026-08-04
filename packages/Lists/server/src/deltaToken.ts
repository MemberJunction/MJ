/**
 * Server-signed token attached to every `ListDelta`. The token is the only
 * thing `ApplyDelta` will accept as proof that:
 *   - the preview was produced server-side (not forged by a client),
 *   - the preview describes a known target + source pairing,
 *   - the preview is fresh (within `TOKEN_TTL_MS`).
 *
 * Token format is `<base64url(payload-json)>.<base64url(hmac-sha256)>`. We
 * deliberately avoid a JWT dependency — the payload shape is fixed, the
 * algorithm is fixed, and we own both ends.
 *
 * Uses Node's built-in `node:crypto`. This module is server-only — clients
 * never sign or verify tokens (they receive them inside a `ListDelta` and
 * hand them back unchanged to `ApplyDelta`).
 *
 * Public functions remain async for backwards compatibility with callers
 * that already `await` them; the underlying node:crypto APIs are synchronous,
 * which is fine — HMAC on a tiny payload is sub-millisecond.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  TOKEN_TTL_MS,
  type DeltaTokenError,
  type DeltaTokenPayload,
} from '@memberjunction/lists-base';

export class DeltaTokenVerificationError extends Error {
  public readonly Code: DeltaTokenError;
  constructor(code: DeltaTokenError, message: string) {
    super(message);
    this.Code = code;
  }
}

/**
 * Produce a deterministic fingerprint of a record-ID set. Used as the `ssig`
 * field on the token payload — server-side `ApplyDelta` recomputes the
 * fingerprint of the freshly resolved source and compares against the token
 * to detect `STALE_DELTA`.
 */
export async function ComputeSourceSignature(recordIds: readonly string[]): Promise<string> {
  const sorted = [...recordIds].sort();
  return createHash('sha256').update(sorted.join('\n'), 'utf8').digest('hex');
}

/**
 * Resolve the HMAC secret. Server bootstrap is expected to set
 * `MJ_LIST_DELTA_SECRET` (or call `SetDeltaTokenSecret` directly for tests).
 * We refuse to fall back to a default — silent fallback to a known secret
 * would let a misconfigured server hand out forgeable tokens.
 */
let injectedSecret: string | undefined;
export function SetDeltaTokenSecret(secret: string | undefined): void {
  injectedSecret = secret && secret.length > 0 ? secret : undefined;
}

function getSecret(): string {
  const envSecret = process?.env?.MJ_LIST_DELTA_SECRET;
  const secret = injectedSecret ?? envSecret;
  if (!secret || secret.length === 0) {
    throw new Error(
      "MJ_LIST_DELTA_SECRET is not configured. Set the env var or call SetDeltaTokenSecret() at server boot.",
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Base64URL helpers
// ---------------------------------------------------------------------------
function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlToBuffer(s: string): Buffer {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const std = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(std, 'base64');
}

function hmacOf(payloadEncoded: string): Buffer {
  return createHmac('sha256', getSecret()).update(payloadEncoded, 'utf8').digest();
}

/**
 * Sign a payload. Callers should pass `iat: Date.now()` and an `ssig`
 * computed via `ComputeSourceSignature`. Returns the wire form.
 */
export async function SignDeltaToken(payload: DeltaTokenPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const payloadEncoded = bufferToBase64Url(Buffer.from(json, 'utf8'));
  const sig = bufferToBase64Url(hmacOf(payloadEncoded));
  return `${payloadEncoded}.${sig}`;
}

/**
 * Verify a token: checks structural shape, HMAC, and TTL. Returns the parsed
 * payload on success; throws `DeltaTokenVerificationError` otherwise.
 *
 * `timingSafeEqual` compares in time independent of the mismatch position,
 * so a token-fuzzing attacker can't learn the secret from comparison-time
 * side channels.
 */
export async function VerifyDeltaToken(token: string, now: number = Date.now()): Promise<DeltaTokenPayload> {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Malformed delta token');
  }
  const [payloadEncoded, sigEncoded] = token.split('.', 2);
  if (!payloadEncoded || !sigEncoded) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Malformed delta token');
  }

  const providedSig = base64UrlToBuffer(sigEncoded);
  const expectedSig = hmacOf(payloadEncoded);
  // Length mismatch would throw from timingSafeEqual — guard explicitly so
  // the error path stays uniform.
  // `Uint8Array.from(...)` strips the Buffer→ArrayBufferLike narrowing that
  // TS 5.9's node:crypto typings reject (they require a concrete ArrayBuffer,
  // not the SharedArrayBuffer-tolerant union Buffer carries).
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(Uint8Array.from(providedSig), Uint8Array.from(expectedSig))
  ) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Delta token signature mismatch');
  }

  let payload: DeltaTokenPayload;
  try {
    const json = base64UrlToBuffer(payloadEncoded).toString('utf8');
    payload = JSON.parse(json) as DeltaTokenPayload;
  } catch {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Delta token payload not parseable');
  }

  if (payload.v !== 1 || typeof payload.iat !== 'number' || typeof payload.ssig !== 'string') {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Delta token payload shape invalid');
  }
  if (now - payload.iat > TOKEN_TTL_MS) {
    throw new DeltaTokenVerificationError('EXPIRED_TOKEN', 'Delta token expired');
  }
  return payload;
}
