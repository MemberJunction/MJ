import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseRecordMutationAction } from "./base-record-mutation.action";
import { BaseAction } from '@memberjunction/actions';

/**
 * Generic action for creating new entity records in the database.
 * This action provides a flexible way to create records for any entity type
 * by accepting the entity name and field values as parameters.
 * 
 * @example
 * ```typescript
 * // Create a new customer record
 * const result = await runAction({
 *   ActionName: 'Create Record',
 *   Params: [
 *     {
 *       Name: 'EntityName',
 *       Value: 'Customers'
 *     },
 *     {
 *       Name: 'Fields',
 *       Value: {
 *         Name: 'John Doe',
 *         Email: 'john@example.com',
 *         Status: 'Active'
 *       }
 *     }
 *   ]
 * });
 * 
 * // The PrimaryKey output parameter contains an object with the key field(s)
 * // For example: { CustomerID: '12345' }
 * const primaryKey = result.Params.find(p => p.Name === 'PrimaryKey')?.Value;
 * ```
 */
@RegisterClass(BaseAction, "CreateRecordAction")
export class CreateRecordAction extends BaseRecordMutationAction {
    /**
     * Creates a new record for the specified entity type.
     * 
     * @param params - The action parameters containing:
     *   - EntityName (required): The name of the entity to create
     *   - Fields (required): Object containing field names and values to set
     * 
     * @returns ActionResultSimple with:
     *   - Success: true if record was created successfully
     *   - ResultCode: SUCCESS, FAILED, ENTITY_NOT_FOUND, VALIDATION_ERROR, PERMISSION_DENIED
     *   - Message: Details about the operation
     *   - Params: Output parameter 'PrimaryKey' contains an object with the primary key field(s) and value(s)
     */
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const entityNameResult = this.getEntityNameParam(params);
            if (entityNameResult.error) return entityNameResult.error;
            const entityName = entityNameResult.value!;

            const fieldsResult = this.getFieldsParam(params);
            if (fieldsResult.error) return fieldsResult.error;
            const fields = fieldsResult.value!;

            // Get entity object and metadata
            const entityResult = await this.getEntityObject(entityName, params.ContextUser);
            if (entityResult.error) return entityResult.error;
            const { entity, entityInfo } = entityResult;

            // Set fields on the new entity
            entity!.NewRecord();
            
            // Set field values using base class method
            this.setFieldValues(entity!, fields, entityName);

            // Save the record
            const saveResult = await entity!.Save();
            
            if (saveResult) {
                // Get the primary key value(s)
                const primaryKeys: Record<string, any> = {};
                for (const pk of entityInfo!.PrimaryKeys) {
                    primaryKeys[pk.Name] = entity!.Get(pk.Name);
                }

                // Add output parameter with the primary key object
                params.Params.push({
                    Name: 'PrimaryKey',
                    Value: primaryKeys,
                    Type: 'Output'
                });

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully created ${entityName} record`,
                    Params: params.Params
                };
            } else {
                return this.analyzeEntityError(entity!, 'create', entityName);
            }

        } catch (e) {
            return this.handleError(e, 'creating');
        }
    }
}