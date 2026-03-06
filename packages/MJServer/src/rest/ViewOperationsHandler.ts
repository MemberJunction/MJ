import { 
    LogError, Metadata, RunView, RunViewParams, 
    RunViewResult, UserInfo 
} from '@memberjunction/core';

/**
 * View Operations Implementation for REST endpoints
 * These functions handle running views through the REST API
 */
export class ViewOperationsHandler {
    /**
     * Run a view and return results
     */
    static async runView(params: RunViewParams, user: UserInfo): Promise<{ success: boolean, result?: RunViewResult, error?: string }> {
        try {
            // Validate entity exists
            const md = new Metadata();
            const entity = md.Entities.find(e => e.Name === params.EntityName);
            if (!entity) {
                return { 
                    success: false, 
                    error: `Entity '${params.EntityName}' not found` 
                };
            }
            
            // Check read permission
            const permissions = entity.GetUserPermisions(user);
            if (!permissions.CanRead) {
                return { 
                    success: false, 
                    error: `User ${user.Name} does not have permission to read ${params.EntityName} records` 
                };
            }
            
            // Sanitize and validate parameters
            this.sanitizeRunViewParams(params);
            
            // Execute the view
            const runView = new RunView();
            const result = await runView.RunView(params, user);
            
            return { success: true, result };
        } catch (error) {
            LogError(error);
            return { success: false, error: (error as Error)?.message || 'Unknown error' };
        }
    }
    
    /**
     * Run multiple views in batch
     */
    static async runViews(paramsArray: RunViewParams[], user: UserInfo): Promise<{ success: boolean, results?: RunViewResult[], error?: string }> {
        try {
            // Validate and sanitize each set of parameters
            const md = new Metadata();
            for (const params of paramsArray) {
                // Validate entity exists
                const entity = md.Entities.find(e => e.Name === params.EntityName);
                if (!entity) {
                    return { 
                        success: false, 
                        error: `Entity '${params.EntityName}' not found` 
                    };
                }
                
                // Check read permission
                const permissions = entity.GetUserPermisions(user);
                if (!permissions.CanRead) {
                    return { 
                        success: false, 
                        error: `User ${user.Name} does not have permission to read ${params.EntityName} records` 
                    };
                }
                
                // Sanitize parameters
                this.sanitizeRunViewParams(params);
            }
            
            // Execute the views
            const runView = new RunView();
            const results = await runView.RunViews(paramsArray, user);
            
            return { success: true, results };
        } catch (error) {
            LogError(error);
            return { success: false, error: (error as Error)?.message || 'Unknown error' };
        }
    }
    
    /**
     * List entities with optional filtering
     */
    static async listEntities(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        try {
            // Check entity exists and user has permission
            const md = new Metadata();
            const entity = md.Entities.find(e => e.Name === params.EntityName);
            if (!entity) {
                throw new Error(`Entity '${params.EntityName}' not found`);
            }
            
            const permissions = entity.GetUserPermisions(user);
            if (!permissions.CanRead) {
                throw new Error(`User ${user.Name} does not have permission to read ${params.EntityName} records`);
            }
            
            // Sanitize and validate parameters
            this.sanitizeRunViewParams(params);
            
            // Execute the view
            const runView = new RunView();
            return await runView.RunView(params, user);
        } catch (error) {
            LogError(error);
            throw error;
        }
    }
    
    /**
     * Get available views for an entity
     */
    static async getEntityViews(entityName: string, user: UserInfo): Promise<{ success: boolean, views?: any[], error?: string }> {
        try {
            // Validate entity exists
            const md = new Metadata();
            const entity = md.Entities.find(e => e.Name === entityName);
            if (!entity) {
                return { 
                    success: false, 
                    error: `Entity '${entityName}' not found` 
                };
            }
            
            // Check read permission
            const permissions = entity.GetUserPermisions(user);
            if (!permissions.CanRead) {
                return { 
                    success: false, 
                    error: `User ${user.Name} does not have permission to read ${entityName} records` 
                };
            }
            
            // Run a view to get the available views
            const params: RunViewParams = {
                EntityName: 'MJ: User Views',
                ExtraFilter: `Entity = '${entityName}'`
            };
            
            const runView = new RunView();
            const result = await runView.RunView(params, user);
            
            if (!result.Success) {
                return { 
                    success: false, 
                    error: result.ErrorMessage || 'Failed to retrieve views' 
                };
            }
            
            // Format the view data
            const views = result.Results.map(view => ({
                ID: view.ID,
                Name: view.Name,
                Description: view.Description,
                IsShared: view.IsShared,
                CreatedAt: view.CreatedAt
            }));
            
            return { success: true, views };
        } catch (error) {
            LogError(error);
            return { success: false, error: (error as Error)?.message || 'Unknown error' };
        }
    }
    
    /**
     * Sanitize and validate RunViewParams
     */
    private static sanitizeRunViewParams(params: RunViewParams): void {
        // Ensure EntityName is provided
        if (!params.EntityName) {
            throw new Error('EntityName is required');
        }
        
        // Convert string arrays if they came in as comma-separated strings
        if (params.Fields && typeof params.Fields === 'string') {
            params.Fields = (params.Fields as string).split(',');
        }
        
        // Sanitize numeric values
        if (params.MaxRows !== undefined) {
            params.MaxRows = typeof params.MaxRows === 'string' 
                ? parseInt(params.MaxRows as string) 
                : params.MaxRows;
        }
        
        if (params.StartRow !== undefined) {
            params.StartRow = typeof params.StartRow === 'string' 
                ? parseInt(params.StartRow as string) 
                : params.StartRow;
        }
        
        // Default ResultType if not provided
        if (!params.ResultType) {
            params.ResultType = 'simple';
        }
    }
}