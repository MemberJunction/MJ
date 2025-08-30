import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType, Resolver, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, Metadata, RunView, UserInfo, CompositeKey, DatabaseProviderBase } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { QueryCategoryEntity, QueryPermissionEntity } from '@memberjunction/core-entities';
import { QueryResolver } from '../generated/generated.js';
import { GetReadOnlyProvider, GetReadWriteProvider } from '../util.js';
import { DeleteOptionsInput } from '../generic/DeleteOptionsInput.js';
import { QueryEntityExtended } from '@memberjunction/core-entities-server';

/**
 * Query status enumeration for GraphQL
 */
export enum QueryStatus {
    Pending = "Pending",
    Approved = "Approved", 
    Rejected = "Rejected",
    Expired = "Expired"
}

registerEnumType(QueryStatus, {
    name: "QueryStatus",
    description: "Status of a query: Pending, Approved, Rejected, or Expired"
});

@InputType()
export class QueryPermissionInputType {
    @Field(() => String)
    RoleID!: string;
}

@InputType()
export class CreateQuerySystemUserInput {
    @Field(() => String)
    Name!: string;

    @Field(() => String, { nullable: true })
    CategoryID?: string;

    @Field(() => String, { nullable: true })
    CategoryPath?: string;

    @Field(() => String, { nullable: true })
    UserQuestion?: string;

    @Field(() => String, { nullable: true })
    Description?: string;

    @Field(() => String, { nullable: true })
    SQL?: string;

    @Field(() => String, { nullable: true })
    TechnicalDescription?: string;

    @Field(() => String, { nullable: true })
    OriginalSQL?: string;

    @Field(() => String, { nullable: true })
    Feedback?: string;

    @Field(() => QueryStatus, { nullable: true, defaultValue: QueryStatus.Pending })
    Status?: QueryStatus;

    @Field(() => Number, { nullable: true })
    QualityRank?: number;

    @Field(() => Number, { nullable: true })
    ExecutionCostRank?: number;

    @Field(() => Boolean, { nullable: true })
    UsesTemplate?: boolean;

    @Field(() => Boolean, { nullable: true })
    AuditQueryRuns?: boolean;

    @Field(() => Boolean, { nullable: true })
    CacheEnabled?: boolean;

    @Field(() => Number, { nullable: true })
    CacheTTLMinutes?: number;

    @Field(() => Number, { nullable: true })
    CacheMaxSize?: number;

    @Field(() => [QueryPermissionInputType], { nullable: true })
    Permissions?: QueryPermissionInputType[];
}

@InputType()
export class UpdateQuerySystemUserInput {
    @Field(() => String)
    ID!: string;

    @Field(() => String, { nullable: true })
    Name?: string;

    @Field(() => String, { nullable: true })
    CategoryID?: string;

    @Field(() => String, { nullable: true })
    CategoryPath?: string;

    @Field(() => String, { nullable: true })
    UserQuestion?: string;

    @Field(() => String, { nullable: true })
    Description?: string;

    @Field(() => String, { nullable: true })
    SQL?: string;

    @Field(() => String, { nullable: true })
    TechnicalDescription?: string;

    @Field(() => String, { nullable: true })
    OriginalSQL?: string;

    @Field(() => String, { nullable: true })
    Feedback?: string;

    @Field(() => QueryStatus, { nullable: true })
    Status?: QueryStatus;

    @Field(() => Number, { nullable: true })
    QualityRank?: number;

    @Field(() => Number, { nullable: true })
    ExecutionCostRank?: number;

    @Field(() => Boolean, { nullable: true })
    UsesTemplate?: boolean;

    @Field(() => Boolean, { nullable: true })
    AuditQueryRuns?: boolean;

    @Field(() => Boolean, { nullable: true })
    CacheEnabled?: boolean;

    @Field(() => Number, { nullable: true })
    CacheTTLMinutes?: number;

    @Field(() => Number, { nullable: true })
    CacheMaxSize?: number;

    @Field(() => [QueryPermissionInputType], { nullable: true })
    Permissions?: QueryPermissionInputType[];
}

@ObjectType()
export class QueryFieldType {
    @Field(() => String)
    ID!: string;

    @Field(() => String)
    QueryID!: string;

    @Field(() => String)
    Name!: string;

    @Field(() => String, { nullable: true })
    Description?: string;

    @Field(() => String, { nullable: true })
    Type?: string;

    @Field(() => Number)
    Sequence!: number;

    @Field(() => String, { nullable: true })
    SQLBaseType?: string;

    @Field(() => String, { nullable: true })
    SQLFullType?: string;

    @Field(() => Boolean)
    IsComputed!: boolean;

    @Field(() => String, { nullable: true })
    ComputationDescription?: string;
}

@ObjectType()
export class QueryParameterType {
    @Field(() => String)
    ID!: string;

    @Field(() => String)
    QueryID!: string;

    @Field(() => String)
    Name!: string;

    @Field(() => String)
    Type!: string;

    @Field(() => String, { nullable: true })
    DefaultValue?: string;

    @Field(() => String, { nullable: true })
    Comments?: string;

    @Field(() => Boolean)
    IsRequired!: boolean;
}

@ObjectType()
export class QueryEntityType {
    @Field(() => String)
    ID!: string;

    @Field(() => String)
    QueryID!: string;

    @Field(() => String)
    EntityID!: string;

    @Field(() => String, { nullable: true })
    EntityName?: string;
}

@ObjectType()
export class QueryPermissionType {
    @Field(() => String)
    ID!: string;

    @Field(() => String)
    QueryID!: string;

    @Field(() => String)
    RoleID!: string;

    @Field(() => String, { nullable: true })
    RoleName?: string;
}

@ObjectType()
export class CreateQueryResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    QueryData?: string;

    @Field(() => [QueryFieldType], { nullable: true })
    Fields?: QueryFieldType[];

    @Field(() => [QueryParameterType], { nullable: true })
    Parameters?: QueryParameterType[];

    @Field(() => [QueryEntityType], { nullable: true })
    Entities?: QueryEntityType[];

    @Field(() => [QueryPermissionType], { nullable: true })
    Permissions?: QueryPermissionType[];
}

@ObjectType()
export class UpdateQueryResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    QueryData?: string;

    @Field(() => [QueryFieldType], { nullable: true })
    Fields?: QueryFieldType[];

    @Field(() => [QueryParameterType], { nullable: true })
    Parameters?: QueryParameterType[];

    @Field(() => [QueryEntityType], { nullable: true })
    Entities?: QueryEntityType[];

    @Field(() => [QueryPermissionType], { nullable: true })
    Permissions?: QueryPermissionType[];
}

@ObjectType()
export class DeleteQueryResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    QueryData?: string;
}

@Resolver()
export class QueryResolverExtended extends QueryResolver {
    /**
     * Creates a new query with the provided attributes. This mutation is restricted to system users only.
     * @param input - CreateQuerySystemUserInput containing all the query attributes
     * @param context - Application context containing user information
     * @returns CreateQueryResultType with success status and query data
     */
    @RequireSystemUser()
    @Mutation(() => CreateQueryResultType)
    async CreateQuerySystemUser(
        @Arg('input', () => CreateQuerySystemUserInput) input: CreateQuerySystemUserInput,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<CreateQueryResultType> {
        try {
            // Handle CategoryPath if provided
            let finalCategoryID = input.CategoryID;
            if (input.CategoryPath) {
                const p = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
                finalCategoryID = await this.findOrCreateCategoryPath(input.CategoryPath, p, context.userPayload.userRecord);
            }
            
            // Use QueryEntityExtended which handles AI processing
            const provider = GetReadWriteProvider(context.providers); 
            const record = await provider.GetEntityObject<QueryEntityExtended>("Queries", context.userPayload.userRecord);
            
            // Set the fields from input, handling CategoryPath resolution
            const fieldsToSet = {
                ...input,
                CategoryID: finalCategoryID || input.CategoryID,
                Status: input.Status || 'Approved',
                QualityRank: input.QualityRank || 0,
                UsesTemplate: input.UsesTemplate || false,
                AuditQueryRuns: input.AuditQueryRuns || false,
                CacheEnabled: input.CacheEnabled || false,
                CacheTTLMinutes: input.CacheTTLMinutes || null,
                CacheMaxSize: input.CacheMaxSize || null
            };
            // Remove Permissions from the fields to set since we handle them separately
            delete (fieldsToSet as any).Permissions;
            
            record.SetMany(fieldsToSet, true);
            this.ListenForEntityMessages(record, pubSub, context.userPayload.userRecord);

            // Pass the transactionScopeId from the user payload to the save operation
            if (await record.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(provider, input); // fire event
                const queryID = record.ID;
                
                if (input.Permissions && input.Permissions.length > 0) {
                    await this.createPermissions(provider, input.Permissions, queryID, context.userPayload.userRecord);
                    await record.RefreshRelatedMetadata(true); // force DB update since we just created new permissions
                }                

                return {
                    Success: true,
                    QueryData: JSON.stringify(record.GetAll()),
                    Fields: record.QueryFields,
                    Parameters: record.QueryParameters,
                    Entities: record.QueryEntities,
                    Permissions: record.QueryPermissions
                };
            } 
            else {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to create query using CreateRecord method'
                };
            }
        } 
        catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `QueryResolverExtended::CreateQuerySystemUser --- Error creating query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    protected async createPermissions(p: DatabaseProviderBase, permissions: QueryPermissionInputType[], queryID: string, contextUser: UserInfo): Promise<QueryPermissionType[]> {
        // Create permissions if provided
        const createdPermissions: QueryPermissionType[] = [];
        if (permissions && permissions.length > 0) {
            for (const perm of permissions) {
                const permissionEntity = await p.GetEntityObject<QueryPermissionEntity>('Query Permissions', contextUser);
                if (permissionEntity) {
                    permissionEntity.QueryID = queryID;
                    permissionEntity.RoleID = perm.RoleID;
                    
                    const saveResult = await permissionEntity.Save();
                    if (saveResult) {
                        createdPermissions.push({
                            ID: permissionEntity.ID,
                            QueryID: permissionEntity.QueryID,
                            RoleID: permissionEntity.RoleID,
                            RoleName: permissionEntity.Role // The view includes the Role name
                        });
                    }
                }
            }
        }
        return createdPermissions;
    }

    /**
     * Updates an existing query with the provided attributes. This mutation is restricted to system users only.
     * @param input - UpdateQuerySystemUserInput containing the query ID and fields to update
     * @param context - Application context containing user information
     * @returns UpdateQueryResultType with success status and updated query data including related entities
     */
    @RequireSystemUser()
    @Mutation(() => UpdateQueryResultType)
    async UpdateQuerySystemUser(
        @Arg('input', () => UpdateQuerySystemUserInput) input: UpdateQuerySystemUserInput,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<UpdateQueryResultType> {
        try {
            // Load the existing query using QueryEntityExtended
            const provider = GetReadWriteProvider(context.providers);
            const queryEntity = await provider.GetEntityObject<QueryEntityExtended>('Queries', context.userPayload.userRecord);
            if (!queryEntity || !await queryEntity.Load(input.ID)) {
                return {
                    Success: false,
                    ErrorMessage: `Query with ID ${input.ID} not found`
                };
            }

            // Handle CategoryPath if provided
            let finalCategoryID = input.CategoryID;
            if (input.CategoryPath) {
                finalCategoryID = await this.findOrCreateCategoryPath(input.CategoryPath, provider, context.userPayload.userRecord);
            }

            // Update fields that were provided
            const updateFields: Record<string, any> = {};
            if (input.Name !== undefined) updateFields.Name = input.Name;
            if (finalCategoryID !== undefined) updateFields.CategoryID = finalCategoryID;
            if (input.UserQuestion !== undefined) updateFields.UserQuestion = input.UserQuestion;
            if (input.Description !== undefined) updateFields.Description = input.Description;
            if (input.SQL !== undefined) updateFields.SQL = input.SQL;
            if (input.TechnicalDescription !== undefined) updateFields.TechnicalDescription = input.TechnicalDescription;
            if (input.OriginalSQL !== undefined) updateFields.OriginalSQL = input.OriginalSQL;
            if (input.Feedback !== undefined) updateFields.Feedback = input.Feedback;
            if (input.Status !== undefined) updateFields.Status = input.Status;
            if (input.QualityRank !== undefined) updateFields.QualityRank = input.QualityRank;
            if (input.ExecutionCostRank !== undefined) updateFields.ExecutionCostRank = input.ExecutionCostRank;
            if (input.UsesTemplate !== undefined) updateFields.UsesTemplate = input.UsesTemplate;
            if (input.AuditQueryRuns !== undefined) updateFields.AuditQueryRuns = input.AuditQueryRuns;
            if (input.CacheEnabled !== undefined) updateFields.CacheEnabled = input.CacheEnabled;
            if (input.CacheTTLMinutes !== undefined) updateFields.CacheTTLMinutes = input.CacheTTLMinutes;
            if (input.CacheMaxSize !== undefined) updateFields.CacheMaxSize = input.CacheMaxSize;

            // Use SetMany to update all fields at once
            queryEntity.SetMany(updateFields);

            // Save the updated query
            const saveResult = await queryEntity.Save();
            if (!saveResult) {
                return {
                    Success: false,
                    ErrorMessage: `Failed to update query: ${queryEntity.LatestResult?.Message || 'Unknown error'}`
                };
            }

            const queryID = queryEntity.ID;

            // Handle permissions update if provided
            if (input.Permissions !== undefined) {
                // Delete existing permissions
                const rv = new RunView();
                const existingPermissions = await rv.RunView<QueryPermissionEntity>({
                    EntityName: 'Query Permissions',
                    ExtraFilter: `QueryID='${queryID}'`,
                    ResultType: 'entity_object'
                }, context.userPayload.userRecord);

                if (existingPermissions.Success && existingPermissions.Results) {
                    for (const perm of existingPermissions.Results) {
                        await perm.Delete();
                    }
                }

                // Create new permissions
                await this.createPermissions(provider, input.Permissions, queryID, context.userPayload.userRecord);
                
                // Refresh the metadata to get updated permissions
                await queryEntity.RefreshRelatedMetadata(true);
            }

            // Use the properties from QueryEntityExtended instead of manual loading
            const fields: QueryFieldType[] = queryEntity.QueryFields.map(f => ({
                ID: f.ID,
                QueryID: f.QueryID,
                Name: f.Name,
                Description: f.Description || undefined,
                Type: f.SQLBaseType || undefined,
                Sequence: f.Sequence,
                SQLBaseType: f.SQLBaseType || undefined,
                SQLFullType: f.SQLFullType || undefined,
                IsComputed: f.IsComputed,
                ComputationDescription: f.ComputationDescription || undefined
            }));
            
            const parameters: QueryParameterType[] = queryEntity.QueryParameters.map(p => ({
                ID: p.ID,
                QueryID: p.QueryID,
                Name: p.Name,
                Type: p.Type,
                DefaultValue: p.DefaultValue || undefined,
                Comments: '', // Not available in QueryParameterInfo
                IsRequired: p.IsRequired
            }));
            
            const entities: QueryEntityType[] = queryEntity.QueryEntities.map(e => ({
                ID: e.ID,
                QueryID: e.QueryID,
                EntityID: e.EntityID,
                EntityName: e.Entity || undefined // Property is called Entity, not EntityName
            }));
            
            const permissions: QueryPermissionType[] = queryEntity.QueryPermissions.map(p => ({
                ID: p.ID,
                QueryID: p.QueryID,
                RoleID: p.RoleID,
                RoleName: p.Role || undefined // Property is called Role, not RoleName
            }));

            return {
                Success: true,
                QueryData: JSON.stringify(queryEntity.GetAll()),
                Fields: fields,
                Parameters: parameters,
                Entities: entities,
                Permissions: permissions
            };

        } catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `QueryResolverExtended::UpdateQuerySystemUser --- Error updating query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /**
     * Deletes a query by ID. This mutation is restricted to system users only.
     * @param ID - The ID of the query to delete
     * @param options - Delete options controlling action execution
     * @param context - Application context containing user information
     * @returns DeleteQueryResultType with success status and deleted query data
     */
    @RequireSystemUser()
    @Mutation(() => DeleteQueryResultType)
    async DeleteQuerySystemResolver(
        @Arg('ID', () => String) ID: string,
        @Arg('options', () => DeleteOptionsInput, { nullable: true }) options: DeleteOptionsInput | null,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<DeleteQueryResultType> {
        try {
            // Validate ID is not null/undefined/empty
            if (!ID || ID.trim() === '') {
                return {
                    Success: false,
                    ErrorMessage: 'QueryResolverExtended::DeleteQuerySystemResolver --- Invalid query ID: ID cannot be null or empty'
                };
            }

            const provider = GetReadWriteProvider(context.providers);    
            const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
            
            // Provide default options if none provided
            const deleteOptions = options || {
                SkipEntityAIActions: false,
                SkipEntityActions: false
            };
            
            // Use inherited DeleteRecord method from ResolverBase
            const deletedQuery = await this.DeleteRecord('Queries', key, deleteOptions, provider, context.userPayload, pubSub);
            
            if (deletedQuery) {
                return {
                    Success: true,
                    QueryData: JSON.stringify(deletedQuery)
                };
            } else {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to delete query using DeleteRecord method'
                };
            }

        } catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `QueryResolverExtended::DeleteQuerySystemResolver --- Error deleting query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /**
     * Finds or creates a category hierarchy based on the provided path.
     * Path format: "Parent/Child/Grandchild" - case insensitive lookup and creation.
     * @param categoryPath - Slash-separated category path
     * @param md - Metadata instance
     * @param contextUser - User context for operations
     * @returns The ID of the final category in the path
     */
    private async findOrCreateCategoryPath(categoryPath: string, p: DatabaseProviderBase, contextUser: UserInfo): Promise<string> {
        if (!categoryPath || categoryPath.trim() === '') {
            throw new Error('CategoryPath cannot be empty');
        }

        const pathParts = categoryPath.split('/').map(part => part.trim()).filter(part => part.length > 0);
        if (pathParts.length === 0) {
            throw new Error('CategoryPath must contain at least one valid category name');
        }

        let currentParentID: string | null = null;
        let currentCategoryID: string | null = null;

        for (let i = 0; i < pathParts.length; i++) {
            const categoryName = pathParts[i];
            
            // Look for existing category at this level
            const existingCategory = await this.findCategoryByNameAndParent(p, categoryName, currentParentID, contextUser);
            
            if (existingCategory) {
                currentCategoryID = existingCategory.ID;
                currentParentID = existingCategory.ID;
            } else {
                try {
                    // Create new category
                    const newCategory = await p.GetEntityObject<QueryCategoryEntity>("Query Categories", contextUser);
                    if (!newCategory) {
                        throw new Error(`Failed to create entity object for Query Categories`);
                    }
                    
                    newCategory.Name = categoryName;
                    newCategory.ParentID = currentParentID;
                    newCategory.UserID = contextUser.ID;
                    newCategory.Description = `Auto-created category from path: ${categoryPath}`;

                    const saveResult = await newCategory.Save();
                    if (!saveResult) {
                        throw new Error(`Failed to create category '${categoryName}': ${newCategory.LatestResult?.Message || 'Unknown error'}`);
                    }

                    currentCategoryID = newCategory.ID;
                    currentParentID = newCategory.ID;

                    // Refresh metadata after each category creation to ensure it's available for subsequent lookups
                    await p.Refresh();
                } catch (error) {
                    throw new Error(`Failed to create category '${categoryName}': ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }

        if (!currentCategoryID) {
            throw new Error('Failed to determine final category ID');
        }

        return currentCategoryID;
    }

    /**
     * Finds a category by name and parent ID using case-insensitive comparison via RunView.
     * @param categoryName - Name of the category to find
     * @param parentID - Parent category ID (null for root level)
     * @param contextUser - User context for database operations
     * @returns The matching category entity or null if not found
     */
    private async findCategoryByNameAndParent(provider: DatabaseProviderBase, categoryName: string, parentID: string | null, contextUser: UserInfo): Promise<QueryCategoryEntity | null> {
        try {
            const rv = provider;
            const parentFilter = parentID ? `ParentID='${parentID}'` : 'ParentID IS NULL';
            const nameFilter = `LOWER(Name) = LOWER('${categoryName.replace(/'/g, "''")}')`; // Escape single quotes
            
            const result = await rv.RunView<QueryCategoryEntity>({
                EntityName: 'Query Categories',
                ExtraFilter: `${nameFilter} AND ${parentFilter}`,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0];
            }
            
            return null;
        } catch (error) {
            LogError(error);
            return null;
        }
    }
}