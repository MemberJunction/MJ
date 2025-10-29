import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { BaseEntity, Metadata, LogError, CompositeKey } from "@memberjunction/core";

/**
 * Abstract base class for record mutation actions (Create, Update, Delete).
 * This class provides common functionality for validating parameters,
 * loading entities, handling errors, and processing results.
 * 
 * Not registered as an action itself - only its subclasses are registered.
 */
export abstract class BaseRecordMutationAction extends BaseAction {
    /**
     * Extract and validate the EntityName parameter
     */
    protected getEntityNameParam(params: RunActionParams): { value?: string; error?: ActionResultSimple } {
        const entityNameParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'entityname');
        
        if (!entityNameParam || !entityNameParam.Value) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'EntityName parameter is required'
                }
            };
        }
        
        return { value: entityNameParam.Value as string };
    }

    /**
     * Extract and validate the PrimaryKey parameter
     */
    protected getPrimaryKeyParam(params: RunActionParams): { value?: Record<string, any>; error?: ActionResultSimple } {
        const primaryKeyParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'primarykey');
        
        if (!primaryKeyParam || !primaryKeyParam.Value) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'PrimaryKey parameter is required'
                }
            };
        }
        
        return { value: primaryKeyParam.Value as Record<string, any> };
    }

    /**
     * Extract and validate the Fields parameter
     */
    protected getFieldsParam(params: RunActionParams): { value?: Record<string, any>; error?: ActionResultSimple } {
        const fieldsParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'fields');
        
        if (!fieldsParam || !fieldsParam.Value) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Fields parameter is required'
                }
            };
        }
        
        return { value: fieldsParam.Value as Record<string, any> };
    }

    /**
     * Get entity metadata and create entity object
     */
    protected async getEntityObject(entityName: string, contextUser: any): Promise<{ 
        entity?: BaseEntity; 
        entityInfo?: any;
        error?: ActionResultSimple 
    }> {
        const md = new Metadata();
        const entityInfo = md.EntityByName(entityName);
        
        if (!entityInfo) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'ENTITY_NOT_FOUND',
                    Message: `Entity '${entityName}' not found in metadata`
                }
            };
        }

        const entity = await md.GetEntityObject<BaseEntity>(entityName, contextUser);
        if (!entity) {
            return {
                error: {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to create entity object for '${entityName}'`
                }
            };
        }

        return { entity, entityInfo };
    }

    /**
     * Load an existing record using primary key
     */
    protected async loadRecord(
        entity: BaseEntity, 
        entityInfo: any, 
        primaryKey: Record<string, any>,
        entityName: string
    ): Promise<{ success: boolean; error?: ActionResultSimple }> {
        // Validate all primary key fields are provided
        const keyData: Record<string, any> = {};
        for (const pk of entityInfo.PrimaryKeys) {
            if (!(pk.Name in primaryKey)) {
                return {
                    success: false,
                    error: {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: `Primary key field '${pk.Name}' not provided`
                    }
                };
            }
            keyData[pk.Name] = primaryKey[pk.Name];
        }
        
        // Load the record using LoadFromData which works for both single and composite keys
        const pkey = CompositeKey.FromObject(keyData);        
        const loadResult = await entity.InnerLoad(pkey);

        if (!loadResult) {
            // Check if it's a permission issue or record not found
            const latestResult = entity.LatestResult;
            let resultCode = 'RECORD_NOT_FOUND';
            let message = `${entityName} record not found`;

            const completeMessage = latestResult?.CompleteMessage?.toLowerCase() || '';
            if (completeMessage.includes('permission') || completeMessage.includes('denied')) {
                resultCode = 'PERMISSION_DENIED';
                message = `Permission denied accessing ${entityName} record`;
            }

            return {
                success: false,
                error: {
                    Success: false,
                    ResultCode: resultCode,
                    Message: message
                }
            };
        }

        return { success: true };
    }

    /**
     * Set field values on an entity
     */
    protected setFieldValues(entity: BaseEntity, fields: Record<string, any>, entityName: string): void {
        for (const [fieldName, fieldValue] of Object.entries(fields)) {
            if (fieldName in entity) {
                entity.Set(fieldName, fieldValue);
            } else {
                LogError(`Field '${fieldName}' does not exist on entity '${entityName}'`);
            }
        }
    }

    /**
     * Analyze error from entity save/delete operation and return appropriate result
     */
    protected analyzeEntityError(
        entity: BaseEntity,
        operation: 'create' | 'update' | 'delete',
        entityName: string
    ): ActionResultSimple {
        const latestResult = entity.LatestResult;
        let resultCode = 'FAILED';
        let message = `Failed to ${operation} ${entityName} record`;

        if (latestResult) {
            const completeMessage = latestResult.CompleteMessage;
            if (completeMessage) {
                message += `: ${completeMessage}`;
            }

            // Check for specific error types using the complete consolidated message
            const lowerMessage = completeMessage?.toLowerCase() || '';
            if (lowerMessage.includes('permission') || lowerMessage.includes('denied')) {
                resultCode = 'PERMISSION_DENIED';
            } else if (lowerMessage.includes('validation') || lowerMessage.includes('required')) {
                resultCode = 'VALIDATION_ERROR';
            } else if (operation === 'update' &&
                      (lowerMessage.includes('concurrent') || lowerMessage.includes('modified'))) {
                resultCode = 'CONCURRENT_UPDATE';
            } else if (operation === 'delete') {
                if (lowerMessage.includes('reference') ||
                    lowerMessage.includes('constraint') ||
                    lowerMessage.includes('foreign key')) {
                    resultCode = 'REFERENCE_CONSTRAINT';
                    message = `Cannot delete ${entityName} record: It is referenced by other records`;
                } else if (lowerMessage.includes('cascade')) {
                    resultCode = 'CASCADE_CONSTRAINT';
                    message = `Cannot delete ${entityName} record: Cascade delete is not allowed`;
                }
            }
        }

        return {
            Success: false,
            ResultCode: resultCode,
            Message: message
        };
    }

    /**
     * Handle generic errors with consistent formatting
     */
    protected handleError(e: any, operation: string): ActionResultSimple {
        LogError(e);
        return {
            Success: false,
            ResultCode: 'FAILED',
            Message: `Error ${operation} record: ${e.message}`
        };
    }
}