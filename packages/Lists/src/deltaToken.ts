import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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
 */

/** Token validity window — matches the 5-minute requirement in the plan. */
export const TOKEN_TTL_MS = 5 * 60 * 1000;

/** Mode tag baked into the payload — drives drop-guard enforcement. */
export type DeltaTokenMode = 'Additive' | 'Sync' | 'SetOp';

/**
 * Canonical payload shape. Kept tiny + versioned so we can evolve the
 * signing scheme without breaking running clients.
 */
export interface DeltaTokenPayload {
  v: 1;
  tid: string | null;
  ssig: string;
  m: DeltaTokenMode;
  iat: number;
}

/**
 * Reasons a token can fail verification. Mapped 1:1 by the resolver layer
 * onto user-visible `ApplyResultCode` values.
 */
export type DeltaTokenError = 'INVALID_TOKEN' | 'EXPIRED_TOKEN';

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
export function ComputeSourceSignature(recordIds: readonly string[]): string {
  const sorted = [...recordIds].sort();
  return createHash('sha256').update(sorted.join('\n')).digest('hex');
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
  const secret = injectedSecret ?? process.env.MJ_LIST_DELTA_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error(
      "MJ_LIST_DELTA_SECRET is not configured. Set the env var or call SetDeltaTokenSecret() at server boot.",
    );
  }
  return secret;
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(s: string): Buffer {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hmacOf(payloadEncoded: string): Buffer {
  return createHmac('sha256', getSecret()).update(payloadEncoded).digest();
}

function toUint8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Sign a payload. Callers should pass `iat: Date.now()` and an `ssig`
 * computed via `ComputeSourceSignature`. Returns the wire form.
 */
export function SignDeltaToken(payload: DeltaTokenPayload): string {
  const payloadEncoded = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = toBase64Url(hmacOf(payloadEncoded));
  return `${payloadEncoded}.${sig}`;
}

/**
 * Verify a token: checks structural shape, HMAC, and TTL. Returns the parsed
 * payload on success; throws `DeltaTokenVerificationError` otherwise. Uses
 * `timingSafeEqual` so a token-fuzzing attacker can't learn the secret from
 * comparison-time side channels.
 */
export function VerifyDeltaToken(token: string, now: number = Date.now()): DeltaTokenPayload {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Malformed delta token');
  }
  const [payloadEncoded, sigEncoded] = token.split('.', 2);
  if (!payloadEncoded || !sigEncoded) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Malformed delta token');
  }

  const expected = hmacOf(payloadEncoded);
  const provided = fromBase64Url(sigEncoded);
  if (expected.length !== provided.length || !timingSafeEqual(toUint8(expected), toUint8(provided))) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Delta token signature mismatch');
  }

  let payload: DeltaTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadEncoded).toString('utf8')) as DeltaTokenPayload;
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
