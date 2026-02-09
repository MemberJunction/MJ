import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseRecordMutationAction } from "./base-record-mutation.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Generic action for retrieving entity records from the database.
 * This action provides a flexible way to fetch records for any entity type
 * by accepting the entity name and primary key values as parameters.
 * 
 * @example
 * ```typescript
 * // Get a single record by ID
 * await runAction({
 *   ActionName: 'Get Record',
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
 * // Get a record with composite primary key
 * await runAction({
 *   ActionName: 'Get Record',
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
@RegisterClass(BaseAction, "GetRecordAction")
export class GetRecordAction extends BaseRecordMutationAction {
    /**
     * Retrieves a record for the specified entity type using its primary key.
     * 
     * @param params - The action parameters containing:
     *   - EntityName (required): The name of the entity to retrieve
     *   - PrimaryKey (required): Object containing primary key field(s) and value(s)
     * 
     * @returns ActionResultSimple with:
     *   - Success: true if record was retrieved successfully
     *   - ResultCode: SUCCESS, FAILED, ENTITY_NOT_FOUND, RECORD_NOT_FOUND, VALIDATION_ERROR, PERMISSION_DENIED
     *   - Message: Details about the operation
     *   - Params: Output parameter 'Record' contains the retrieved entity data
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

            // Load the record
            const loadResult = await this.loadRecord(entity!, entityInfo!, primaryKey, entityName);

            if (!loadResult.success) {
                return loadResult.error!;
            }

            // Get all field values
            const recordData = entity!.GetAll();

            // Add output parameter with the record data
            params.Params.push({
                Name: 'Record',
                Value: recordData,
                Type: 'Output'
            });

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${entityName} record`,
                Params: params.Params
            };

        } catch (e) {
            return this.handleError(e, 'retrieving');
        }
    }
}