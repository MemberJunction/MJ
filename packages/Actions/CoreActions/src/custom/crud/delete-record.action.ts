import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseRecordMutationAction } from "./base-record-mutation.action";
import { BaseAction } from '@memberjunction/actions';

/**
 * Generic action for deleting entity records from the database.
 * This action provides a flexible way to delete records for any entity type
 * by accepting the entity name and primary key values as parameters.
 * 
 * @example
 * ```typescript
 * // Delete a single record by ID
 * await runAction({
 *   ActionName: 'Delete Record',
 *   Params: [
 *     {
 *       Name: 'EntityName',
 *       Value: 'Customers'
 *     },
 *     {
 *       Name: 'PrimaryKey',
 *       Value: { ID: '123e4567-e89b-12d3-a456-426614174000' }
 *     }
 *   ]
 * });
 * 
 * // Delete a record with composite primary key
 * await runAction({
 *   ActionName: 'Delete Record',
 *   Params: [
 *     {
 *       Name: 'EntityName',
 *       Value: 'UserRoles'
 *     },
 *     {
 *       Name: 'PrimaryKey',
 *       Value: { 
 *         UserID: '123e4567-e89b-12d3-a456-426614174000',
 *         RoleID: '987f6543-e21b-12d3-a456-426614174000'
 *       }
 *     }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "DeleteRecordAction")
export class DeleteRecordAction extends BaseRecordMutationAction {
    /**
     * Deletes a record for the specified entity type using its primary key.
     * 
     * @param params - The action parameters containing:
     *   - EntityName (required): The name of the entity to delete
     *   - PrimaryKey (required): Object containing primary key field(s) and value(s)
     * 
     * @returns ActionResultSimple with:
     *   - Success: true if record was deleted successfully
     *   - ResultCode: SUCCESS, FAILED, ENTITY_NOT_FOUND, RECORD_NOT_FOUND, VALIDATION_ERROR, 
     *                 PERMISSION_DENIED, CASCADE_CONSTRAINT, REFERENCE_CONSTRAINT
     *   - Message: Details about the operation
     *   - Params: Output parameter 'DeletedRecord' contains the data of the deleted record
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

            // Get entity object and metadata
            const entityResult = await this.getEntityObject(entityName, params.ContextUser);
            if (entityResult.error) return entityResult.error;
            const { entity, entityInfo } = entityResult;

            // Load the existing record
            const loadResult = await this.loadRecord(entity!, entityInfo!, primaryKey, entityName);
            if (!loadResult.success) return loadResult.error!;

            // Store the record data before deletion
            const deletedRecordData = entity.GetAll();

            // Delete the record
            const deleteResult = await entity.Delete();
            
            if (deleteResult) {
                // Add output parameter with the deleted record data
                params.Params.push({
                    Name: 'DeletedRecord',
                    Value: deletedRecordData,
                    Type: 'Output'
                });

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully deleted ${entityName} record`,
                    Params: params.Params
                };
            } else {
                return this.analyzeEntityError(entity!, 'delete', entityName);
            }

        } catch (e) {
            return this.handleError(e, 'deleting');
        }
    }
}