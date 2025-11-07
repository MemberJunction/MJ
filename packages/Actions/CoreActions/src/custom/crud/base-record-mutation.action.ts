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

            if (latestResult?.Message?.toLowerCase().includes('permission') || 
                latestResult?.Message?.toLowerCase().includes('denied')) {
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
            // Build detailed error message from structured error data
            let detailedErrors: string[] = [];
            
            // Use the structured Error property if available
            if (latestResult.Error) {
                if (typeof latestResult.Error === 'string') {
                    detailedErrors.push(latestResult.Error);
                } else if (latestResult.Error.message) {
                    detailedErrors.push(latestResult.Error.message);
                } else if (latestResult.Error.Message) {
                    detailedErrors.push(latestResult.Error.Message);
                } else {
                    detailedErrors.push(JSON.stringify(latestResult.Error));
                }
            }
            
            // Use the structured Errors array if available
            if (latestResult.Errors && Array.isArray(latestResult.Errors)) {
                for (const error of latestResult.Errors) {
                    if (typeof error === 'string') {
                        detailedErrors.push(error);
                    } else if (error.message) {
                        detailedErrors.push(error.message);
                    } else if (error.Message) {
                        detailedErrors.push(error.Message);
                    } else if (error.fieldName && error.error) {
                        // Field-specific validation error
                        detailedErrors.push(`${error.fieldName}: ${error.error}`);
                    } else {
                        detailedErrors.push(JSON.stringify(error));
                    }
                }
            }
            
            // Fall back to the user-facing Message if no structured errors found
            if (detailedErrors.length === 0 && latestResult.Message) {
                detailedErrors.push(latestResult.Message);
            }
            
            // Build comprehensive error message
            if (detailedErrors.length > 0) {
                message += `: ${detailedErrors.join('; ')}`;
            }
            
            // Analyze error types based on structured error content
            const errorText = detailedErrors.join(' ').toLowerCase();
            
            if (errorText.includes('permission') || errorText.includes('denied') || errorText.includes('unauthorized')) {
                resultCode = 'PERMISSION_DENIED';
            } else if (errorText.includes('validation') || errorText.includes('required') || 
                      errorText.includes('cannot be null') || errorText.includes('not null') ||
                      errorText.includes('constraint') || errorText.includes('invalid')) {
                resultCode = 'VALIDATION_ERROR';
            } else if (operation === 'update' && 
                      (errorText.includes('concurrent') || errorText.includes('modified') || 
                       errorText.includes('conflict') || errorText.includes('optimistic'))) {
                resultCode = 'CONCURRENT_UPDATE';
            } else if (operation === 'delete') {
                if (errorText.includes('reference') || errorText.includes('constraint') ||
                    errorText.includes('foreign key') || errorText.includes('dependent')) {
                    resultCode = 'REFERENCE_CONSTRAINT';
                    message = `Cannot delete ${entityName} record: It is referenced by other records`;
                } else if (errorText.includes('cascade')) {
                    resultCode = 'CASCADE_CONSTRAINT';
                    message = `Cannot delete ${entityName} record: Cascade delete is not allowed`;
                }
            }
            
            // Log detailed error information for debugging
            const errorDetails = {
                entityName,
                operation,
                resultCode,
                userMessage: latestResult.Message,
                structuredError: latestResult.Error,
                structuredErrors: latestResult.Errors,
                allDetailedErrors: detailedErrors,
                success: latestResult.Success,
                timestamp: new Date().toISOString()
            };
            LogError(`Entity operation failed with structured errors: ${JSON.stringify(errorDetails)}`);
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
        
        // Build detailed error message
        let errorMessage = `Error ${operation} record: ${e.message}`;
        
        // If this is an entity error, include more details
        if (e.LatestResult) {
            errorMessage += ` (Entity Error: ${e.LatestResult.Message || 'Unknown entity error'})`;
        }
        
        // Include stack trace in verbose mode for debugging
        const errorDetails = {
            originalError: e.message,
            stack: e.stack,
            timestamp: new Date().toISOString()
        };
        
        LogError(`Detailed error information: ${JSON.stringify(errorDetails)}`);
        
        return {
            Success: false,
            ResultCode: 'FAILED',
            Message: errorMessage
        };
    }
}