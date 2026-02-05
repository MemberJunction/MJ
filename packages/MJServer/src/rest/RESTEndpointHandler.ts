import express from 'express';
import { 
    BaseEntity, CompositeKey, EntityDeleteOptions, EntityInfo, 
    EntityPermissionType, EntitySaveOptions, LogError, Metadata, 
    RunView, RunViewParams 
} from '@memberjunction/core';
import { EntityCRUDHandler } from './EntityCRUDHandler.js';
import { ViewOperationsHandler } from './ViewOperationsHandler.js';

/**
 * Configuration options for RESTEndpointHandler
 */
export interface RESTEndpointHandlerOptions {
    /**
     * Array of entity names to include in the API (case-insensitive)
     * If provided, only these entities will be accessible through the REST API
     * Supports wildcards using '*' (e.g., 'User*' matches 'User', 'UserRole', etc.)
     */
    includeEntities?: string[];
    
    /**
     * Array of entity names to exclude from the API (case-insensitive)
     * These entities will not be accessible through the REST API
     * Supports wildcards using '*' (e.g., 'Secret*' matches 'Secret', 'SecretKey', etc.)
     * Note: Exclude patterns always override include patterns
     */
    excludeEntities?: string[];
    
    /**
     * Array of schema names to include in the API (case-insensitive)
     * If provided, only entities in these schemas will be accessible through the REST API
     */
    includeSchemas?: string[];
    
    /**
     * Array of schema names to exclude from the API (case-insensitive)
     * Entities in these schemas will not be accessible through the REST API
     * Note: Exclude patterns always override include patterns
     */
    excludeSchemas?: string[];
}

/**
 * RESTEndpointHandler provides REST API functionality for MemberJunction entities
 * This class handles request routing and processing for a /rest endpoint that exposes
 * entity operations via REST instead of GraphQL
 */
export class RESTEndpointHandler {
    private router: express.Router;
    private options: RESTEndpointHandlerOptions;

    constructor(options: RESTEndpointHandlerOptions = {}) {
        this.router = express.Router();
        this.options = options;
        this.setupRoutes();
    }

    /**
     * Helper to safely extract a string from Express route params
     * Express 5.x types params as string | string[] | undefined
     */
    private getStringParam(param: string | string[] | undefined): string {
        if (Array.isArray(param)) {
            return param[0] || '';
        }
        return param || '';
    }
    
    /**
     * Determines if an entity is allowed based on include/exclude lists
     * with support for wildcards and schema-level filtering
     * @param entityName The name of the entity to check
     * @returns True if the entity is allowed, false otherwise
     */
    private isEntityAllowed(entityName: string): boolean {
        const name = entityName.toLowerCase();
        const md = new Metadata();
        const entity = md.Entities.find(e => e.Name.toLowerCase() === name);
        
        // If entity not found in metadata, don't allow it
        if (!entity) {
            return false;
        }
        
        const schemaName = entity.SchemaName.toLowerCase();
        
        // 1. Check schema exclusions first (these take highest precedence)
        if (this.options.excludeSchemas && this.options.excludeSchemas.length > 0) {
            if (this.options.excludeSchemas.some(schema => schema.toLowerCase() === schemaName)) {
                return false;
            }
        }
        
        // 2. Check entity exclusions next (these override entity inclusions)
        if (this.options.excludeEntities && this.options.excludeEntities.length > 0) {
            // Check for direct match
            if (this.options.excludeEntities.includes(name)) {
                return false;
            }
            
            // Check for wildcard matches
            for (const pattern of this.options.excludeEntities) {
                if (pattern.includes('*')) {
                    const regex = new RegExp('^' + pattern.toLowerCase().replace(/\*/g, '.*') + '$');
                    if (regex.test(name)) {
                        return false;
                    }
                }
            }
        }
        
        // 3. Check schema inclusions (if specified, only entities from these schemas are allowed)
        if (this.options.includeSchemas && this.options.includeSchemas.length > 0) {
            if (!this.options.includeSchemas.some(schema => schema.toLowerCase() === schemaName)) {
                return false;
            }
        }
        
        // 4. Check entity inclusions
        if (this.options.includeEntities && this.options.includeEntities.length > 0) {
            // Check for direct match
            if (this.options.includeEntities.includes(name)) {
                return true;
            }
            
            // Check for wildcard matches
            for (const pattern of this.options.includeEntities) {
                if (pattern.includes('*')) {
                    const regex = new RegExp('^' + pattern.toLowerCase().replace(/\*/g, '.*') + '$');
                    if (regex.test(name)) {
                        return true;
                    }
                }
            }
            
            // If include list is specified but no matches found, entity is not allowed
            return false;
        }
        
        // By default, allow all entities
        return true;
    }

    /**
     * Set up all the API routes for the REST endpoints
     */
    private setupRoutes() {
        // Middleware to extract MJ user
        this.router.use(this.extractMJUser);
        
        // Middleware to check entity allowlist/blocklist
        this.router.use('/entities/:entityName', this.checkEntityAccess.bind(this));
        this.router.use('/views/:entityName', this.checkEntityAccess.bind(this));
        this.router.use('/metadata/entities/:entityName', this.checkEntityAccess.bind(this));
        this.router.use('/users/:userId/favorites/:entityName', this.checkEntityAccess.bind(this));

        // Entity collection operations
        this.router.get('/entities/:entityName', this.getEntityList.bind(this));
        this.router.post('/entities/:entityName', this.createEntity.bind(this));

        // Individual entity operations
        this.router.get('/entities/:entityName/:id', this.getEntity.bind(this));
        this.router.put('/entities/:entityName/:id', this.updateEntity.bind(this));
        this.router.delete('/entities/:entityName/:id', this.deleteEntity.bind(this));
        
        // Record changes and dependencies
        this.router.get('/entities/:entityName/:id/changes', this.getRecordChanges.bind(this));
        this.router.get('/entities/:entityName/:id/dependencies', this.getRecordDependencies.bind(this));
        this.router.get('/entities/:entityName/:id/name', this.getEntityRecordName.bind(this));

        // View operations
        this.router.post('/views/:entityName', this.runView.bind(this));
        this.router.post('/views/batch', this.runViews.bind(this));
        this.router.get('/views/entity', this.getViewEntity.bind(this));
        
        // Metadata endpoints
        this.router.get('/metadata/entities', this.getEntityMetadata.bind(this));
        this.router.get('/metadata/entities/:entityName', this.getEntityFieldMetadata.bind(this));
        
        // Views metadata
        this.router.get('/views/:entityName/metadata', this.getViewsMetadata.bind(this));
        
        // User operations
        this.router.get('/users/current', this.getCurrentUser.bind(this));
        this.router.get('/users/:userId/favorites/:entityName/:id', this.getRecordFavoriteStatus.bind(this));
        this.router.put('/users/:userId/favorites/:entityName/:id', this.setRecordFavoriteStatus.bind(this));
        this.router.delete('/users/:userId/favorites/:entityName/:id', this.removeRecordFavoriteStatus.bind(this));
        
        // Transaction operations
        this.router.post('/transactions', this.executeTransaction.bind(this));
        
        // Reports and queries
        this.router.get('/reports/:reportId', this.runReport.bind(this));
        this.router.post('/queries/run', this.runQuery.bind(this));
        
        // Error handling
        this.router.use(this.errorHandler);
    }

    /**
     * Middleware to check entity access based on include/exclude lists
     */
    private checkEntityAccess(req: express.Request, res: express.Response, next: express.NextFunction): void {
        const entityName = this.getStringParam(req.params.entityName);

        if (!entityName) {
            next();
            return;
        }

        if (!this.isEntityAllowed(entityName)) {
            res.status(403).json({
                error: `Access to entity '${entityName}' is not allowed through the REST API`,
                details: 'This entity is either not included in the allowlist or is explicitly excluded in the REST API configuration'
            });
            return;
        }
        
        next();
    }
    
    /**
     * Middleware to extract MJ user from request
     */
    private async extractMJUser(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
        try {
            // If authentication middleware has already set req.user with basic info
            if (req['user']) {
                // Get the full MemberJunction user
                const md = new Metadata();
                const userInfo = req['user'];
                // Get user info based on email or ID
                // Note: The actual implementation here would depend on how the MemberJunction core handles user lookup
                // This is a simplification that would need to be implemented properly
                req['mjUser'] = userInfo;
                
                if (!req['mjUser']) {
                    res.status(401).json({ error: 'User not found in MemberJunction' });
                    return;
                }
            } else {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }
            
            next();
        } catch (error) {
            next(error);
        }
    }

    /**
     * Error handling middleware
     */
    private errorHandler(err: any, req: express.Request, res: express.Response, next: express.NextFunction): void {
        LogError(err);
        
        if (err.name === 'UnauthorizedError') {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        
        res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
    }

    /**
     * Get the current user
     */
    private async getCurrentUser(req: express.Request, res: express.Response): Promise<void> {
        try {
            const user = req['mjUser'];
            
            // Return user info without sensitive data
            res.json({
                ID: user.ID,
                Name: user.Name,
                Email: user.Email,
                FirstName: user.FirstName,
                LastName: user.LastName,
                IsAdmin: user.IsAdmin,
                UserRoles: user.UserRoles.map(role => ({
                    ID: role.ID,
                    Name: role.Name,
                    Description: role.Description
                }))
            });
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Lists entities with optional filtering
     */
    private async getEntityList(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const { filter, orderBy, fields, maxRows, startRow } = req.query;
            
            const user = req['mjUser'];
            
            // Convert the request to a RunViewParams object
            const params: RunViewParams = {
                EntityName: entityName,
                ExtraFilter: filter as string,
                OrderBy: orderBy as string,
                Fields: fields ? (fields as string).split(',') : undefined,
                MaxRows: maxRows ? parseInt(maxRows as string) : undefined,
                StartRow: startRow ? parseInt(startRow as string) : undefined
            };
            
            const result = await ViewOperationsHandler.listEntities(params, user);
            res.json(result);
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get a single entity by ID
     */
    private async getEntity(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const { include } = req.query; // Optional related entities to include

            const user = req['mjUser'];
            const relatedEntities = include ? (include as string).split(',') : null;

            const result = await EntityCRUDHandler.getEntity(entityName, id, relatedEntities, user);
            
            if (result.success) {
                res.json(result.entity);
            } else {
                res.status(result.error.includes('not found') ? 404 : 400).json({ error: result.error });
            }
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Create a new entity
     */
    private async createEntity(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const entityData = req.body;
            
            const user = req['mjUser'];
            
            const result = await EntityCRUDHandler.createEntity(entityName, entityData, user);
            
            if (result.success) {
                res.status(201).json(result.entity);
            } else {
                res.status(400).json({ 
                    error: result.error,
                    details: result.details
                });
            }
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Update an existing entity
     */
    private async updateEntity(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const updateData = req.body;

            const user = req['mjUser'];

            const result = await EntityCRUDHandler.updateEntity(entityName, id, updateData, user);
            
            if (result.success) {
                res.json(result.entity);
            } else {
                res.status(result.error.includes('not found') ? 404 : 400).json({ 
                    error: result.error,
                    details: result.details
                });
            }
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Delete an entity
     */
    private async deleteEntity(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const options = req.query.options ? JSON.parse(req.query.options as string) : {};
            
            const user = req['mjUser'];
            
            // Convert options to EntityDeleteOptions
            const deleteOptions = new EntityDeleteOptions();
            if (options.SkipEntityAIActions !== undefined) deleteOptions.SkipEntityAIActions = !!options.SkipEntityAIActions;
            if (options.SkipEntityActions !== undefined) deleteOptions.SkipEntityActions = !!options.SkipEntityActions;
            if (options.ReplayOnly !== undefined) deleteOptions.ReplayOnly = !!options.ReplayOnly;
            
            const result = await EntityCRUDHandler.deleteEntity(entityName, id, deleteOptions, user);
            
            if (result.success) {
                res.status(204).send();
            } else {
                res.status(result.error.includes('not found') ? 404 : 400).json({ error: result.error });
            }
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get record changes for an entity
     */
    private async getRecordChanges(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const user = req['mjUser'];

            // Get the entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);

            // Create a composite key
            const compositeKey = this.createCompositeKey(entity.EntityInfo, id);
            
            // Use a direct approach for getting record changes
            // Note: This is a simplification. The actual implementation may need to be adjusted
            // based on how the MemberJunction core handles record changes
            const changes = []; // This would be populated with actual record changes
            
            res.json(changes);
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get record dependencies for an entity
     */
    private async getRecordDependencies(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const user = req['mjUser'];

            // Get the entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);

            // Create a composite key
            const compositeKey = this.createCompositeKey(entity.EntityInfo, id);
            
            // Use a direct approach for getting record dependencies
            // Note: This is a simplification. The actual implementation may need to be adjusted
            // based on how the MemberJunction core handles record dependencies
            const dependencies = []; // This would be populated with actual record dependencies
            
            res.json(dependencies);
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get entity record name
     */
    private async getEntityRecordName(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const user = req['mjUser'];

            // Get the entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);

            // Create a composite key
            const compositeKey = this.createCompositeKey(entity.EntityInfo, id);
            
            // Use a direct approach for getting entity record name
            // Note: This is a simplification. The actual implementation may need to be adjusted
            const recordName = "Record Name"; // This would be populated with the actual record name
            
            res.json({ recordName });
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Run a view
     */
    private async runView(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);
            const viewParams = req.body;
            
            const user = req['mjUser'];
            
            // Create RunViewParams from the request body
            const params: RunViewParams = {
                EntityName: entityName,
                ...viewParams
            };
            
            const result = await ViewOperationsHandler.runView(params, user);
            
            if (result.success) {
                res.json(result.result);
            } else {
                res.status(400).json({ error: result.error });
            }
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Run multiple views in batch
     */
    private async runViews(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { params } = req.body;
            const user = req['mjUser'];
            
            if (!Array.isArray(params)) {
                res.status(400).json({ error: 'params must be an array of RunViewParams' });
                return;
            }
            
            // Filter out any views for entities that aren't allowed
            // using our enhanced entity filtering with wildcards and schema support
            const filteredParams = params.filter(p => this.isEntityAllowed(p.EntityName));
            
            // If all requested entities were filtered out, return an error
            if (filteredParams.length === 0 && params.length > 0) {
                res.status(403).json({ 
                    error: 'None of the requested entities are allowed through the REST API',
                    details: 'The entities requested are either not included in the allowlist or are explicitly excluded in the REST API configuration'
                });
                return;
            }
            
            const result = await ViewOperationsHandler.runViews(filteredParams, user);
            
            if (result.success) {
                res.json(result.results);
            } else {
                res.status(400).json({ error: result.error });
            }
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get entity for a view
     */
    private async getViewEntity(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { ViewID, ViewName } = req.query;
            const user = req['mjUser'];
            
            if (!ViewID && !ViewName) {
                res.status(400).json({ error: 'Either ViewID or ViewName must be provided' });
                return;
            }
            
            // Placeholder implementation - this would need to be implemented to lookup view metadata
            const entityName = "SampleEntity"; // This would be determined by looking up the view
            
            res.json({ entityName });
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get metadata for all entities
     */
    private async getEntityMetadata(req: express.Request, res: express.Response): Promise<void> {
        try {
            const user = req['mjUser'];
            
            // Filter entities based on user permissions and REST API configuration
            const md = new Metadata();
            const entities = md.Entities.filter(e => {
                // First check if entity is allowed based on configuration
                if (!this.isEntityAllowed(e.Name)) {
                    return false;
                }
                
                // Then check user permissions
                const permissions = e.GetUserPermisions(user);
                return permissions.CanRead;
            });
            
            const result = entities.map(e => ({
                Name: e.Name,
                ClassName: e.ClassName,
                SchemaName: e.SchemaName,
                DisplayName: e.DisplayName,
                Description: e.Description,
                IncludeInAPI: e.IncludeInAPI,
                AllowCreateAPI: e.AllowCreateAPI,
                AllowUpdateAPI: e.AllowUpdateAPI,
                AllowDeleteAPI: e.AllowDeleteAPI
            }));
            
            res.json(result);
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get field metadata for a specific entity
     */
    private async getEntityFieldMetadata(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);

            const user = req['mjUser'];
            
            const md = new Metadata();
            const entity = md.Entities.find(e => e.Name === entityName);
            if (!entity) {
                res.status(404).json({ error: `Entity '${entityName}' not found` });
                return;
            }
            
            // Check if user can read this entity
            const permissions = entity.GetUserPermisions(user);
            if (!permissions.CanRead) {
                res.status(403).json({ error: 'Permission denied' });
                return;
            }
            
            const result = entity.Fields.map(f => ({
                Name: f.Name,
                DisplayName: f.DisplayName,
                Description: f.Description,
                Type: f.Type,
                IsRequired: f.AllowsNull === false,
                IsPrimaryKey: f.IsPrimaryKey,
                IsUnique: f.IsUnique,
                MaxLength: f.MaxLength,
                DefaultValue: f.DefaultValue,
                CodeName: f.CodeName,
                TSType: f.TSType
            }));
            
            res.json(result);
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get metadata about available views for an entity
     */
    private async getViewsMetadata(req: express.Request, res: express.Response): Promise<void> {
        try {
            const entityName = this.getStringParam(req.params.entityName);

            const user = req['mjUser'];
            
            // This would need to be implemented to retrieve available views
            // Placeholder implementation
            const views = []; // Would need to query available views for this entity
            
            res.json(views);
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Get favorite status for a record
     */
    private async getRecordFavoriteStatus(req: express.Request, res: express.Response): Promise<void> {
        try {
            const userId = this.getStringParam(req.params.userId);
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const user = req['mjUser'];

            // Get the entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);

            // Create a composite key
            const compositeKey = this.createCompositeKey(entity.EntityInfo, id);
            
            // Use a direct approach for getting favorite status
            // Note: This is a simplification. The actual implementation may need to be adjusted
            const isFavorite = false; // This would be populated with the actual favorite status
            
            res.json({ isFavorite });
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Set favorite status for a record
     */
    private async setRecordFavoriteStatus(req: express.Request, res: express.Response): Promise<void> {
        try {
            const userId = this.getStringParam(req.params.userId);
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const user = req['mjUser'];

            // Get the entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);

            // Create a composite key
            const compositeKey = this.createCompositeKey(entity.EntityInfo, id);
            
            // Use a direct approach for setting favorite status
            // Note: This is a simplification. The actual implementation may need to be adjusted
            // This would set the favorite status to true
            
            res.status(204).send();
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Remove favorite status for a record
     */
    private async removeRecordFavoriteStatus(req: express.Request, res: express.Response): Promise<void> {
        try {
            const userId = this.getStringParam(req.params.userId);
            const entityName = this.getStringParam(req.params.entityName);
            const id = this.getStringParam(req.params.id);
            const user = req['mjUser'];

            // Get the entity object
            const md = new Metadata();
            const entity = await md.GetEntityObject(entityName, user);

            // Create a composite key
            const compositeKey = this.createCompositeKey(entity.EntityInfo, id);
            
            // Use a direct approach for setting favorite status
            // Note: This is a simplification. The actual implementation may need to be adjusted
            // This would set the favorite status to false
            
            res.status(204).send();
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Execute a transaction
     */
    private async executeTransaction(req: express.Request, res: express.Response): Promise<void> {
        try {
            // Placeholder implementation - this would need to be implemented to handle transactions
            res.status(501).json({ error: 'Not implemented' });
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Run a report
     */
    private async runReport(req: express.Request, res: express.Response): Promise<void> {
        try {
            // Placeholder implementation - this would need to be implemented to run reports
            res.status(501).json({ error: 'Not implemented' });
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Run a query
     */
    private async runQuery(req: express.Request, res: express.Response): Promise<void> {
        try {
            // Placeholder implementation - this would need to be implemented to run queries
            res.status(501).json({ error: 'Not implemented' });
        } catch (error) {
            LogError(error);
            res.status(500).json({ error: (error as Error)?.message || 'Unknown error' });
        }
    }

    /**
     * Helper method to create a composite key from an ID
     */
    private createCompositeKey(entityInfo: EntityInfo, id: string): CompositeKey {
        if (entityInfo.PrimaryKeys.length === 1) {
            // Single primary key
            const primaryKeyField = entityInfo.PrimaryKeys[0].Name;
            const compositeKey = new CompositeKey();
            
            // Use key-value pairs instead of SetValue
            compositeKey.KeyValuePairs = [
                { FieldName: primaryKeyField, Value: id }
            ];
            
            return compositeKey;
        } else {
            // Composite primary key
            // This is a simplification - in a real implementation, we would need to handle composite keys properly
            throw new Error('Composite primary keys are not supported in this implementation');
        }
    }

    /**
     * Get the Express router with all configured routes
     */
    public getRouter(): express.Router {
        return this.router;
    }
}