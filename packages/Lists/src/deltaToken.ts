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
 * Uses the Web Crypto API (`globalThis.crypto.subtle`) so this module
 * works identically in Node 19+ and browser bundles, without pulling in
 * the `node:crypto` built-in that breaks browser-side bundling.
 *
 * SubtleCrypto is async, so `SignDeltaToken` / `VerifyDeltaToken` /
 * `ComputeSourceSignature` all return Promises.
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
export async function ComputeSourceSignature(recordIds: readonly string[]): Promise<string> {
  const sorted = [...recordIds].sort();
  const encoded = textEncoder.encode(sorted.join('\n'));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return bufferToHex(digest);
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
  // Drop the cached CryptoKey so the next sign/verify rebuilds against the new secret.
  cachedHmacKey = null;
  cachedHmacKeySecret = null;
}

function getSecret(): string {
  // `process` is browser-undefined; guard so import doesn't crash bundlers
  // that don't inject a process polyfill.
  const envSecret =
    typeof process !== 'undefined' && process?.env ? process.env.MJ_LIST_DELTA_SECRET : undefined;
  const secret = injectedSecret ?? envSecret;
  if (!secret || secret.length === 0) {
    throw new Error(
      "MJ_LIST_DELTA_SECRET is not configured. Set the env var or call SetDeltaTokenSecret() at server boot.",
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 via SubtleCrypto. We cache the imported CryptoKey because
// `importKey` is the slow part — the actual sign/verify is cheap.
// ---------------------------------------------------------------------------
const textEncoder = new TextEncoder();
let cachedHmacKey: CryptoKey | null = null;
let cachedHmacKeySecret: string | null = null;

async function getHmacKey(): Promise<CryptoKey> {
  const secret = getSecret();
  if (cachedHmacKey && cachedHmacKeySecret === secret) return cachedHmacKey;
  cachedHmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  cachedHmacKeySecret = secret;
  return cachedHmacKey;
}

async function hmacOf(payloadEncoded: string): Promise<ArrayBuffer> {
  const key = await getHmacKey();
  return globalThis.crypto.subtle.sign('HMAC', key, textEncoder.encode(payloadEncoded));
}

// ---------------------------------------------------------------------------
// Base64URL helpers — work in Node + browsers without importing `Buffer`.
// ---------------------------------------------------------------------------
function bufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const std = padded.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    const binary = atob(std);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(std, 'base64'));
}

function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * Sign a payload. Callers should pass `iat: Date.now()` and an `ssig`
 * computed via `ComputeSourceSignature`. Returns the wire form.
 */
export async function SignDeltaToken(payload: DeltaTokenPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const payloadEncoded = bufferToBase64Url(textEncoder.encode(json));
  const sig = bufferToBase64Url(await hmacOf(payloadEncoded));
  return `${payloadEncoded}.${sig}`;
}

/**
 * Verify a token: checks structural shape, HMAC, and TTL. Returns the parsed
 * payload on success; throws `DeltaTokenVerificationError` otherwise.
 *
 * Web Crypto's `subtle.verify` is the constant-time-equivalent replacement
 * for Node's `timingSafeEqual` — both compare in time independent of the
 * mismatch position, so a token-fuzzing attacker can't learn the secret
 * from comparison-time side channels.
 */
export async function VerifyDeltaToken(token: string, now: number = Date.now()): Promise<DeltaTokenPayload> {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Malformed delta token');
  }
  const [payloadEncoded, sigEncoded] = token.split('.', 2);
  if (!payloadEncoded || !sigEncoded) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Malformed delta token');
  }

  const providedSig = base64UrlToBytes(sigEncoded);
  const key = await getHmacKey();
  // Pass `.buffer` slices to satisfy the BufferSource typing; the
  // Uint8Array we built from atob() owns a plain ArrayBuffer at runtime,
  // but TS sometimes widens to ArrayBufferLike. Slicing into a fresh
  // ArrayBuffer is the safe coerce.
  const sigBuf = providedSig.buffer.slice(providedSig.byteOffset, providedSig.byteOffset + providedSig.byteLength) as ArrayBuffer;
  const msgBuf = textEncoder.encode(payloadEncoded);
  const msgArrayBuffer = msgBuf.buffer.slice(msgBuf.byteOffset, msgBuf.byteOffset + msgBuf.byteLength) as ArrayBuffer;
  const ok = await globalThis.crypto.subtle.verify('HMAC', key, sigBuf, msgArrayBuffer);
  if (!ok) {
    throw new DeltaTokenVerificationError('INVALID_TOKEN', 'Delta token signature mismatch');
  }

  let payload: DeltaTokenPayload;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payloadEncoded));
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
