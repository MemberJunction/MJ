/**
 * @fileoverview Legacy API key utility functions.
 *
 * **PREFERRED APPROACH**: Use the methods on `EncryptionEngine.Instance` instead:
 * - `GenerateAPIKey()` - Generate a new API key
 * - `HashAPIKey()` - Hash an API key
 * - `IsValidAPIKeyFormat()` - Validate key format
 * - `CreateAPIKey()` - Create and store a new API key
 * - `ValidateAPIKey()` - Validate a key and get user context
 * - `RevokeAPIKey()` - Revoke an API key
 *
 * These standalone functions are maintained for backwards compatibility.
 *
 * @module @memberjunction/encryption
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { APIKeyUsageLogEntity, UserEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { createHash, randomBytes } from 'crypto';
import { GeneratedAPIKey, APIKeyValidationResult } from './interfaces';

/**
 * Generate a new API key with format: mj_sk_[64 hex chars]
 * The raw key should be shown to user immediately and never stored.
 * Only the hash should be saved to the database.
 *
 * @deprecated Prefer `EncryptionEngine.Instance.GenerateAPIKey()`
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
 *
 * @deprecated Prefer `EncryptionEngine.Instance.HashAPIKey()`
 */
export function hashAPIKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate API key format before attempting authentication.
 *
 * @deprecated Prefer `EncryptionEngine.Instance.IsValidAPIKeyFormat()`
 */
export function isValidAPIKeyFormat(key: string): boolean {
  return /^mj_sk_[a-f0-9]{64}$/.test(key);
}

/**
 * Validates an API key using the CredentialEngine cache.
 * This is much faster than querying the database on every request.
 *
 * @param rawKey - The raw API key from the request header
 * @param contextUser - User context for database operations
 * @returns Validation result with user context if valid
 *
 * @deprecated Prefer `EncryptionEngine.Instance.ValidateAPIKey()`
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

  // 4. Check if key is active
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
    EntityName: 'Users',
    ExtraFilter: `ID = '${cachedKey.UserID}'`,
    ResultType: 'entity_object'
  }, contextUser);

  const userRecord = result.Results ? result.Results[0] : null;
  if (!userRecord) {
    return { isValid: false, error: 'User not found for API key' };
  }

  if (!userRecord.IsActive) {
    return { isValid: false, error: 'User account is inactive' };
  }

  // 7. Update LastUsedAt and log usage
  cachedKey.LastUsedAt = new Date();
  await cachedKey.Save();

  const metadata = new Metadata();
  const usageLog = await metadata.GetEntityObject<APIKeyUsageLogEntity>(
    'MJ: API Key Usage Logs',
    contextUser
  );
  usageLog.APIKeyID = cachedKey.ID;
  usageLog.Endpoint = '/mcp';
  usageLog.Method = 'POST';
  usageLog.StatusCode = 200;
  await usageLog.Save();

  // 8. Create UserInfo from the entity
  const user = new UserInfo(undefined, userRecord.GetAll());

  return {
    isValid: true,
    user,
    apiKeyId: cachedKey.ID
  };
}
