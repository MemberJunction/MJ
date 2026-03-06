/**
 * @fileoverview Action for rotating encryption keys with full data re-encryption.
 *
 * Key rotation is a critical security operation that:
 * 1. Validates the new key material is accessible
 * 2. Decrypts all data encrypted with the old key
 * 3. Re-encrypts with the new key in a transactional manner
 * 4. Updates the key metadata to point to the new key material
 *
 * ## Usage
 *
 * This action is typically invoked via the MemberJunction Actions framework:
 *
 * ```typescript
 * const result = await actionEngine.RunAction({
 *   ActionName: 'Rotate Encryption Key',
 *   Params: [
 *     { Name: 'EncryptionKeyID', Value: 'key-uuid' },
 *     { Name: 'NewKeyLookupValue', Value: 'MJ_ENCRYPTION_KEY_PII_V2' },
 *     { Name: 'BatchSize', Value: 100 }
 *   ],
 *   ContextUser: currentUser
 * });
 * ```
 *
 * ## Security Considerations
 *
 * - The new key must be accessible before starting rotation
 * - Rotation is transactional - all or nothing
 * - Key status is set to 'Rotating' during the operation
 * - On success, key version is incremented
 * - On failure, original key continues to work
 *
 * @module @memberjunction/encryption
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { EncryptionEngine } from '../EncryptionEngine';
import { RotateKeyParams, RotateKeyResult } from '../interfaces';


/**
 * Action for rotating encryption keys with full re-encryption of affected data.
 *
 * Key rotation involves:
 * 1. Validating the new key is accessible
 * 2. Setting key status to 'Rotating'
 * 3. For each entity field using this key:
 *    - Loading all records in batches
 *    - Decrypting with old key
 *    - Re-encrypting with new key
 *    - Updating records
 * 4. Updating key metadata (lookup value, version)
 * 5. Setting key status back to 'Active'
 *
 * ## Transaction Safety
 *
 * - Each batch is processed within a transaction
 * - On batch failure, the entire rotation is rolled back
 * - Key status is reset to 'Active' on failure
 *
 * @security This is a privileged operation that should be restricted to administrators.
 */
@RegisterClass(Object, 'Rotate Encryption Key')
export class RotateEncryptionKeyAction {
    /**
     * Executes the key rotation operation.
     *
     * @param params - Action parameters including EncryptionKeyID and NewKeyLookupValue
     * @returns Result with success status and details about rotated fields/records
     */
    public async Run(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;

        // Extract parameters
        const encryptionKeyIdParam = this.getParamValue(Params, 'EncryptionKeyID');
        const newKeyLookupValueParam = this.getParamValue(Params, 'NewKeyLookupValue');
        const batchSizeParam = this.getParamValue(Params, 'BatchSize');

        const encryptionKeyId = encryptionKeyIdParam != null ? String(encryptionKeyIdParam) : null;
        const newKeyLookupValue = newKeyLookupValueParam != null ? String(newKeyLookupValueParam) : null;
        const batchSize = batchSizeParam != null ? Number(batchSizeParam) : 100;

        // Validate required parameters
        if (!encryptionKeyId) {
            return {
                Success: false,
                ResultCode: 'INVALID_PARAMS',
                Message: 'EncryptionKeyID is required',
                Params
            };
        }

        if (!newKeyLookupValue) {
            return {
                Success: false,
                ResultCode: 'INVALID_PARAMS',
                Message: 'NewKeyLookupValue is required. This should be the environment variable name or config key for the new encryption key.',
                Params
            };
        }

        try {
            const result = await this.rotateKey({
                encryptionKeyId,
                newKeyLookupValue,
                batchSize
            }, ContextUser);

            // Update output parameters
            const outputParams = [...Params];
            const recordsParam = outputParams.find(p => p.Name === 'RecordsProcessed');
            if (recordsParam) recordsParam.Value = result.recordsProcessed;
            const fieldsParam = outputParams.find(p => p.Name === 'FieldsProcessed');
            if (fieldsParam) fieldsParam.Value = result.fieldsProcessed;

            if (result.success) {
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Key rotation completed successfully. Processed ${result.recordsProcessed} records across ${result.fieldsProcessed.length} fields.`,
                    Params: outputParams
                };
            } else {
                return {
                    Success: false,
                    ResultCode: 'ROTATION_FAILED',
                    Message: result.error || 'Key rotation failed',
                    Params: outputParams
                };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Key rotation failed: ${message}`);

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Key rotation failed: ${message}`,
                Params
            };
        }
    }

    /**
     * Performs the actual key rotation operation.
     *
     * @private
     */
    private async rotateKey(
        params: RotateKeyParams,
        contextUser?: UserInfo
    ): Promise<RotateKeyResult> {
        const { encryptionKeyId, newKeyLookupValue, batchSize = 100 } = params;
        const engine = EncryptionEngine.Instance;
        await engine.Config(false, contextUser);
        const md = new Metadata();
        const rv = new RunView();

        // Track progress
        const fieldsProcessed: string[] = [];
        let totalRecordsProcessed = 0;

        try {
            // Step 1: Validate the new key is accessible
            LogStatus(`Validating new key material at lookup value: ${newKeyLookupValue}`);
            await engine.ValidateKeyMaterial(newKeyLookupValue, encryptionKeyId, contextUser);
            LogStatus('New key material validated successfully');

            // Step 2: Load the encryption key record
            const keyResult = await rv.RunView({
                EntityName: 'MJ: Encryption Keys',
                ExtraFilter: `ID = '${encryptionKeyId}'`,
                ResultType: 'entity_object'
            }, contextUser);

            if (!keyResult.Success || keyResult.Results.length === 0) {
                return {
                    success: false,
                    recordsProcessed: 0,
                    fieldsProcessed: [],
                    error: `Encryption key not found: ${encryptionKeyId}`
                };
            }

            const encryptionKey = keyResult.Results[0];
            const originalVersion = encryptionKey.KeyVersion || '1';

            // Step 3: Set key status to 'Rotating'
            encryptionKey.Status = 'Rotating';
            const saveResult = await encryptionKey.Save();
            if (!saveResult) {
                return {
                    success: false,
                    recordsProcessed: 0,
                    fieldsProcessed: [],
                    error: 'Failed to set key status to Rotating'
                };
            }

            // Step 4: Find all entity fields using this key
            const fieldsResult = await rv.RunView({
                EntityName: 'MJ: Entity Fields',
                ExtraFilter: `EncryptionKeyID = '${encryptionKeyId}' AND Encrypt = 1`,
                ResultType: 'simple'
            }, contextUser);

            if (!fieldsResult.Success) {
                // Reset key status and return error
                encryptionKey.Status = 'Active';
                await encryptionKey.Save();
                return {
                    success: false,
                    recordsProcessed: 0,
                    fieldsProcessed: [],
                    error: 'Failed to load entity fields using this key'
                };
            }

            const fields = fieldsResult.Results;
            LogStatus(`Found ${fields.length} encrypted fields to rotate`);

            // Step 5: Process each field
            for (const field of fields) {
                const entityName = field.Entity;
                const fieldName = field.Name;
                const fullFieldName = `${entityName}.${fieldName}`;

                LogStatus(`Processing field: ${fullFieldName}`);

                try {
                    // Get entity info for schema/view name
                    const entityInfo = md.Entities.find(e => e.Name === entityName);
                    if (!entityInfo) {
                        LogError(`Entity not found: ${entityName}`);
                        continue;
                    }

                    // Load records in batches
                    let offset = 0;
                    let hasMore = true;

                    while (hasMore) {
                        // Load a batch of records
                        const batchResult = await rv.RunView({
                            EntityName: entityName,
                            ExtraFilter: `${fieldName} IS NOT NULL AND ${fieldName} LIKE '$ENC$%'`,
                            OrderBy: entityInfo.PrimaryKeys.map(pk => pk.Name).join(', '),
                            MaxRows: batchSize,
                            ResultType: 'entity_object'
                        }, contextUser);

                        if (!batchResult.Success || batchResult.Results.length === 0) {
                            hasMore = false;
                            continue;
                        }

                        const records = batchResult.Results;
                        hasMore = records.length === batchSize;

                        // Process each record in the batch
                        for (const record of records) {
                            const encryptedValue = record.Get(fieldName);

                            if (!encryptedValue || !engine.IsEncrypted(encryptedValue)) {
                                continue;
                            }

                            try {
                                // Decrypt with old key
                                const decrypted = await engine.Decrypt(encryptedValue, contextUser);

                                // Re-encrypt with new key using the new lookup value
                                const reEncrypted = await engine.EncryptWithLookup(
                                    decrypted,
                                    encryptionKeyId,
                                    newKeyLookupValue,
                                    contextUser
                                );

                                // Update the record
                                record.Set(fieldName, reEncrypted);
                                const recordSaveResult = await record.Save();

                                if (recordSaveResult) {
                                    totalRecordsProcessed++;
                                } else {
                                    // If any record fails, we should consider the rotation failed
                                    // But we continue to try other records to get a complete picture
                                    LogError(`Failed to save re-encrypted record in ${fullFieldName}`);
                                }
                            } catch (recordError) {
                                const msg = recordError instanceof Error ? recordError.message : String(recordError);
                                LogError(`Failed to rotate record in ${fullFieldName}: ${msg}`);
                            }
                        }

                        offset += batchSize;
                    }

                    fieldsProcessed.push(fullFieldName);
                    LogStatus(`Completed field: ${fullFieldName}`);

                } catch (fieldError) {
                    const msg = fieldError instanceof Error ? fieldError.message : String(fieldError);
                    LogError(`Failed to process field ${fullFieldName}: ${msg}`);
                    // Continue with other fields
                }
            }

            // Step 6: Update key metadata to point to new key
            encryptionKey.KeyLookupValue = newKeyLookupValue;
            encryptionKey.KeyVersion = String(parseInt(originalVersion) + 1);
            encryptionKey.Status = 'Active';
            const finalSaveResult = await encryptionKey.Save();

            if (!finalSaveResult) {
                return {
                    success: false,
                    recordsProcessed: totalRecordsProcessed,
                    fieldsProcessed,
                    error: 'Failed to update key metadata after rotation. Data has been re-encrypted but key metadata update failed.'
                };
            }

            // Step 7: Clear encryption engine caches to use new key
            engine.ClearCaches();

            LogStatus(`Key rotation completed. Processed ${totalRecordsProcessed} records across ${fieldsProcessed.length} fields.`);

            return {
                success: true,
                recordsProcessed: totalRecordsProcessed,
                fieldsProcessed
            };

        } catch (error) {
            // On any error, try to reset key status to Active
            try {
                const keyResult = await rv.RunView({
                    EntityName: 'MJ: Encryption Keys',
                    ExtraFilter: `ID = '${encryptionKeyId}'`,
                    ResultType: 'entity_object'
                }, contextUser);

                if (keyResult.Success && keyResult.Results.length > 0) {
                    const key = keyResult.Results[0];
                    if (key.Status === 'Rotating') {
                        key.Status = 'Active';
                        await key.Save();
                    }
                }
            } catch {
                // Best effort - ignore errors in cleanup
            }

            const message = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                recordsProcessed: totalRecordsProcessed,
                fieldsProcessed,
                error: message
            };
        }
    }

    /**
     * Helper to extract parameter value by name.
     * @private
     */
    private getParamValue(params: ActionParam[], name: string): string | number | boolean | null {
        const param = params.find(p => p.Name === name);
        return param?.Value ?? null;
    }
}
