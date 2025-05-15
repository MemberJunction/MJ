import { BaseEntity, EntityInfo, LogError, Metadata, RunView, RunQuery, UserInfo, CompositeKey } from "@memberjunction/core";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { a2aServerSettings } from './config.js';

export interface OperationResult {
    success: boolean;
    result?: any;
    errorMessage?: string;
}

export interface OperationParameters {
    [key: string]: any;
}

export class EntityOperations {
    private contextUser: UserInfo;
    private metadata: Metadata;

    constructor() {
        this.metadata = new Metadata();
        // Find the user by email if configured, otherwise use the first user in the cache
        if (a2aServerSettings?.userEmail) {
            const user = UserCache.Instance.Users.find((u: UserInfo) =>
                u.Email && u.Email.toLowerCase() === a2aServerSettings?.userEmail?.toLowerCase());

            if (user) {
                this.contextUser = user;
            } else {
                LogError('EntityOperations', 'Constructor', `User with email ${a2aServerSettings?.userEmail} not found. Using first user in cache.`);
                this.contextUser = UserCache.Instance.Users[0];
            }
        } else {
            this.contextUser = UserCache.Instance.Users[0];
        }
    }

    /**
     * Finds an entity by name
     * @param entityName The entity name to find
     * @returns The entity info or null if not found
     */
    public findEntity(entityName: string): EntityInfo | null {
        if (!entityName) return null;
        
        return this.metadata.Entities.find(e => 
            e.Name.toLowerCase() === entityName.toLowerCase() ||
            e.ClassName.toLowerCase() === entityName.toLowerCase()
        ) || null;
    }

    /**
     * Converts an entity object to JSON
     * @param record The entity record to convert
     * @returns JSON representation of the entity
     */
    public async convertEntityObjectToJSON(record: BaseEntity): Promise<any> {
        const output = await record.GetDataObjectJSON({
            includeRelatedEntityData: false,
            oldValues: false,
            omitEmptyStrings: false,
            omitNullValues: false,
            excludeFields: [],
            relatedEntityList: [],
        });
        return output;
    }

    /**
     * Creates key pairs for loading an entity
     * @param entity The entity info
     * @param parameters The parameters containing key values
     * @returns Array of key pairs for entity loading
     */
    private createKeyPairsForLoading(entity: EntityInfo, parameters: OperationParameters) {
        const keyPairs = [];
        for (const pk of entity.PrimaryKeys) {
            if (parameters[pk.Name] !== undefined) {
                keyPairs.push({
                    FieldName: pk.Name,
                    Value: parameters[pk.Name]
                });
            } else {
                throw new Error(`Missing primary key value for ${pk.Name}`);
            }
        }
        return keyPairs;
    }

    /**
     * Gets an entity record by its primary key
     * @param entityName The name of the entity
     * @param parameters Parameters containing primary key values
     * @returns The operation result
     */
    public async getEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        try {
            const entity = this.findEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const record = await this.metadata.GetEntityObject(entity.Name, this.contextUser);
            const keyPairs = this.createKeyPairsForLoading(entity, parameters);
            
            const loaded = await record.InnerLoad(new CompositeKey(keyPairs));
            if (loaded) {
                const result = await this.convertEntityObjectToJSON(record);
                return { success: true, result };
            } else {
                return { success: false, errorMessage: "Record not found" };
            }
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Creates a new entity record
     * @param entityName The name of the entity
     * @param parameters Field values for the new record
     * @returns The operation result
     */
    public async createEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        try {
            const entity = this.findEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const record = await this.metadata.GetEntityObject(entity.Name, this.contextUser);
            record.SetMany(parameters, true);
            
            const success = await record.Save();
            if (success) {
                const result = await this.convertEntityObjectToJSON(record);
                return { success: true, result };
            } else {
                return { success: false, errorMessage: "Failed to create record" };
            }
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Updates an existing entity record
     * @param entityName The name of the entity
     * @param parameters Parameters containing primary key and fields to update
     * @returns The operation result
     */
    public async updateEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        try {
            const entity = this.findEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const record = await this.metadata.GetEntityObject(entity.Name, this.contextUser);
            const keyPairs = this.createKeyPairsForLoading(entity, parameters);
            
            const loaded = await record.InnerLoad(new CompositeKey(keyPairs));
            if (loaded) {
                // Remove primary keys from update parameters
                const updateParams = { ...parameters };
                entity.PrimaryKeys.forEach(pk => {
                    delete updateParams[pk.Name];
                });
                
                record.SetMany(updateParams, true);
                const success = await record.Save();
                
                if (success) {
                    const result = await this.convertEntityObjectToJSON(record);
                    return { success: true, result };
                } else {
                    return { success: false, errorMessage: "Failed to update record" };
                }
            } else {
                return { success: false, errorMessage: "Record not found" };
            }
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Deletes an entity record
     * @param entityName The name of the entity
     * @param parameters Parameters containing primary key values
     * @returns The operation result
     */
    public async deleteEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        try {
            const entity = this.findEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const record = await this.metadata.GetEntityObject(entity.Name, this.contextUser);
            const keyPairs = this.createKeyPairsForLoading(entity, parameters);
            
            const loaded = await record.InnerLoad(new CompositeKey(keyPairs));
            if (loaded) {
                const success = await record.Delete();
                
                if (success) {
                    return { success: true };
                } else {
                    return { success: false, errorMessage: "Failed to delete record" };
                }
            } else {
                return { success: false, errorMessage: "Record not found" };
            }
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Queries an entity
     * @param entityName The name of the entity
     * @param parameters Query parameters (extraFilter, orderBy, fields)
     * @returns The operation result
     */
    public async queryEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        try {
            const entity = this.findEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const rv = new RunView();
            const queryResult = await rv.RunView({
                EntityName: entity.Name,
                ExtraFilter: parameters.extraFilter,
                OrderBy: parameters.orderBy,
                Fields: parameters.fields,
            }, this.contextUser);
            
            return { success: true, result: queryResult };
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Parses a command from text content
     * @param textContent The text content to parse
     * @returns Parsed operation details
     */
    public parseCommandFromText(textContent: string): { operation: string, entityName: string, parameters: OperationParameters } {
        let operation = 'unknown';
        let entityName = '';
        const parameters: OperationParameters = {};

        if (textContent.match(/get|retrieve|find|read/i)) {
            operation = 'get';
        } else if (textContent.match(/create|add|insert|new/i)) {
            operation = 'create';
        } else if (textContent.match(/update|edit|modify|change/i)) {
            operation = 'update';
        } else if (textContent.match(/delete|remove|drop/i)) {
            operation = 'delete';
        } else if (textContent.match(/query|list|view|search/i)) {
            operation = 'query';
        }

        // Try to extract entity name
        const entityMatches = textContent.match(/from\s+(\w+)/i) ||
                            textContent.match(/(get|update|delete|query)\s+(\w+)/i);
        if (entityMatches) {
            entityName = entityMatches[1] || entityMatches[2] || '';
        }

        // For parameters we would need more sophisticated parsing
        // This is a simplified approach
        if (operation === 'get' || operation === 'update' || operation === 'delete') {
            const idMatch = textContent.match(/id\s*[=:]\s*(\w+)/i) ||
                        textContent.match(/where\s+id\s*[=:]\s*(\w+)/i);
            if (idMatch && idMatch[1]) {
                parameters.ID = idMatch[1];
            }
        }

        if (operation === 'query') {
            const filterMatch = textContent.match(/where\s+(.+?)(\s+order\s+by|$)/i);
            if (filterMatch && filterMatch[1]) {
                parameters.extraFilter = filterMatch[1];
            }

            const orderMatch = textContent.match(/order\s+by\s+(.+?)(\s+limit|$)/i);
            if (orderMatch && orderMatch[1]) {
                parameters.orderBy = orderMatch[1];
            }
        }

        return { operation, entityName, parameters };
    }

    /**
     * Processes an operation on an entity
     * @param operation The operation to perform (get, create, update, delete, query)
     * @param entityName The name of the entity
     * @param parameters The operation parameters
     * @returns The operation result
     */
    public async processOperation(operation: string, entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        switch(operation) {
            case 'get':
                return await this.getEntity(entityName, parameters);
                
            case 'create':
                return await this.createEntity(entityName, parameters);
                
            case 'update':
                return await this.updateEntity(entityName, parameters);
                
            case 'delete':
                return await this.deleteEntity(entityName, parameters);
                
            case 'query':
                return await this.queryEntity(entityName, parameters);
                
            default:
                return { 
                    success: false, 
                    errorMessage: `Unsupported operation: ${operation}` 
                };
        }
    }
}