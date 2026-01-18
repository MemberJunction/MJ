// packages/MJCore/src/generic/apiKeyUtils.ts
import { createHash, randomBytes } from 'crypto';

export interface GeneratedAPIKey {
  raw: string;    // Full key to show user ONCE: mj_sk_abc123...
  hash: string;   // SHA-256 hash to store in DB (64 hex chars)
}

/**
 * Generate a new API key with format: mj_sk_[64 hex chars]
 * The raw key should be shown to user immediately and never stored.
 * Only the hash should be saved to the database.
 */
export function generateAPIKey(): GeneratedAPIKey {
  // Generate 32 bytes of cryptographically secure random data
  const randomData = randomBytes(32);
  const hexString = randomData.toString('hex'); // 64 hex chars

  const raw = `mj_sk_${hexString}`;
  const hash = createHash('sha256').update(raw).digest('hex');

  return { raw, hash };
}

/**
 * Hash an API key for validation.
 * Used when validating incoming API keys against stored hashes.
 */
export function hashAPIKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate API key format before attempting authentication.
 */
export function isValidAPIKeyFormat(key: string): boolean {
  return /^mj_sk_[a-f0-9]{64}$/.test(key);
}