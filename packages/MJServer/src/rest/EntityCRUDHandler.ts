import { 
    BaseEntity, CompositeKey, EntityDeleteOptions, EntityPermissionType, 
    EntitySaveOptions, LogError, Metadata, UserInfo 
} from '@memberjunction/core';

/**
 * Entity CRUD Implementation Functions for REST endpoints
 * These functions contain the detailed implementation for entity operations
 */
export class EntityCRUDHandler {
    /**
     * Create a new entity
     */
    static async createEntity(entityName: string, data: any, user: UserInfo): Promise<{ success: boolean, entity?: any, error?: string, details?: any, validationErrors?: any[] }> {
        try {
            // Get entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);
            
            // Check permissions
            if (!entity.CheckPermissions(EntityPermissionType.Create, false)) {
                return { 
                    success: false, 
                    error: `User ${user.Name} does not have permission to create ${entityName} records` 
                };
            }
            
            // Create new record
            entity.NewRecord();
            
            // Extract save options if provided
            const options = new EntitySaveOptions();
            if (data.options) {
                const { IgnoreDirtyState, SkipEntityAIActions, SkipEntityActions, ReplayOnly, SkipOldValuesCheck } = data.options;
                if (IgnoreDirtyState !== undefined) options.IgnoreDirtyState = !!IgnoreDirtyState;
                if (SkipEntityAIActions !== undefined) options.SkipEntityAIActions = !!SkipEntityAIActions;
                if (SkipEntityActions !== undefined) options.SkipEntityActions = !!SkipEntityActions;
                if (ReplayOnly !== undefined) options.ReplayOnly = !!ReplayOnly;
                if (SkipOldValuesCheck !== undefined) options.SkipOldValuesCheck = !!SkipOldValuesCheck;
                
                // Remove options from data
                delete data.options;
            }
            
            // Set values on the entity
            for (const key in data) {
                entity.Set(key, data[key]);
            }
            
            // Validate entity
            const validationResult = entity.Validate();
            if (!validationResult.Success) {
                return {
                    success: false,
                    error: 'Validation failed',
                    validationErrors: validationResult.Errors
                };
            }
            
            // Save entity
            const saveSuccess = await entity.Save(options);
            
            if (!saveSuccess) {
                const latestResult = entity.LatestResult;
                return { 
                    success: false, 
                    error: latestResult?.Message || 'Failed to create entity',
                    details: latestResult
                };
            }
            
            // Get entity data for response
            const entityData = await entity.GetDataObject();
            return { success: true, entity: entityData };
        } catch (error: any) {
            LogError(error);
            return { success: false, error: error?.message || 'Unknown error' };
        }
    }
    
    /**
     * Read an entity by ID
     */
    static async getEntity(entityName: string, id: string | number, relatedEntities: string[] = null, user: UserInfo): Promise<{ success: boolean, entity?: any, error?: string }> {
        try {
            // Get entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);
            
            // Check permissions
            if (!entity.CheckPermissions(EntityPermissionType.Read, false)) {
                return { 
                    success: false, 
                    error: `User ${user.Name} does not have permission to read ${entityName} records` 
                };
            }
            
            // Create composite key
            const compositeKey = this.createCompositeKeyFromId(entity, id);
            
            // Load entity
            const loadSuccess = await entity.InnerLoad(compositeKey, relatedEntities);
            
            if (!loadSuccess) {
                return { 
                    success: false, 
                    error: `${entityName} with ID ${id} not found` 
                };
            }
            
            // Get entity data for response
            const entityData = await entity.GetDataObject();
            return { success: true, entity: entityData };
        } catch (error: any) {
            LogError(error);
            return { success: false, error: error?.message || 'Unknown error' };
        }
    }
    
    /**
     * Update an existing entity
     */
    static async updateEntity(entityName: string, id: string | number, data: any, user: UserInfo): Promise<{ success: boolean, entity?: any, error?: string, details?: any, validationErrors?: any[] }> {
        try {
            // Get entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);
            
            // Check permissions
            if (!entity.CheckPermissions(EntityPermissionType.Update, false)) {
                return { 
                    success: false, 
                    error: `User ${user.Name} does not have permission to update ${entityName} records` 
                };
            }
            
            // Create composite key
            const compositeKey = this.createCompositeKeyFromId(entity, id);
            
            // Load entity
            const loadSuccess = await entity.InnerLoad(compositeKey);
            
            if (!loadSuccess) {
                return { 
                    success: false, 
                    error: `${entityName} with ID ${id} not found` 
                };
            }
            
            // Extract save options if provided
            const options = new EntitySaveOptions();
            if (data.options) {
                const { IgnoreDirtyState, SkipEntityAIActions, SkipEntityActions, ReplayOnly, SkipOldValuesCheck } = data.options;
                if (IgnoreDirtyState !== undefined) options.IgnoreDirtyState = !!IgnoreDirtyState;
                if (SkipEntityAIActions !== undefined) options.SkipEntityAIActions = !!SkipEntityAIActions;
                if (SkipEntityActions !== undefined) options.SkipEntityActions = !!SkipEntityActions;
                if (ReplayOnly !== undefined) options.ReplayOnly = !!ReplayOnly;
                if (SkipOldValuesCheck !== undefined) options.SkipOldValuesCheck = !!SkipOldValuesCheck;
                
                // Remove options from data
                delete data.options;
            }
            
            // Update entity with new values
            for (const key in data) {
                entity.Set(key, data[key]);
            }
            
            // Check if entity is dirty
            if (!entity.Dirty && !options.IgnoreDirtyState) {
                // Nothing changed, return success
                const entityData = await entity.GetDataObject();
                return { success: true, entity: entityData };
            }
            
            // Validate entity
            const validationResult = entity.Validate();
            if (!validationResult.Success) {
                return {
                    success: false,
                    error: 'Validation failed',
                    validationErrors: validationResult.Errors
                };
            }
            
            // Save entity
            const saveSuccess = await entity.Save(options);
            
            if (!saveSuccess) {
                const latestResult = entity.LatestResult;
                return { 
                    success: false, 
                    error: latestResult?.Message || 'Failed to update entity',
                    details: latestResult
                };
            }
            
            // Get entity data for response
            const entityData = await entity.GetDataObject();
            return { success: true, entity: entityData };
        } catch (error: any) {
            LogError(error);
            return { success: false, error: error?.message || 'Unknown error' };
        }
    }
    
    /**
     * Delete an entity
     */
    static async deleteEntity(entityName: string, id: string | number, options: EntityDeleteOptions, user: UserInfo): Promise<{ success: boolean, error?: string, details?: any }> {
        try {
            // Get entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);
            
            // Check permissions
            if (!entity.CheckPermissions(EntityPermissionType.Delete, false)) {
                return { 
                    success: false, 
                    error: `User ${user.Name} does not have permission to delete ${entityName} records` 
                };
            }
            
            // Create composite key
            const compositeKey = this.createCompositeKeyFromId(entity, id);
            
            // Load entity
            const loadSuccess = await entity.InnerLoad(compositeKey);
            
            if (!loadSuccess) {
                return { 
                    success: false, 
                    error: `${entityName} with ID ${id} not found` 
                };
            }
            
            // Delete the entity
            const deleteSuccess = await entity.Delete(options);
            
            if (!deleteSuccess) {
                const latestResult = entity.LatestResult;
                return { 
                    success: false, 
                    error: latestResult?.Message || 'Failed to delete entity',
                    details: latestResult
                };
            }
            
            return { success: true };
        } catch (error: any) {
            LogError(error);
            return { success: false, error: error?.message || 'Unknown error' };
        }
    }
    
    /**
     * Helper method to create a composite key from an ID
     */
    private static createCompositeKeyFromId(entity: BaseEntity, id: string | number): CompositeKey {
        if (entity.EntityInfo.PrimaryKeys.length === 1) {
            // Single primary key
            const primaryKeyField = entity.EntityInfo.PrimaryKeys[0].Name;
            const compositeKey = new CompositeKey();
            const strId = id.toString();
            
            // Use key-value pairs instead of SetValue
            compositeKey.KeyValuePairs = [
                { FieldName: primaryKeyField, Value: strId }
            ];
            
            return compositeKey;
        } else {
            // Composite primary key - this is a simplification
            // In a real implementation, you would need to parse a composite ID string
            // or accept an object with all primary key values
            throw new Error('Composite primary keys are not supported in this simplified implementation');
        }
    }
}