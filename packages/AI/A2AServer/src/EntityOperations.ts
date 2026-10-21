import {
    AssertClientInputWritableForUser,
    BaseEntity,
    CompositeKey,
    EntityInfo,
    FieldSecurityError,
    IMetadataProvider,
    LogError,
    ProjectEntityValueRowsForUser,
    ProjectEntityValuesForUser,
    RunView,
    UserInfo
} from "@memberjunction/core";
import { UserCache } from "@memberjunction/generic-database-provider";
import { a2aServerSettings } from './config.js';

export interface OperationResult {
    success: boolean;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    result?: any;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
    errorMessage?: string;  // case-violation-ok-legacy-back-compat: the A2A protocol wire shape — these field names ARE the protocol, serialized to every A2A client
}

export interface OperationParameters {
    [key: string]: any;
}

export class EntityOperations {
    /** The user every entity operation runs as; null when there is none (see the constructor). */
    private contextUser: UserInfo | null;
    /** Why {@link contextUser} is null; returned by every entity operation in that case. */
    private identityError: string | null = null;
    /** The metadata provider used for all entity operations on this instance. */
    private provider: IMetadataProvider;

    /**
     * @param provider The per-request `IMetadataProvider` to bind every entity operation to.
     *   The A2A server resolves this once per request (currently from the global
     *   `Metadata.Provider`) and passes it down — when A2AServer gains an `AppContext`-style
     *   per-request provider model, only the server's request handler changes; this class is
     *   already correct.
     *
     * @param caller The authenticated caller the request is made on behalf of. Entity operations
     *   run as this user, so row- and field-level security apply to the caller and not to a
     *   service account.
     *
     * With no caller, entity operations run as the single service identity named by
     * `a2aServerSettings.userEmail`. When that setting is missing too, or names no known user, the
     * instance still constructs, but every entity operation refuses with an explanatory error:
     * running as an arbitrary user would apply the wrong row- and field-level permissions.
     */
    constructor(provider: IMetadataProvider, caller?: UserInfo | null) {
        this.provider = provider;
        this.contextUser = caller ?? this.resolveConfiguredUser();
    }

    /** Finds the user named by the `userEmail` setting, recording why when there is none. */
    private resolveConfiguredUser(): UserInfo | null {
        const email = a2aServerSettings?.userEmail?.trim();
        if (!email) {
            this.identityError = 'A2A entity operations require a2aServerSettings.userEmail to name the user they run as; none is configured.';
            return null;
        }
        const user = UserCache.Instance.Users.find((u: UserInfo) => u.Email?.toLowerCase() === email.toLowerCase());
        if (!user) {
            this.identityError = `A2A entity operations are disabled: the configured user ${email} was not found.`;
            LogError('EntityOperations', 'Constructor', this.identityError);
            return null;
        }
        return user;
    }

    /** The result every entity operation returns when no configured user is available. */
    private noUserResult(): OperationResult {
        return { success: false, errorMessage: this.identityError ?? 'A2A entity operations have no user to run as.' };
    }

    /**
     * Finds an entity by name
     * @param entityName The entity name to find
     * @returns The entity info or null if not found
     */
    public FindEntity(entityName: string): EntityInfo | null {
        if (!entityName) return null;
        
        return this.provider.Entities.find(e => 
            e.Name.toLowerCase() === entityName.toLowerCase() ||
            e.ClassName.toLowerCase() === entityName.toLowerCase()
        ) || null;
    }

    /** @deprecated Use {@link FindEntity}. */
    public findEntity(entityName: string): EntityInfo | null {
        return this.FindEntity(entityName);
    }

    /**
     * Converts an entity object to JSON, projected for the user this instance runs as: a field
     * that user may not read is omitted.
     *
     * An entity object built for that user does not hold such a value in the first place, so this
     * is defence in depth. It is the single point through which every operation returns a record.
     * @param record The entity record to convert
     * @returns JSON representation of the entity
     */
    public async ConvertEntityObjectToJSON(record: BaseEntity): Promise<string> {
        // fls-guard: projected by ProjectEntityValuesForUser below
        const values: Record<string, unknown> = await record.GetDataObject({
            includeRelatedEntityData: false,
            oldValues: false,
            omitEmptyStrings: false,
            omitNullValues: false,
            excludeFields: [],
            relatedEntityList: [],
        });
        return JSON.stringify(ProjectEntityValuesForUser(this.provider, record.EntityInfo, values, this.contextUser));
    }

    /**
     * Why the caller may not send this input, or null when they may. A caller who is denied any
     * field on the entity is refused a key naming a field they cannot read AND a key naming no
     * field at all, with the same wording, so the refusal does not reveal which columns exist.
     * @param entity The entity the input will be applied to
     * @param values The input exactly as it will be passed to `SetMany`
     * @param user The caller
     */
    private clientInputRefusal(entity: EntityInfo, values: OperationParameters, user: UserInfo): string | null {
        try {
            AssertClientInputWritableForUser(entity, values, user);
            return null;
        } catch (error: unknown) {
            if (error instanceof FieldSecurityError) {
                return error.message;
            }
            throw error;
        }
    }

    /** @deprecated Use {@link ConvertEntityObjectToJSON}. */
    public async convertEntityObjectToJSON(record: BaseEntity): Promise<string> {
        return this.ConvertEntityObjectToJSON(record);
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
    public async GetEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        const contextUser = this.contextUser;
        if (!contextUser) {
            return this.noUserResult();
        }
        try {
            const entity = this.FindEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const record = await this.provider.GetEntityObject(entity.Name, contextUser);
            const keyPairs = this.createKeyPairsForLoading(entity, parameters);
            
            const loaded = await record.InnerLoad(new CompositeKey(keyPairs));
            if (loaded) {
                const result = await this.ConvertEntityObjectToJSON(record);
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

    /** @deprecated Use {@link GetEntity}. */
    public async getEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        return this.GetEntity(entityName, parameters);
    }

    /**
     * Creates a new entity record
     * @param entityName The name of the entity
     * @param parameters Field values for the new record
     * @returns The operation result
     */
    public async CreateEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        const contextUser = this.contextUser;
        if (!contextUser) {
            return this.noUserResult();
        }
        try {
            const entity = this.FindEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const refusal = this.clientInputRefusal(entity, parameters, contextUser);
            if (refusal) {
                return { success: false, errorMessage: refusal };
            }
            const record = await this.provider.GetEntityObject(entity.Name, contextUser);
            record.SetMany(parameters, true);
            
            const success = await record.Save();
            if (success) {
                const result = await this.ConvertEntityObjectToJSON(record);
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

    /** @deprecated Use {@link CreateEntity}. */
    public async createEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        return this.CreateEntity(entityName, parameters);
    }

    /**
     * Updates an existing entity record
     * @param entityName The name of the entity
     * @param parameters Parameters containing primary key and fields to update
     * @returns The operation result
     */
    public async UpdateEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        const contextUser = this.contextUser;
        if (!contextUser) {
            return this.noUserResult();
        }
        try {
            const entity = this.FindEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const record = await this.provider.GetEntityObject(entity.Name, contextUser);
            const keyPairs = this.createKeyPairsForLoading(entity, parameters);
            
            const loaded = await record.InnerLoad(new CompositeKey(keyPairs));
            if (loaded) {
                // Remove primary keys from update parameters
                const updateParams = { ...parameters };
                entity.PrimaryKeys.forEach(pk => {
                    delete updateParams[pk.Name];
                });

                const refusal = this.clientInputRefusal(entity, updateParams, contextUser);
                if (refusal) {
                    return { success: false, errorMessage: refusal };
                }
                record.SetMany(updateParams, true);
                const success = await record.Save();
                
                if (success) {
                    const result = await this.ConvertEntityObjectToJSON(record);
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

    /** @deprecated Use {@link UpdateEntity}. */
    public async updateEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        return this.UpdateEntity(entityName, parameters);
    }

    /**
     * Deletes an entity record
     * @param entityName The name of the entity
     * @param parameters Parameters containing primary key values
     * @returns The operation result
     */
    public async DeleteEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        const contextUser = this.contextUser;
        if (!contextUser) {
            return this.noUserResult();
        }
        try {
            const entity = this.FindEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const record = await this.provider.GetEntityObject(entity.Name, contextUser);
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

    /** @deprecated Use {@link DeleteEntity}. */
    public async deleteEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        return this.DeleteEntity(entityName, parameters);
    }

    /**
     * Queries an entity
     * @param entityName The name of the entity
     * @param parameters Query parameters (extraFilter, orderBy, fields)
     * @returns The operation result
     */
    public async QueryEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        const contextUser = this.contextUser;
        if (!contextUser) {
            return this.noUserResult();
        }
        try {
            const entity = this.FindEntity(entityName);
            if (!entity) {
                return { 
                    success: false, 
                    errorMessage: `Entity not found: ${entityName}` 
                };
            }

            const rv = new RunView();
            // Plain rows, never entity objects: what goes on the wire is the row, projected below.
            const queryResult = await rv.RunView<Record<string, unknown>>({
                EntityName: entity.Name,
                ExtraFilter: parameters.extraFilter,
                OrderBy: parameters.orderBy,
                Fields: parameters.fields,
                ResultType: 'simple',
            }, contextUser);
            const rows = ProjectEntityValueRowsForUser(this.provider, entity, queryResult.Results, contextUser);

            return { success: true, result: { ...queryResult, Results: rows } };
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /** @deprecated Use {@link QueryEntity}. */
    public async queryEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        return this.QueryEntity(entityName, parameters);
    }

    /**
     * Parses a command from text content
     * @param textContent The text content to parse
     * @returns Parsed operation details
     */
    public ParseCommandFromText(textContent: string): { operation: string, entityName: string, parameters: OperationParameters } {
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

    /** @deprecated Use {@link ParseCommandFromText}. */
    public parseCommandFromText(textContent: string): { operation: string, entityName: string, parameters: OperationParameters } {
        return this.ParseCommandFromText(textContent);
    }

    /**
     * Processes an operation on an entity
     * @param operation The operation to perform (get, create, update, delete, query)
     * @param entityName The name of the entity
     * @param parameters The operation parameters
     * @returns The operation result
     */
    public async ProcessOperation(operation: string, entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        switch(operation) {
            case 'get':
                return await this.GetEntity(entityName, parameters);
                
            case 'create':
                return await this.CreateEntity(entityName, parameters);
                
            case 'update':
                return await this.UpdateEntity(entityName, parameters);
                
            case 'delete':
                return await this.DeleteEntity(entityName, parameters);
                
            case 'query':
                return await this.QueryEntity(entityName, parameters);
                
            default:
                return { 
                    success: false, 
                    errorMessage: `Unsupported operation: ${operation}` 
                };
        }
    }

    /** @deprecated Use {@link ProcessOperation}. */
    public async processOperation(operation: string, entityName: string, parameters: OperationParameters): Promise<OperationResult> {
        return this.ProcessOperation(operation, entityName, parameters);
    }
}