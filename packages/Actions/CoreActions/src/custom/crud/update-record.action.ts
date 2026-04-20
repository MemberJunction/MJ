import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { LogError } from "@memberjunction/core";
import { BaseRecordMutationAction } from "./base-record-mutation.action";
import { BaseAction } from '@memberjunction/actions';

/**
 * Generic action for updating existing entity records in the database.
 * This action provides a flexible way to update records for any entity type
 * by accepting the entity name, primary key, and field values as parameters.
 * 
 * @example
 * ```typescript
 * // Update a customer record
 * await runAction({
 *   ActionName: 'Update Record',
 *   Params: [
 *     {
 *       Name: 'EntityName',
 *       Value: 'Customers'
 *     },
 *     {
 *       Name: 'PrimaryKey',
 *       Value: { ID: '123e4567-e89b-12d3-a456-426614174000' }
 *     },
 *     {
 *       Name: 'Fields',
 *       Value: {
 *         Email: 'newemail@example.com',
 *         Status: 'Inactive',
 *         UpdatedAt: new Date()
 *       }
 *     }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "UpdateRecordAction")
export class UpdateRecordAction extends BaseRecordMutationAction {
    /**
     * Updates an existing record for the specified entity type.
     * 
     * @param params - The action parameters containing:
     *   - EntityName (required): The name of the entity to update
     *   - PrimaryKey (required): Object containing primary key field(s) and value(s)
     *   - Fields (required): Object containing field names and values to update
     * 
     * @returns ActionResultSimple with:
     *   - Success: true if record was updated successfully
     *   - ResultCode: SUCCESS, FAILED, ENTITY_NOT_FOUND, RECORD_NOT_FOUND, VALIDATION_ERROR, 
     *                 PERMISSION_DENIED, NO_CHANGES, CONCURRENT_UPDATE
     *   - Message: Details about the operation
     *   - Params: Output parameter 'UpdatedFields' contains the fields that were actually changed
     */
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const entityNameResult = this.getEntityNameParam(params);
            if (entityNameResult.error) return entityNameResult.error;
            const entityName = entityNameResult.value!;

            const primaryKeyResult = this.getPrimaryKeyParam(params);
            if (primaryKeyResult.error) return primaryKeyResult.error;
            const primaryKey = primaryKeyResult.value!;

            const fieldsResult = this.getFieldsParam(params);
            if (fieldsResult.error) return fieldsResult.error;
            const fields = fieldsResult.value!;

            // Get entity object and metadata
            const entityResult = await this.getEntityObject(entityName, params.ContextUser);
            if (entityResult.error) return entityResult.error;
            const { entity, entityInfo } = entityResult;

            // Load the existing record
            const loadResult = await this.loadRecord(entity!, entityInfo!, primaryKey, entityName);
            if (!loadResult.success) return loadResult.error!;

            // Track which fields are actually being changed
            const updatedFields: Record<string, { oldValue: any, newValue: any }> = {};
            let hasChanges = false;

            // Set each field value
            for (const [fieldName, fieldValue] of Object.entries(fields)) {
                if (fieldName in entity!) {
                    const currentValue = entity!.Get(fieldName);
                    if (currentValue !== fieldValue) {
                        entity!.Set(fieldName, fieldValue);
                        updatedFields[fieldName] = {
                            oldValue: currentValue,
                            newValue: fieldValue
                        };
                        hasChanges = true;
                    }
                } else {
                    LogError(`Field '${fieldName}' does not exist on entity '${entityName}'`);
                }
            }

            // Check if there are any changes to save
            if (!hasChanges) {
                return {
                    Success: true,
                    ResultCode: 'NO_CHANGES',
                    Message: 'No fields were modified'
                };
            }

            // Save the record
            const saveResult = await entity!.Save();
            
            if (saveResult) {
                // Add output parameter with the updated fields
                params.Params.push({
                    Name: 'UpdatedFields',
                    Value: updatedFields,
                    Type: 'Output'
                });

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully updated ${entityName} record`,
                    Params: params.Params
                };
            } else {
                return this.analyzeEntityError(entity!, 'update', entityName);
            }

        } catch (e) {
            return this.handleError(e, 'updating');
        }
    }
}