// packages/AI/MCPServer/src/auth/apiKeyAuth.ts
import { hashAPIKey, isValidAPIKeyFormat } from '@memberjunction/core';
import { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';

export interface APIKeyValidationResult {
  isValid: boolean;
  user?: UserInfo;
  apiKeyId?: string;
  scopes?: string[];
  error?: string;
}

export async function validateAPIKey(
  rawKey: string,
  dataSource: sql.ConnectionPool,
  coreSchema: string = '__mj'
): Promise<APIKeyValidationResult> {
  // 1. Validate format first (fast fail)
  if (!isValidAPIKeyFormat(rawKey)) {
    return { isValid: false, error: 'Invalid API key format' };
  }

  // 2. Hash the key for database lookup
  const keyHash = hashAPIKey(rawKey);

  // 3. Query the database
  const result = await dataSource.request()
    .input('hash', sql.NVarChar(64), keyHash)
    .query(`
      SELECT
        ak.ID as APIKeyID,
        ak.UserID,
        ak.Status,
        ak.ExpiresAt,
        u.IsActive as UserIsActive
      FROM ${coreSchema}.APIKey ak
      INNER JOIN ${coreSchema}.[User] u ON ak.UserID = u.ID
      WHERE ak.Hash = @hash
    `);

  if (result.recordset.length === 0) {
    return { isValid: false, error: 'API key not found' };
  }

  const apiKeyRecord = result.recordset[0];

  // 4. Check if key is active
  if (apiKeyRecord.Status !== 'Active') {
    return { isValid: false, error: 'API key has been revoked' };
  }

  // 5. Check expiration
  if (apiKeyRecord.ExpiresAt && new Date(apiKeyRecord.ExpiresAt) < new Date()) {
    return { isValid: false, error: 'API key has expired' };
  }

    // 6. Check if the associated User is active
  if (!apiKeyRecord.UserIsActive) {
    return { isValid: false, error: 'User account is inactive' };
  }

  // 7. Get the user from cache
  const user = UserCache.Instance.Users.find(u => u.ID === apiKeyRecord.UserID);
  if (!user) {
    return { isValid: false, error: 'User not found' };
  }

    // 8. Update LastUsedAt timestamp (fire and forget - don't wait)
  dataSource.request()
    .input('id', sql.UniqueIdentifier, apiKeyRecord.APIKeyID)
    .query(`UPDATE ${coreSchema}.APIKey SET LastUsedAt = GETUTCDATE() WHERE ID = @id`)
    .catch(err => console.error('Failed to update LastUsedAt:', err));


  return {
    isValid: true,
    user,
    apiKeyId: apiKeyRecord.APIKeyID
  };
}
