// packages/Encryption/src/apiKeyUtils.ts
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { APIKeyUsageLogEntity, UserEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
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

export interface APIKeyValidationResult {
  isValid: boolean;
  user?: UserInfo;
  apiKeyId?: string;
  scopes?: string[];
  error?: string;
}

/**
 * Validates an API key using the CredentialEngine cache.
 * This is much faster than querying the database on every request.
 * 
 * @param rawKey - The raw API key from the request header
 * @param dataSource - The SQL Server connection pool (used for LastUsedAt update)
 * @param coreSchema - The MJ core schema name (default: '__mj')
 * @returns Validation result with user context if valid
 */
export async function validateAPIKey(
  rawKey: string,
  contextUser: UserInfo
): Promise<APIKeyValidationResult> {
  // 1. Validate format first (fast fail)
  if (!isValidAPIKeyFormat(rawKey)) {
    return { isValid: false, error: 'Invalid API key format' };
  }

  // 2. Hash the key for cache lookup
  const keyHash = hashAPIKey(rawKey);

  // 3. Look up in cache (fast!)
  const cachedKey = CredentialEngine.Instance.getAPIKeyByHash(keyHash);

  if (!cachedKey) {
    return { isValid: false, error: 'API key not found' };
  }

  // 4. Check if key is active (should always be true since we only cache active keys, but double-check)
  if (cachedKey.Status !== 'Active') {
    return { isValid: false, error: 'API key has been revoked' };
  }

  // 5. Check expiration
  if (cachedKey.ExpiresAt && cachedKey.ExpiresAt < new Date()) {
    return { isValid: false, error: 'API key has expired' };
  }

  // 6. Get the user from RunView
  const rv = new RunView();
  const result = await rv.RunView<UserEntity>({
    EntityName: "Users",
    ExtraFilter: "ID = '" + cachedKey.UserID + "'",
    ResultType: 'entity_object'
  }, contextUser);
  const u = result.Results ? result.Results[0] : null;
  if (!u) {
    return { isValid: false, error: 'User not found for API key' };
  }
  if (!u.IsActive) {
    // 7. Check if user is active
    return { isValid: false, error: 'User account is inactive' };
  }

  // use Metadata and BaseEntity subclasses to 
  // (a) Update the LastUsedAt column in the APIKey table and 
  // (b) add a new record into the APIKeyUsage table.
  cachedKey.LastUsedAt = new Date();
  await cachedKey.Save();

  const metadata = new Metadata();
  const usageLog = await metadata.GetEntityObject<APIKeyUsageLogEntity>('MJ: API Key Usage Logs', contextUser);

  usageLog.APIKeyID = cachedKey.ID;
  usageLog.Endpoint = '/mcp'; 
  usageLog.Method = 'POST';
  usageLog.StatusCode = 200;

  await usageLog.Save();

  const user = new UserInfo(undefined, u.GetAll())
  return {
    isValid: true,
    user,
    apiKeyId: cachedKey.ID
  };
}