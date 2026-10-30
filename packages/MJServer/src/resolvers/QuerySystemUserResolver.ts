import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType, Resolver, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext } from '../types.js';
import { AssertClientInputWritableForUser, LogError, UserInfo, CompositeKey, DatabaseProviderBase, LogStatus } from '@memberjunction/core';
import { MJQueryCategoryEntity, MJQueryPermissionEntity, MJQueryFieldEntity, MJQueryParameterEntity, MJQueryEntityEntity, QueryEngine } from '@memberjunction/core-entities';
import { MJQueryResolver, MJQuery_, MJQueryField_, MJQueryParameter_, MJQueryEntity_, MJQueryPermission_ } from '../generated/generated.js';
import { GetReadWriteProvider } from '../util.js';
import { DeleteOptionsInput } from '../generic/DeleteOptionsInput.js';
import { MJQueryEntityServer } from '@memberjunction/core-entities-server';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

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
export class QueryParameterHintInput {
    @Field(() => String)
    Name!: string;

    @Field(() => String)
    Value!: string;
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

    @Field(() => [QueryParameterHintInput], { nullable: true })
    ParameterHints?: QueryParameterHintInput[];

    @Field(() => Boolean, { nullable: true, defaultValue: false })
    AutoResolveCollision?: boolean;
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

    @Field(() => [QueryParameterHintInput], { nullable: true })
    ParameterHints?: QueryParameterHintInput[];
}

/**
 * Consolidated result type for Create and Update query mutations.
 * Composes the CodeGen-generated MJQuery_ type so that new entity fields
 * are automatically available in the GraphQL schema without manual sync.
 *
 * Child collections live on this result type (not as generated `*Array`
 * FieldResolvers on MJQuery_) so the mutation can return the graph it already
 * loaded without a per-parent SELECT *.
 *
 * On success, Query contains the query scalars and Fields/Parameters/Entities/
 * Permissions hold the related rows. On failure, Query is null and
 * ErrorMessage describes the problem.
 */
@ObjectType()
export class QueryMutationResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => MJQuery_, { nullable: true })
    Query?: MJQuery_;

    @Field(() => [MJQueryField_], { nullable: true })
    Fields?: MJQueryField_[];

    @Field(() => [MJQueryParameter_], { nullable: true })
    Parameters?: MJQueryParameter_[];

    @Field(() => [MJQueryEntity_], { nullable: true })
    Entities?: MJQueryEntity_[];

    @Field(() => [MJQueryPermission_], { nullable: true })
    Permissions?: MJQueryPermission_[];
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

/** A query's child rows, read from the database. */
interface StoredQueryChildren {
    readonly Fields: MJQueryFieldEntity[];
    readonly Parameters: MJQueryParameterEntity[];
    readonly Entities: MJQueryEntityEntity[];
    readonly Permissions: MJQueryPermissionEntity[];
}

@Resolver()
export class MJQueryResolverExtended extends MJQueryResolver {
    /**
     * Creates a new query with the provided attributes. Requires `query:create` scope for API key users;
     * entity-level create permission on MJ: Queries for all users.
     * @param input - CreateQuerySystemUserInput containing all the query attributes
     * @param context - Application context containing user information
     * @returns CreateQueryResultType with success status and query data
     */
    @Mutation(() => QueryMutationResultType)
    async CreateQueryExtended(
        @Arg('input', () => CreateQuerySystemUserInput) input: CreateQuerySystemUserInput,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<QueryMutationResultType> {
        try {
            await this.CheckAPIKeyScopeAuthorization('query:create', '*', context.userPayload);

            // Handle CategoryPath if provided
            let finalCategoryID = input.CategoryID;
            const provider = GetReadWriteProvider(context.providers);
            if (input.CategoryPath) {
                finalCategoryID = await this.findOrCreateCategoryPath(input.CategoryPath, provider, context.userPayload.userRecord);
            }

            // Check for existing query with same name in the same category
            const requestedName = input.Name;
            const existingQuery = await this.findExistingQuery(provider, input.Name, finalCategoryID, context.userPayload.userRecord);

            if (existingQuery) {
                if (input.AutoResolveCollision) {
                    // Server-side collision resolution: find a unique name using sequential numeric suffixes
                    input.Name = await this.findUniqueName(provider, input.Name, finalCategoryID, context.userPayload.userRecord);
                    LogStatus(`[CreateQuery] Auto-resolved name collision: "${existingQuery.Name}" -> "${input.Name}"`);
                } else {
                    const categoryInfo = input.CategoryPath ? `category path '${input.CategoryPath}'` : `category ID '${finalCategoryID}'`;
                    return {
                        Success: false,
                        ErrorMessage: `Query with name '${input.Name}' already exists in ${categoryInfo}`
                    };
                }
            }

            return await this.createQueryAsync(provider, input, requestedName, finalCategoryID, context, pubSub);
        } 
        catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `MJQueryResolverExtended::CreateQuerySystemUser --- Error creating query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /** The most times a create with `AutoResolveCollision` picks a new name after losing a same-name race. */
    private static readonly maxCollisionRetries = 25;

    /**
     * Creates the query, handling a same-name race (#6007): when the insert fails and a query with
     * the name now exists (another request created it in between), `AutoResolveCollision` picks a
     * new unique name and tries again, a bounded number of times, and never returns the other
     * request's query. Without it, the query that now exists is returned (create-or-get). Any other
     * failure, including a save-time refusal of the SQL, returns the save's message.
     *
     * @param requestedName - The name the caller asked for; each retry's unique name is built from it.
     */
    private async createQueryAsync(
        provider: DatabaseProviderBase,
        input: CreateQuerySystemUserInput,
        requestedName: string,
        categoryID: string | null | undefined,
        context: AppContext,
        pubSub: PubSubEngine
    ): Promise<QueryMutationResultType> {
        const user = context.userPayload.userRecord;
        for (let attempt = 0; ; attempt++) {
            const record = await this.newQueryRecordAsync(provider, input, categoryID, context, pubSub);
            if (await record.Save()) {
                return this.completeCreateAsync(provider, input, record, user);
            }
            const existing = await this.findExistingQuery(provider, input.Name, categoryID ?? null, user);
            if (!existing) {
                return { Success: false, ErrorMessage: `Failed to create query: ${record.LatestResult?.CompleteMessage || record.LatestResult?.Message || 'the save reported no reason'}` };
            }
            if (!input.AutoResolveCollision) {
                return this.existingQueryResultAsync(provider, existing, input.Name, user);
            }
            if (attempt >= MJQueryResolverExtended.maxCollisionRetries) {
                return { Success: false, ErrorMessage: `Failed to create query '${input.Name}': another request took each unique name tried, ${attempt + 1} times.` };
            }
            const lost = input.Name;
            input.Name = await this.findUniqueName(provider, requestedName, categoryID ?? null, user);
            LogStatus(`[CreateQuery] Lost a name race for "${lost}"; retrying as "${input.Name}"`);
        }
    }

    /** A new, unsaved query record holding the input's values. */
    private async newQueryRecordAsync(
        provider: DatabaseProviderBase,
        input: CreateQuerySystemUserInput,
        categoryID: string | null | undefined,
        context: AppContext,
        pubSub: PubSubEngine
    ): Promise<MJQueryEntityServer> {
        const record = await provider.GetEntityObject<MJQueryEntityServer>("MJ: Queries", context.userPayload.userRecord);
        // Destructure out non-database fields, keep only fields to persist
        const { Permissions: _permissions, CategoryPath: _categoryPath, ParameterHints: _parameterHints, AutoResolveCollision: _autoResolve, ...fieldsToSet } = {
            ...input,
            CategoryID: categoryID || input.CategoryID,
            Status: input.Status || 'Approved',
            QualityRank: input.QualityRank || 0,
            UsesTemplate: input.UsesTemplate || false,
            AuditQueryRuns: input.AuditQueryRuns || false,
            CacheEnabled: input.CacheEnabled || false,
            CacheTTLMinutes: input.CacheTTLMinutes || null,
            CacheMaxSize: input.CacheMaxSize || null
        };
        // Field-level security: refuse a key the caller may not read, or that names no field
        AssertClientInputWritableForUser(record.EntityInfo, fieldsToSet, context.userPayload.userRecord);
        record.SetMany(fieldsToSet, true);
        // Pass caller-provided parameter sample values (used for new parameters and the described renders)
        if (input.ParameterHints && input.ParameterHints.length > 0) {
            record.ParameterHints = new Map(input.ParameterHints.map(h => [h.Name, h.Value]));
        }
        this.ListenForEntityMessages(record, pubSub, context.userPayload.userRecord);
        return record;
    }

    /** After a successful create: the AfterCreate event, the permissions, and the result. */
    private async completeCreateAsync(provider: DatabaseProviderBase, input: CreateQuerySystemUserInput, record: MJQueryEntityServer, user: UserInfo): Promise<QueryMutationResultType> {
        await this.AfterCreate(provider, input); // fire event
        if (input.Permissions && input.Permissions.length > 0) {
            try {
                await this.createPermissions(provider, input.Permissions, record.ID, user);
            } catch (e) {
                return { Success: false, ErrorMessage: `Query '${record.Name}' (ID ${record.ID}) was created, but its permissions were not: ${e instanceof Error ? e.message : String(e)}` };
            }
        }
        return this.buildSuccessResult(record, user, provider);
    }

    /** The create-or-get result: the query another request created with this name. */
    private async existingQueryResultAsync(provider: DatabaseProviderBase, existing: QueryViewRow, name: string, user: UserInfo): Promise<QueryMutationResultType> {
        LogStatus(`[CreateQuery] Unique constraint detected for query '${name}'. Using existing query (ID: ${existing.ID}) created by concurrent request.`);
        const existingEntity = await provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', user);
        if (await existingEntity.Load(existing.ID)) {
            // The other request may have run on another server, or its rows may not have reached this
            // process's query cache yet, so the child rows are read from the database.
            const children = await this.readStoredChildrenAsync(provider, existing.ID, user);
            return this.buildSuccessResult(existingEntity, user, provider, children);
        }
        return {
            Success: false,
            ErrorMessage: `Found query '${name}' created by concurrent request (ID: ${existing.ID}) but failed to load it as entity`
        };
    }

    /**
     * Maps an MJQueryEntityServer (with loaded related metadata) to a QueryMutationResultType.
     * Uses entity.GetAll() for scalar fields so that new CodeGen-generated fields are included
     * automatically without manual updates. Related entity arrays are mapped explicitly.
     *
     * @param contextUser The caller the result is for. Field security projects the record for them.
     */
    private async buildSuccessResult(entity: MJQueryEntityServer, contextUser: UserInfo, provider: DatabaseProviderBase, children?: StoredQueryChildren): Promise<QueryMutationResultType> {
        return {
            Success: true,
            // Mapped for the caller, so the field-security projection applies: the record was just
            // saved, and a save re-reads the whole row.
            // fls-guard: projected for contextUser by MapFieldNamesToCodeNames
            Query: await this.MapFieldNamesToCodeNames('MJ: Queries', entity.GetAll(), contextUser, provider) as MJQuery_,
            Fields: this.mapFields(children?.Fields ?? entity.QueryFields),
            Parameters: this.mapParameters(children?.Parameters ?? entity.QueryParameters),
            Entities: this.mapEntities(children?.Entities ?? entity.QueryEntities),
            Permissions: this.mapPermissions(children?.Permissions ?? entity.QueryPermissions),
        };
    }

    /**
     * A query's child rows read from the database with every cache bypassed. A collection whose
     * read fails comes back empty, as the cache would have given it.
     */
    private async readStoredChildrenAsync(provider: DatabaseProviderBase, queryID: string, user: UserInfo): Promise<StoredQueryChildren> {
        const filter = `QueryID='${EscapeSQLString(queryID)}'`;
        const view = (entityName: string, orderBy?: string) => ({ EntityName: entityName, ExtraFilter: filter, OrderBy: orderBy, ResultType: 'entity_object' as const, BypassCache: true, IgnoreMaxRows: true });
        const [fields, parameters, entities, permissions] = await provider.RunViews([
            view('MJ: Query Fields', 'Sequence'),
            view('MJ: Query Parameters', 'Name'),
            view('MJ: Query Entities'),
            view('MJ: Query Permissions'),
        ], user);
        const rows = <T>(result: { Success: boolean; Results: T[] } | undefined): T[] => (result?.Success ? result.Results : []);
        return {
            Fields: rows<MJQueryFieldEntity>(fields),
            Parameters: rows<MJQueryParameterEntity>(parameters),
            Entities: rows<MJQueryEntityEntity>(entities),
            Permissions: rows<MJQueryPermissionEntity>(permissions),
        };
    }

    private mapFields(fields: MJQueryFieldEntity[]): MJQueryField_[] {
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
            SourceEntityFieldID: f.SourceEntityFieldID,
            SourceEntityField: f.SourceEntityField,
            SourceObjectName: f.SourceObjectName,
            IsNullable: f.IsNullable,
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

    private mapParameters(params: MJQueryParameterEntity[]): MJQueryParameter_[] {
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
            IsServerSet: p.IsServerSet,
            _mj__CreatedAt: p.__mj_CreatedAt,
            _mj__UpdatedAt: p.__mj_UpdatedAt,
            DetectionMethod: p.DetectionMethod,
            AutoDetectConfidenceScore: p.AutoDetectConfidenceScore,
            Query: p.Query ?? '',
        }) as MJQueryParameter_);
    }

    private mapEntities(entities: MJQueryEntityEntity[]): MJQueryEntity_[] {
        return entities.map(e => ({
            ID: e.ID,
            QueryID: e.QueryID,
            EntityID: e.EntityID,
            Entity: e.Entity,
            AlternateBaseViewID: e.AlternateBaseViewID,
            AlternateBaseView: e.AlternateBaseView,
            _mj__CreatedAt: e.__mj_CreatedAt,
            _mj__UpdatedAt: e.__mj_UpdatedAt,
            DetectionMethod: e.DetectionMethod,
            AutoDetectConfidenceScore: e.AutoDetectConfidenceScore,
            Query: e.Query ?? '',
        }) as MJQueryEntity_);
    }

    private mapPermissions(permissions: MJQueryPermissionEntity[]): MJQueryPermission_[] {
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

    /**
     * Saves one `MJ: Query Permissions` row per input role for the query.
     *
     * @throws Error naming the role and the save's own message when a row is not saved
     */
    protected async createPermissions(p: DatabaseProviderBase, permissions: QueryPermissionInputType[], queryID: string, contextUser: UserInfo): Promise<void> {
        for (const perm of permissions) {
            const permissionEntity = await p.GetEntityObject<MJQueryPermissionEntity>('MJ: Query Permissions', contextUser);
            if (permissionEntity) {
                permissionEntity.QueryID = queryID;
                permissionEntity.RoleID = perm.RoleID;
                if (!await permissionEntity.Save()) {
                    throw new Error(MJQueryResolverExtended.permissionWriteError('save', perm.RoleID, permissionEntity));
                }
            }
        }
    }

    /**
     * Deletes every `MJ: Query Permissions` row of the query.
     *
     * @throws Error naming the role and the delete's own message when a row is not deleted
     */
    protected async deletePermissions(queryID: string): Promise<void> {
        for (const perm of QueryEngine.Instance.GetQueryPermissions(queryID)) {
            if (!await perm.Delete()) {
                throw new Error(MJQueryResolverExtended.permissionWriteError('delete', perm.RoleID, perm));
            }
        }
    }

    /** The message for a permission row that was not saved or deleted, with the entity's own reason. */
    private static permissionWriteError(action: 'save' | 'delete', roleID: string, entity: MJQueryPermissionEntity): string {
        const reason = entity.LatestResult?.CompleteMessage || entity.LatestResult?.Message || `the ${action} reported no reason`;
        return `Failed to ${action} the query permission for role ${roleID}: ${reason}`;
    }

    /**
     * Updates an existing query with the provided attributes. Requires `query:update` scope for API key users;
     * entity-level update permission on MJ: Queries for all users.
     * @param input - UpdateQuerySystemUserInput containing the query ID and fields to update
     * @param context - Application context containing user information
     * @returns UpdateQueryResultType with success status and updated query data including related entities
     */
    @Mutation(() => QueryMutationResultType)
    async UpdateQueryExtended(
        @Arg('input', () => UpdateQuerySystemUserInput) input: UpdateQuerySystemUserInput,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<QueryMutationResultType> {
        try {
            await this.CheckAPIKeyScopeAuthorization('query:update', input.ID, context.userPayload);

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

            // A rename, or a move to another category, must not collide with another query's name
            const targetName = input.Name ?? queryEntity.Name;
            const targetCategoryID = finalCategoryID !== undefined ? finalCategoryID : queryEntity.CategoryID;
            const sameName = await this.findExistingQuery(provider, targetName, targetCategoryID ?? null, context.userPayload.userRecord);
            if (sameName && !UUIDsEqual(sameName.ID, queryEntity.ID)) {
                return {
                    Success: false,
                    ErrorMessage: `Query with name '${targetName}' already exists in the specified ${input.CategoryID ? 'category' : 'categoryPath'}`
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

            // Field-level security: refuse a key the caller may not read
            AssertClientInputWritableForUser(queryEntity.EntityInfo, updateFields, context.userPayload.userRecord);
            // Use SetMany to update all fields at once
            queryEntity.SetMany(updateFields);

            // Pass caller-provided parameter sample values to override LLM guesses
            if (input.ParameterHints && input.ParameterHints.length > 0) {
                queryEntity.ParameterHints = new Map(input.ParameterHints.map(h => [h.Name, h.Value]));
            }

            // Save the updated query
            const saveResult = await queryEntity.Save();
            if (!saveResult) {
                return {
                    Success: false,
                    ErrorMessage: `Failed to update query: ${queryEntity.LatestResult?.CompleteMessage || queryEntity.LatestResult?.Message || 'the save reported no reason'}`
                };
            }

            const queryID = queryEntity.ID;

            // Handle permissions update if provided
            if (input.Permissions !== undefined) {
                // Replace the existing permissions (read from the QueryEngine cache); a failed write stops the update with its reason
                try {
                    await this.deletePermissions(queryID);
                    await this.createPermissions(provider, input.Permissions, queryID, context.userPayload.userRecord);
                } catch (e) {
                    return { Success: false, ErrorMessage: `Failed to update query permissions: ${e instanceof Error ? e.message : String(e)}` };
                }
            }

            return await this.buildSuccessResult(queryEntity, context.userPayload.userRecord, provider);

        } catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `MJQueryResolverExtended::UpdateQuerySystemUser --- Error updating query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /**
     * Deletes a query by ID. Requires `query:delete` scope for API key users;
     * entity-level delete permission on MJ: Queries is enforced by the entity framework.
     * @param ID - The ID of the query to delete
     * @param options - Delete options controlling action execution
     * @param context - Application context containing user information
     * @returns DeleteQueryResultType with success status and deleted query data
     */
    @Mutation(() => DeleteQueryResultType)
    async DeleteQueryExtended(
        @Arg('ID', () => String) ID: string,
        @Arg('options', () => DeleteOptionsInput, { nullable: true }) options: DeleteOptionsInput | null,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<DeleteQueryResultType> {
        try {
            await this.CheckAPIKeyScopeAuthorization('query:delete', ID, context.userPayload);
            // Validate ID is not null/undefined/empty
            if (!ID || ID.trim() === '') {
                return {
                    Success: false,
                    ErrorMessage: 'MJQueryResolverExtended::DeleteQuerySystemResolver --- Invalid query ID: ID cannot be null or empty'
                };
            }

            const provider = GetReadWriteProvider(context.providers);    
            const key = CompositeKey.FromID(ID); // first-pk-ok: deletes from MJ: Queries (core entity keyed by ID) — see DeleteRecord below
            
            // Provide default options if none provided
            const deleteOptions = options || {
                SkipEntityAIActions: false,
                SkipEntityActions: false,
                ReplayOnly: false,
                IsParentEntityDelete: false,
                SkipRecordChanges: false
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
            const categoryFilter = categoryID ? `CategoryID='${EscapeSQLString(categoryID)}'` : 'CategoryID IS NULL';
            const nameFilter = `LOWER(Name) = LOWER('${EscapeSQLString(queryName)}')`;

            const result = await provider.RunView<QueryViewRow>({
                EntityName: 'MJ: Queries',
                ExtraFilter: `${nameFilter} AND ${categoryFilter}`,
                BypassCache: true
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
     * Finds a unique query name by appending sequential numeric suffixes.
     * Format: "Name (1)", "Name (2)", etc.
     * Uses direct DB queries (not cache) for authoritative uniqueness checks.
     * @param provider - Database provider for direct DB queries
     * @param baseName - The original desired name that is already taken
     * @param categoryID - Category ID to check uniqueness within
     * @param contextUser - User context for database operations
     * @returns A unique name in the format "baseName (N)"
     */
    private async findUniqueName(
        provider: DatabaseProviderBase,
        baseName: string,
        categoryID: string | null,
        contextUser: UserInfo
    ): Promise<string> {
        const MAX_ATTEMPTS = 50;
        for (let i = 1; i <= MAX_ATTEMPTS; i++) {
            const candidateName = `${baseName} (${i})`;
            const existing = await this.findExistingQuery(provider, candidateName, categoryID, contextUser);
            if (!existing) {
                return candidateName;
            }
        }
        throw new Error(`Unable to find unique name for "${baseName}" after ${MAX_ATTEMPTS} attempts`);
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
            const parentFilter = parentID ? `ParentID='${EscapeSQLString(parentID)}'` : 'ParentID IS NULL';
            const nameFilter = `LOWER(Name) = LOWER('${EscapeSQLString(categoryName)}')`;

            // Uncached: after losing a race to create the category, the re-check must see the row the
            // other request just wrote.
            const result = await provider.RunView<MJQueryCategoryEntity>({
                EntityName: 'MJ: Query Categories',
                ExtraFilter: `${nameFilter} AND ${parentFilter}`,
                ResultType: 'entity_object',
                BypassCache: true
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