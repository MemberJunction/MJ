import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType, Resolver, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, RunView, UserInfo, CompositeKey, DatabaseProviderBase, LogStatus, QueryFieldInfo, QueryParameterInfo, QueryEntityInfo, QueryPermissionInfo } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { MJQueryCategoryEntity, MJQueryPermissionEntity } from '@memberjunction/core-entities';
import { MJQueryResolver, MJQuery_, MJQueryField_, MJQueryParameter_, MJQueryEntity_, MJQueryPermission_ } from '../generated/generated.js';
import { GetReadWriteProvider } from '../util.js';
import { DeleteOptionsInput } from '../generic/DeleteOptionsInput.js';
import { MJQueryEntityServer } from '@memberjunction/core-entities-server';

/**
 * Minimal shape of a query row returned by RunView lookups (plain object, not entity instance).
 */
interface QueryViewRow {
    ID: string;
    Name: string;
    Description: string;
    CategoryID: string;
    Category: string;
    SQL: string;
    Status: string;
    QualityRank: number;
}

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

/**
 * Consolidated result type for Create and Update query mutations.
 * Composes the CodeGen-generated MJQuery_ type so that new entity fields
 * are automatically available in the GraphQL schema without manual sync.
 *
 * On success, Query contains the full query data (scalars + related entities).
 * On failure, Query is null and ErrorMessage describes the problem.
 */
@ObjectType()
export class QueryMutationResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => MJQuery_, { nullable: true })
    Query?: MJQuery_;
}

@ObjectType()
export class DeleteQueryResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    // Core query properties of deleted query
    @Field(() => String, { nullable: true })
    ID?: string;

    @Field(() => String, { nullable: true })
    Name?: string;

    @Field(() => String, { nullable: true })
    Description?: string;

    @Field(() => String, { nullable: true })
    CategoryID?: string;

    @Field(() => String, { nullable: true })
    SQL?: string;

    @Field(() => String, { nullable: true })
    Status?: string;
}

@Resolver()
export class MJQueryResolverExtended extends MJQueryResolver {
    /**
     * Creates a new query with the provided attributes. This mutation is restricted to system users only.
     * @param input - CreateQuerySystemUserInput containing all the query attributes
     * @param context - Application context containing user information
     * @returns CreateQueryResultType with success status and query data
     */
    @RequireSystemUser()
    @Mutation(() => QueryMutationResultType)
    async CreateQuerySystemUser(
        @Arg('input', () => CreateQuerySystemUserInput) input: CreateQuerySystemUserInput,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<QueryMutationResultType> {
        try {
            // Handle CategoryPath if provided
            let finalCategoryID = input.CategoryID;
            const provider = GetReadWriteProvider(context.providers);
            if (input.CategoryPath) {
                finalCategoryID = await this.findOrCreateCategoryPath(input.CategoryPath, provider, context.userPayload.userRecord);
            }

            // Check for existing query with same name in the same category
            const existingQuery = await this.findExistingQuery(provider, input.Name, finalCategoryID, context.userPayload.userRecord);

            if (existingQuery) {
                const categoryInfo = input.CategoryPath ? `category path '${input.CategoryPath}'` : `category ID '${finalCategoryID}'`;
                return {
                    Success: false,
                    ErrorMessage: `Query with name '${input.Name}' already exists in ${categoryInfo}`
                };
            }

            // Use MJQueryEntityServer which handles AI processing
            const record = await provider.GetEntityObject<MJQueryEntityServer>("MJ: Queries", context.userPayload.userRecord);
            
            // Destructure out non-database fields, keep only fields to persist
            const { Permissions: _permissions, CategoryPath: _categoryPath, ...fieldsToSet } = {
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

            record.SetMany(fieldsToSet, true);
            this.ListenForEntityMessages(record, pubSub, context.userPayload.userRecord);

            // Attempt to save the query
            const saveResult = await record.Save();

            if (saveResult) {
                // Save succeeded - fire the AfterCreate event and return all the data
                await this.AfterCreate(provider, input); // fire event
                const queryID = record.ID;

                if (input.Permissions && input.Permissions.length > 0) {
                    await this.createPermissions(provider, input.Permissions, queryID, context.userPayload.userRecord);
                    await record.RefreshRelatedMetadata(true); // force DB update since we just created new permissions
                }

                // Refresh metadata cache to include the newly created query
                // This ensures subsequent operations can find the query without additional DB calls
                await provider.Refresh();

                return this.buildSuccessResult(record);
            }
            else {
                // Save failed - check if another request created the same query (race condition)
                // Always recheck regardless of error type to handle all duplicate scenarios
                const existingQuery = await this.findExistingQuery(provider, input.Name, finalCategoryID, context.userPayload.userRecord);

                if (existingQuery) {
                    // Found the query that was created by another request — load it as a full entity
                    // so that related metadata (Fields, Parameters, Entities, Permissions) is populated
                    LogStatus(`[CreateQuery] Unique constraint detected for query '${input.Name}'. Using existing query (ID: ${existingQuery.ID}) created by concurrent request.`);
                    const existingEntity = await provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', context.userPayload.userRecord);
                    if (await existingEntity.Load(existingQuery.ID)) {
                        return this.buildSuccessResult(existingEntity);
                    }
                    // Entity load failed after confirming the row exists — extremely rare
                    return {
                        Success: false,
                        ErrorMessage: `Found query '${input.Name}' created by concurrent request (ID: ${existingQuery.ID}) but failed to load it as entity`
                    };
                }

                // Genuine failure - couldn't find an existing query with the same name
                const errorMessage = record.LatestResult?.Message || '';
                return {
                    Success: false,
                    ErrorMessage: `Failed to create query: ${errorMessage || 'Unknown error'}`
                };
            }
        } 
        catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `MJQueryResolverExtended::CreateQuerySystemUser --- Error creating query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /**
     * Maps an MJQueryEntityServer (with loaded related metadata) to a QueryMutationResultType.
     * Uses entity.GetAll() for scalar fields so that new CodeGen-generated fields are included
     * automatically without manual updates. Related entity arrays are mapped explicitly.
     */
    private buildSuccessResult(entity: MJQueryEntityServer): QueryMutationResultType {
        return {
            Success: true,
            Query: {
                ...entity.GetAll(),
                MJQueryFields_QueryIDArray: this.mapFields(entity.QueryFields),
                MJQueryParameters_QueryIDArray: this.mapParameters(entity.QueryParameters),
                MJQueryEntities_QueryIDArray: this.mapEntities(entity.QueryEntities),
                MJQueryPermissions_QueryIDArray: this.mapPermissions(entity.QueryPermissions),
            } as MJQuery_
        };
    }

    private mapFields(fields: QueryFieldInfo[]): MJQueryField_[] {
        return fields.map(f => ({
            ID: f.ID,
            QueryID: f.QueryID,
            Name: f.Name,
            Description: f.Description,
            Sequence: f.Sequence,
            SQLBaseType: f.SQLBaseType,
            SQLFullType: f.SQLFullType,
            SourceEntityID: f.SourceEntityID,
            SourceEntity: f.SourceEntity,
            SourceFieldName: f.SourceFieldName,
            IsComputed: f.IsComputed,
            ComputationDescription: f.ComputationDescription,
            IsSummary: f.IsSummary,
            SummaryDescription: f.SummaryDescription,
            _mj__CreatedAt: f.__mj_CreatedAt,
            _mj__UpdatedAt: f.__mj_UpdatedAt,
            DetectionMethod: f.DetectionMethod,
            AutoDetectConfidenceScore: f.AutoDetectConfidenceScore,
            Query: '',
        }) as MJQueryField_);
    }

    private mapParameters(params: QueryParameterInfo[]): MJQueryParameter_[] {
        return params.map(p => ({
            ID: p.ID,
            QueryID: p.QueryID,
            Name: p.Name,
            Description: p.Description,
            Type: p.Type,
            IsRequired: p.IsRequired,
            DefaultValue: p.DefaultValue,
            SampleValue: p.SampleValue,
            ValidationFilters: p.ValidationFilters,
            _mj__CreatedAt: p.__mj_CreatedAt,
            _mj__UpdatedAt: p.__mj_UpdatedAt,
            DetectionMethod: p.DetectionMethod,
            AutoDetectConfidenceScore: p.AutoDetectConfidenceScore,
            Query: p.Query ?? '',
        }) as MJQueryParameter_);
    }

    private mapEntities(entities: QueryEntityInfo[]): MJQueryEntity_[] {
        return entities.map(e => ({
            ID: e.ID,
            QueryID: e.QueryID,
            EntityID: e.EntityID,
            Entity: e.Entity,
            _mj__CreatedAt: e.__mj_CreatedAt,
            _mj__UpdatedAt: e.__mj_UpdatedAt,
            DetectionMethod: e.DetectionMethod,
            AutoDetectConfidenceScore: e.AutoDetectConfidenceScore,
            Query: e.Query ?? '',
        }) as MJQueryEntity_);
    }

    private mapPermissions(permissions: QueryPermissionInfo[]): MJQueryPermission_[] {
        return permissions.map(p => ({
            ID: p.ID,
            QueryID: p.QueryID,
            RoleID: p.RoleID,
            Role: p.Role,
            _mj__CreatedAt: new Date(),
            _mj__UpdatedAt: new Date(),
            Query: p.Query ?? '',
        }) as MJQueryPermission_);
    }

    protected async createPermissions(p: DatabaseProviderBase, permissions: QueryPermissionInputType[], queryID: string, contextUser: UserInfo): Promise<void> {
        for (const perm of permissions) {
            const permissionEntity = await p.GetEntityObject<MJQueryPermissionEntity>('MJ: Query Permissions', contextUser);
            if (permissionEntity) {
                permissionEntity.QueryID = queryID;
                permissionEntity.RoleID = perm.RoleID;
                await permissionEntity.Save();
            }
        }
    }

    /**
     * Updates an existing query with the provided attributes. This mutation is restricted to system users only.
     * @param input - UpdateQuerySystemUserInput containing the query ID and fields to update
     * @param context - Application context containing user information
     * @returns UpdateQueryResultType with success status and updated query data including related entities
     */
    @RequireSystemUser()
    @Mutation(() => QueryMutationResultType)
    async UpdateQuerySystemUser(
        @Arg('input', () => UpdateQuerySystemUserInput) input: UpdateQuerySystemUserInput,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<QueryMutationResultType> {
        try {
            // Load the existing query using MJQueryEntityServer
            const provider = GetReadWriteProvider(context.providers);
            const queryEntity = await provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', context.userPayload.userRecord);
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

            // now make sure there is NO existing query by the same name in the specified category
            const existingQueryResult = await provider.RunView({
                EntityName: 'MJ: Queries',
                ExtraFilter: `Name='${input.Name}' AND CategoryID='${finalCategoryID}'` 
            }, context.userPayload.userRecord);
            if (existingQueryResult.Success && existingQueryResult.Results?.length > 0) {
                // we have a match! Let's return an error
                return {
                    Success: false,
                    ErrorMessage: `Query with name '${input.Name}' already exists in the specified ${input.CategoryID ? 'category' : 'categoryPath'}`
                };
            }

            // Update fields that were provided
            const updateFields: Record<string, string | number | boolean | undefined> = {};
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
                const existingPermissions = await rv.RunView<MJQueryPermissionEntity>({
                    EntityName: 'MJ: Query Permissions',
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

            return this.buildSuccessResult(queryEntity);

        } catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `MJQueryResolverExtended::UpdateQuerySystemUser --- Error updating query: ${err instanceof Error ? err.message : String(err)}`
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
                    ErrorMessage: 'MJQueryResolverExtended::DeleteQuerySystemResolver --- Invalid query ID: ID cannot be null or empty'
                };
            }

            const provider = GetReadWriteProvider(context.providers);    
            const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
            
            // Provide default options if none provided
            const deleteOptions = options || {
                SkipEntityAIActions: false,
                SkipEntityActions: false,
                ReplayOnly: false,
                IsParentEntityDelete: false
            };
            
            // Use inherited DeleteRecord method from ResolverBase
            const deletedQuery = await this.DeleteRecord('MJ: Queries', key, deleteOptions, provider, context.userPayload, pubSub);
            
            if (deletedQuery) {
                return {
                    Success: true,
                    ID: deletedQuery.ID,
                    Name: deletedQuery.Name,
                    Description: deletedQuery.Description,
                    CategoryID: deletedQuery.CategoryID,
                    SQL: deletedQuery.SQL,
                    Status: deletedQuery.Status
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
                ErrorMessage: `MJQueryResolverExtended::DeleteQuerySystemResolver --- Error deleting query: ${err instanceof Error ? err.message : String(err)}`
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
                    const newCategory = await p.GetEntityObject<MJQueryCategoryEntity>("MJ: Query Categories", contextUser);
                    if (!newCategory) {
                        throw new Error(`Failed to create entity object for Query Categories`);
                    }

                    newCategory.Name = categoryName;
                    newCategory.ParentID = currentParentID;
                    newCategory.UserID = contextUser.ID;
                    newCategory.Description = `Auto-created category from path: ${categoryPath}`;

                    const saveResult = await newCategory.Save();
                    if (!saveResult) {
                        // Save failed - always recheck if another request created the same category
                        const recheckExisting = await this.findCategoryByNameAndParent(p, categoryName, currentParentID, contextUser);
                        if (recheckExisting) {
                            // Another request created it - use that one
                            LogStatus(`[CreateQuery] Unique constraint detected for category '${categoryName}'. Using existing category (ID: ${recheckExisting.ID}) created by concurrent request.`);
                            currentCategoryID = recheckExisting.ID;
                            currentParentID = recheckExisting.ID;
                        } else {
                            // Genuine failure (not a duplicate)
                            const errorMessage = newCategory.LatestResult?.Message || '';
                            throw new Error(`Failed to create category '${categoryName}': ${errorMessage || 'Unknown error'}`);
                        }
                    } else {
                        currentCategoryID = newCategory.ID;
                        currentParentID = newCategory.ID;
                    }
                } catch (error) {
                    // On error, double-check if category exists (race condition handling)
                    const recheckExisting = await this.findCategoryByNameAndParent(p, categoryName, currentParentID, contextUser);
                    if (recheckExisting) {
                        // Category exists, another request created it
                        LogStatus(`[CreateQuery] Exception during category creation for '${categoryName}'. Using existing category (ID: ${recheckExisting.ID}) created by concurrent request.`);
                        currentCategoryID = recheckExisting.ID;
                        currentParentID = recheckExisting.ID;
                    } else {
                        throw new Error(`Failed to create category '${categoryName}': ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        }

        if (!currentCategoryID) {
            throw new Error('Failed to determine final category ID');
        }

        return currentCategoryID;
    }

    /**
     * Finds an existing query by name and category ID using RunView.
     * Bypasses metadata cache to ensure we get the latest data from database.
     * @param provider - Database provider
     * @param queryName - Name of the query to find
     * @param categoryID - Category ID (can be null)
     * @param contextUser - User context for database operations
     * @returns The matching query row or null if not found
     */
    private async findExistingQuery(
        provider: DatabaseProviderBase,
        queryName: string,
        categoryID: string | null,
        contextUser: UserInfo
    ): Promise<QueryViewRow | null> {
        try {
            // Query database directly to avoid cache staleness issues
            const categoryFilter = categoryID ? `CategoryID='${categoryID}'` : 'CategoryID IS NULL';
            const nameFilter = `LOWER(Name) = LOWER('${queryName.replace(/'/g, "''")}')`;

            const result = await provider.RunView<QueryViewRow>({
                EntityName: 'MJ: Queries',
                ExtraFilter: `${nameFilter} AND ${categoryFilter}`
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0];
            }

            return null;
        } catch (error) {
            // If query fails, return null (query doesn't exist)
            return null;
        }
    }

    /**
     * Finds a category by name and parent ID using RunView.
     * Bypasses metadata cache to ensure we get the latest data from database.
     * @param categoryName - Name of the category to find
     * @param parentID - Parent category ID (null for root level)
     * @param contextUser - User context for database operations
     * @returns The matching category entity or null if not found
     */
    private async findCategoryByNameAndParent(provider: DatabaseProviderBase, categoryName: string, parentID: string | null, contextUser: UserInfo): Promise<MJQueryCategoryEntity | null> {
        try {
            // Query database directly to avoid cache staleness issues
            const parentFilter = parentID ? `ParentID='${parentID}'` : 'ParentID IS NULL';
            const nameFilter = `LOWER(Name) = LOWER('${categoryName.replace(/'/g, "''")}')`; // Escape single quotes

            const result = await provider.RunView<MJQueryCategoryEntity>({
                EntityName: 'MJ: Query Categories',
                ExtraFilter: `${nameFilter} AND ${parentFilter}`,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0];
            }

            return null;
        } catch (error) {
            // If query fails, return null
            return null;
        }
    }
}