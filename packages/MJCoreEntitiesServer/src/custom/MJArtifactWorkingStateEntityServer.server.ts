import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityDeleteOptions,
    EntityPermissionType,
    EntitySaveOptions,
    GetDataHooks,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    Metadata,
    PostRunViewHook,
    PreRunViewHook,
    RegisterDataHook,
    DatabaseProviderBase,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    MJArtifactWorkingStateEntity,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    BytesToBase64,
    GetGlobalObjectStore,
    IsByteArray,
    NormalizeUUID,
    RegisterClass,
    UUIDsEqual
} from '@memberjunction/global';
import { randomUUID } from 'crypto';
import {
    EmptyPostRunViewResult,
    FinalizePostRunViewResult,
    GetGlobalWeakSet,
    PrepareScopedPreRunView,
    ShouldBypassPostRunViewAsync,
    StripSyntheticFieldsFromRow
} from './ArtifactSecurityHookHelpers';

const WORKING_STATE_ENTITY_NAME = 'MJ: Artifact Working States';
const GLOBAL_KEY_INTERNAL_WS_PARAMS = '__MJ_INTERNAL_WORKING_STATE_PARAMS__';
const GLOBAL_KEY_ORIGINAL_WS_FIELDS = '__MJ_ORIGINAL_WORKING_STATE_FIELDS_BY_PARAMS__';
const GLOBAL_KEY_SQL_SCOPED_WS_PARAMS = '__MJ_SQL_SCOPED_WORKING_STATE_PARAMS__';

function getOriginalWorkingStateFieldsMap(): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_ORIGINAL_WS_FIELDS];
        if (existing instanceof WeakMap) {
            return existing;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[GLOBAL_KEY_ORIGINAL_WS_FIELDS] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

type WorkingStateRowValue = string | number | boolean | Date | Uint8Array | Buffer | null | undefined;

interface WorkingStateRawRow {
    ID?: string | null;
    id?: string | null;
    ArtifactID?: string | null;
    YjsState?: string | Uint8Array | Buffer | null;
    LastModifiedByUserID?: string | null;
    [key: string]: WorkingStateRowValue;
}

type WorkingStateViewRow = BaseEntity | WorkingStateRawRow;
type SqlBindingValue = string | number | boolean | Date | Buffer | Uint8Array;

function isServerSystemUser(user: UserInfo | undefined | null): boolean {
    if (!user) {
        return false;
    }
    const systemUserId = UserCache.Instance.GetSystemUser()?.ID;
    return Boolean(
        (systemUserId && UUIDsEqual(user.ID, systemUserId)) ||
            WellKnownUserSource.Instance.IsSystemUser(user)
    );
}

function isMetadataProvider(
    provider: IEntityDataProvider | IMetadataProvider | null | undefined
): provider is IMetadataProvider {
    return Boolean(provider && ('Entities' in provider || 'ProviderType' in provider));
}

function resolveTargetEntityName(params: RunViewParams): string {
    if (typeof params.EntityName === 'string' && params.EntityName.trim().length > 0) {
        return params.EntityName.trim();
    }
    const viewEntity = params.ViewEntity as MJUserViewEntity | undefined;
    const viewEntityName = viewEntity?.Entity;
    if (typeof viewEntityName === 'string' && viewEntityName.trim().length > 0) {
        return viewEntityName.trim();
    }
    return '';
}

function resolveMetadataProvider(
    entityProvider: IEntityDataProvider | IMetadataProvider | null | undefined,
    contextUser: UserInfo | undefined | null
): IMetadataProvider | null {
    if (isMetadataProvider(entityProvider)) {
        return entityProvider;
    }
    return (
        contextUser?.OwningProvider ??
        Metadata.Provider ?? // global-provider-ok: fallback when UserInfo was constructed without an OwningProvider
        null
    );
}

function resolveProviderForUser(contextUser: UserInfo): IMetadataProvider | null {
    return resolveMetadataProvider(undefined, contextUser);
}

function readWorkingStateArtifactId(row: WorkingStateViewRow | null | undefined): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactWorkingStateEntity) {
        return row.ArtifactID || null;
    }
    const candidate = (row as WorkingStateRawRow).ArtifactID;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function stripSyntheticWorkingStateArtifactId(row: WorkingStateViewRow): WorkingStateViewRow {
    if (!row || typeof row !== 'object' || row instanceof BaseEntity) {
        return row;
    }
    if (!Object.prototype.hasOwnProperty.call(row, 'ArtifactID')) {
        return row;
    }
    const copy: WorkingStateRawRow = { ...(row as WorkingStateRawRow) };
    delete copy.ArtifactID;
    return copy;
}

export const ArtifactWorkingStatePreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewParams> => {
    return PrepareScopedPreRunView(
        params,
        {
            TargetEntityName: WORKING_STATE_ENTITY_NAME,
            RequiredFields: ['ArtifactID'],
            IdColumnName: 'ArtifactID',
            InternalParams: GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_WS_PARAMS),
            OriginalFieldsMap: getOriginalWorkingStateFieldsMap(),
            SqlScopedParams: GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_WS_PARAMS),
            ResolveReadableIds: (prov, user) =>
                ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(prov, user)
        },
        contextUser,
        hookProvider
    );
};

/**
 * Server-side `PostRunView` data hook enforcing `ArtifactPermissionEngine` read authorization
 * on `MJ: Artifact Working States` (`B1`).
 *
 * `MJ: Artifact Working States` has `AllowAllRowsAPI = 0`, `AllowCreateAPI = 0`, `AllowUpdateAPI = 0`,
 * `AllowDeleteAPI = 0` and zero CRUD resolvers on the GraphQL schema. This hook adds defense-in-depth
 * for in-process callers so no non-system `RunView` can return `YjsState` rows for artifacts the
 * caller is not authorized to read via `ArtifactPermissionEngine`.
 */
export const ArtifactWorkingStatePostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewResult> => {
    if (!results?.Success) {
        return results;
    }

    const provider = resolveMetadataProvider(hookProvider, contextUser);
    const sqlScopedSet = GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_WS_PARAMS);
    const { bypass, originalFields } = await ShouldBypassPostRunViewAsync(
        params,
        WORKING_STATE_ENTITY_NAME,
        GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_WS_PARAMS),
        getOriginalWorkingStateFieldsMap(),
        contextUser,
        provider
    );
    if (bypass) {
        sqlScopedSet.delete(params);
        if (originalFields && Array.isArray(results.Results)) {
            return {
                ...results,
                Results: (results.Results as WorkingStateViewRow[]).map((r) => StripSyntheticFieldsFromRow(r, originalFields))
            };
        }
        return results;
    }

    if (!contextUser || !provider || provider.ProviderType !== 'Database') {
        sqlScopedSet.delete(params);
        if (provider !== null && provider.ProviderType !== 'Database') {
            if (originalFields && Array.isArray(results.Results)) {
                return {
                    ...results,
                    Results: (results.Results as WorkingStateViewRow[]).map((r) => StripSyntheticFieldsFromRow(r, originalFields))
                };
            }
            return results;
        }
        return EmptyPostRunViewResult(results);
    }

    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        return FinalizePostRunViewResult(params, results, [], 0, sqlScopedSet);
    }

    const rawRows = results.Results as WorkingStateViewRow[];
    const readAllowedByArtifact = new Map<string, boolean>();
    const keptRows: WorkingStateViewRow[] = [];

    for (const row of rawRows) {
        const artifactId = readWorkingStateArtifactId(row);
        if (!artifactId) {
            continue;
        }
        const normId = NormalizeUUID(artifactId);
        let allowed = readAllowedByArtifact.get(normId);
        if (allowed === undefined) {
            try {
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    artifactId,
                    contextUser
                );
                allowed = perms.CanRead;
            } catch (error) {
                LogError(
                    `ArtifactWorkingStatePostRunViewHook failed resolving CanRead for artifact ${artifactId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                allowed = false;
            }
            readAllowedByArtifact.set(normId, allowed);
        }
        if (allowed) {
            keptRows.push(StripSyntheticFieldsFromRow(row, originalFields));
        }
    }

    return FinalizePostRunViewResult(params, results, keptRows, rawRows.length, sqlScopedSet);
};

/**
 * Ensures {@link ArtifactWorkingStatePreRunViewHook} and {@link ArtifactWorkingStatePostRunViewHook}
 * are registered once in the global data hooks store.
 */
export function EnsureArtifactWorkingStateReadHookRegistered(): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(ArtifactWorkingStatePreRunViewHook)) {
        RegisterDataHook('PreRunView', ArtifactWorkingStatePreRunViewHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(ArtifactWorkingStatePostRunViewHook)) {
        RegisterDataHook('PostRunView', ArtifactWorkingStatePostRunViewHook);
    }
}

EnsureArtifactWorkingStateReadHookRegistered();

/**
 * Server-side entity subclass for `MJ: Artifact Working States` (`B1` / Blocker 5).
 *
 * Enforces:
 * 1. **System-user-only writes/deletes**: `Save()` and `Delete()` reject any non-system-user caller
 *    so `MJ: Artifact Working States` checkpoints can only be written or deleted by
 *    `ArtifactCollaborationServer` under the server system user, while permitting the server system
 *    user to save/delete in-process even with `IncludeInAPI = 0` / `AllowCreateAPI = 0` /
 *    `AllowUpdateAPI = 0` / `AllowDeleteAPI = 0`.
 * 2. **Artifact-permission-gated `InnerLoad()` / `Load()`**: Non-system-user callers attempting to
 *    load a working state row must hold `CanRead === true` on its parent `ArtifactID` via
 *    `ArtifactPermissionEngine`.
 */
@RegisterClass(BaseEntity, 'MJ: Artifact Working States')
export class MJArtifactWorkingStateEntityServer extends MJArtifactWorkingStateEntity {
    public override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (isServerSystemUser(this.ContextCurrentUser)) {
            return true;
        }
        if (
            type === EntityPermissionType.Create ||
            type === EntityPermissionType.Update ||
            type === EntityPermissionType.Delete
        ) {
            if (throwError) {
                throw new Error(
                    `MJ: Artifact Working States is server-managed (${type} API disabled for non-system users).`
                );
            }
            return false;
        }
        return super.CheckPermissions(type, throwError);
    }

    public override async InnerLoad(
        compositeKey: CompositeKey,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const loaded = await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }
        return this.enforceArtifactReadPermission();
    }

    public override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const loaded = await super.Load(ID, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }
        return this.enforceArtifactReadPermission();
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            const res = new BaseEntityResult();
            res.Success = false;
            res.Type = this.IsSaved ? 'update' : 'create';
            res.StartedAt = new Date();
            res.EndedAt = new Date();
            res.Message =
                'MJ: Artifact Working States is server-managed and can only be written by ArtifactCollaborationServer under the system user.';
            this.ResultHistory.push(res);
            return false;
        }
        if (this.ProviderToUse instanceof DatabaseProviderBase) {
            return this.saveDirectlyViaDatabaseProvider(this.ProviderToUse, actor);
        }
        return BaseEntity.prototype.Save.call(this, options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            const res = new BaseEntityResult();
            res.Success = false;
            res.Type = 'delete';
            res.StartedAt = new Date();
            res.EndedAt = new Date();
            res.Message =
                'MJ: Artifact Working States is server-managed and can only be deleted by ArtifactCollaborationServer under the system user.';
            this.ResultHistory.push(res);
            return false;
        }
        if (this.ProviderToUse instanceof DatabaseProviderBase) {
            return this.deleteDirectlyViaDatabaseProvider(this.ProviderToUse, actor);
        }
        return BaseEntity.prototype.Delete.call(this, options);
    }

    private async saveDirectlyViaDatabaseProvider(
        dbProvider: DatabaseProviderBase,
        actor: UserInfo | undefined
    ): Promise<boolean> {
        const res = new BaseEntityResult();
        res.Type = this.IsSaved ? 'update' : 'create';
        res.StartedAt = new Date();
        try {
            if (!this.ArtifactID || this.ArtifactID.trim().length === 0) {
                throw new Error('ArtifactID is required to save MJ: Artifact Working States.');
            }
            const schema = dbProvider.ConfigData.MJCoreSchemaName || '__mj';
            const entityInfo = this.EntityInfo;
            const baseTableName = entityInfo?.BaseTable || 'ArtifactWorkingState';
            const baseViewName = entityInfo?.BaseView || 'vwArtifactWorkingStates';
            const table = dbProvider.QuoteSchemaAndView(schema, baseTableName);
            const view = dbProvider.QuoteSchemaAndView(schema, baseViewName);
            const colId = dbProvider.QuoteIdentifier('ID');
            const colArtifactId = dbProvider.QuoteIdentifier('ArtifactID');
            const colYjsState = dbProvider.QuoteIdentifier('YjsState');
            const colLastModUserId = dbProvider.QuoteIdentifier('LastModifiedByUserID');
            const colUpdatedAt = dbProvider.QuoteIdentifier('__mj_UpdatedAt');

            const yjsBytes = this.YjsState ? Buffer.from(this.YjsState, 'base64') : null;
            const lastModUserId =
                this.LastModifiedByUserID && this.LastModifiedByUserID.trim().length > 0
                    ? this.LastModifiedByUserID
                    : null;

            const extractRowId = (row: WorkingStateRawRow | undefined): string => {
                if (typeof row?.ID === 'string' && row.ID.trim().length > 0) {
                    return row.ID.trim();
                }
                if (typeof row?.id === 'string' && row.id.trim().length > 0) {
                    return row.id.trim();
                }
                return '';
            };

            // Always read from BaseView (`vwArtifactWorkingStates`) because SQL Server `cdp_Integration`
            // holds SELECT on views and EXECUTE on generated sprocs, never raw base-table permissions.
            const probeSql = `SELECT ${colId} FROM ${view} WHERE ${colArtifactId} = ${dbProvider.BuildParameterPlaceholder(0)}`;
            const existingRows = await dbProvider.ExecuteSQL<WorkingStateRawRow>(
                probeSql,
                [this.ArtifactID],
                { isMutation: false },
                actor
            );

            let sprocReturnedRows: WorkingStateRawRow[] | undefined;

            if (dbProvider.PlatformKey === 'sqlserver') {
                const spCreateRef = dbProvider.QuoteSchemaAndView(
                    schema,
                    entityInfo?.spCreate || 'spCreateArtifactWorkingState'
                );
                const spUpdateRef = dbProvider.QuoteSchemaAndView(
                    schema,
                    entityInfo?.spUpdate || 'spUpdateArtifactWorkingState'
                );

                const executeSqlServerUpdate = async (
                    targetId: string
                ): Promise<WorkingStateRawRow[]> => {
                    const updateParams: SqlBindingValue[] = [targetId, this.ArtifactID];
                    const argClauses: string[] = [
                        `@ID = ${dbProvider.BuildParameterPlaceholder(0)}`,
                        `@ArtifactID = ${dbProvider.BuildParameterPlaceholder(1)}`
                    ];

                    // Never pass JS `null` in positional parameter arrays on SQL Server because Tedious
                    // binds untyped `null` as NVarChar, which fails conversion to varbinary(max).
                    if (yjsBytes === null) {
                        argClauses.push('@YjsState_Clear = 1');
                    } else {
                        argClauses.push(
                            '@YjsState_Clear = 0',
                            `@YjsState = ${dbProvider.BuildParameterPlaceholder(updateParams.length)}`
                        );
                        updateParams.push(yjsBytes);
                    }

                    if (lastModUserId === null) {
                        argClauses.push('@LastModifiedByUserID_Clear = 1');
                    } else {
                        argClauses.push(
                            '@LastModifiedByUserID_Clear = 0',
                            `@LastModifiedByUserID = ${dbProvider.BuildParameterPlaceholder(updateParams.length)}`
                        );
                        updateParams.push(lastModUserId);
                    }

                    const updateSql = `EXEC ${spUpdateRef} ${argClauses.join(', ')}`;
                    return dbProvider.ExecuteSQL<WorkingStateRawRow>(
                        updateSql,
                        updateParams,
                        { isMutation: true },
                        actor
                    );
                };

                const executeSqlServerCreate = async (
                    recordId: string
                ): Promise<WorkingStateRawRow[]> => {
                    const createParams: SqlBindingValue[] = [recordId, this.ArtifactID];
                    const argClauses: string[] = [
                        `@ID = ${dbProvider.BuildParameterPlaceholder(0)}`,
                        `@ArtifactID = ${dbProvider.BuildParameterPlaceholder(1)}`
                    ];

                    if (yjsBytes !== null) {
                        argClauses.push(
                            `@YjsState = ${dbProvider.BuildParameterPlaceholder(createParams.length)}`
                        );
                        createParams.push(yjsBytes);
                    }

                    if (lastModUserId !== null) {
                        argClauses.push(
                            `@LastModifiedByUserID = ${dbProvider.BuildParameterPlaceholder(createParams.length)}`
                        );
                        createParams.push(lastModUserId);
                    }

                    const createSql = `EXEC ${spCreateRef} ${argClauses.join(', ')}`;
                    return dbProvider.ExecuteSQL<WorkingStateRawRow>(
                        createSql,
                        createParams,
                        { isMutation: true },
                        actor
                    );
                };

                const existingId = extractRowId(existingRows?.[0]);
                if (existingId) {
                    sprocReturnedRows = await executeSqlServerUpdate(existingId);
                } else {
                    const recordId =
                        this.ID && this.ID.trim().length > 0 ? this.ID : randomUUID();
                    try {
                        sprocReturnedRows = await executeSqlServerCreate(recordId);
                    } catch (insertErr) {
                        const msg =
                            insertErr instanceof Error ? insertErr.message : String(insertErr);
                        if (
                            /unique|duplicate|2627|2601|23505|UQ_ArtifactWorkingState_ArtifactID/i.test(
                                msg
                            )
                        ) {
                            const racedRows = await dbProvider.ExecuteSQL<WorkingStateRawRow>(
                                probeSql,
                                [this.ArtifactID],
                                { isMutation: false },
                                actor
                            );
                            const racedId =
                                extractRowId(racedRows?.[0]) ||
                                (this.ID && this.ID.trim().length > 0 ? this.ID.trim() : '');
                            if (!racedId) {
                                throw insertErr;
                            }
                            sprocReturnedRows = await executeSqlServerUpdate(racedId);
                        } else {
                            throw insertErr;
                        }
                    }
                }
            } else {
                const executePgUpdate = async (): Promise<void> => {
                    const updateParams: SqlBindingValue[] = [];
                    const setClauses: string[] = [];

                    if (yjsBytes !== null) {
                        setClauses.push(
                            `${colYjsState} = ${dbProvider.BuildParameterPlaceholder(updateParams.length)}`
                        );
                        updateParams.push(yjsBytes);
                    } else {
                        setClauses.push(`${colYjsState} = NULL`);
                    }

                    if (lastModUserId !== null) {
                        setClauses.push(
                            `${colLastModUserId} = ${dbProvider.BuildParameterPlaceholder(updateParams.length)}`
                        );
                        updateParams.push(lastModUserId);
                    } else {
                        setClauses.push(`${colLastModUserId} = NULL`);
                    }

                    setClauses.push(
                        `${colUpdatedAt} = ${dbProvider.BuildParameterPlaceholder(updateParams.length)}`
                    );
                    updateParams.push(new Date());

                    const wherePlaceholder = dbProvider.BuildParameterPlaceholder(updateParams.length);
                    updateParams.push(this.ArtifactID);

                    const updateSql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${colArtifactId} = ${wherePlaceholder}`;
                    await dbProvider.ExecuteSQL(updateSql, updateParams, { isMutation: true }, actor);
                };

                if (existingRows && existingRows.length > 0) {
                    await executePgUpdate();
                } else {
                    const recordId =
                        this.ID && this.ID.trim().length > 0 ? this.ID : randomUUID();
                    const insertParams: SqlBindingValue[] = [recordId, this.ArtifactID];
                    const valExprs: string[] = [
                        dbProvider.BuildParameterPlaceholder(0),
                        dbProvider.BuildParameterPlaceholder(1)
                    ];

                    if (yjsBytes !== null) {
                        valExprs.push(dbProvider.BuildParameterPlaceholder(insertParams.length));
                        insertParams.push(yjsBytes);
                    } else {
                        valExprs.push('NULL');
                    }

                    if (lastModUserId !== null) {
                        valExprs.push(dbProvider.BuildParameterPlaceholder(insertParams.length));
                        insertParams.push(lastModUserId);
                    } else {
                        valExprs.push('NULL');
                    }

                    const insertSql = `INSERT INTO ${table} (${colId}, ${colArtifactId}, ${colYjsState}, ${colLastModUserId}) VALUES (${valExprs.join(', ')})`;
                    try {
                        await dbProvider.ExecuteSQL(
                            insertSql,
                            insertParams,
                            { isMutation: true },
                            actor
                        );
                    } catch (insertErr) {
                        const msg =
                            insertErr instanceof Error ? insertErr.message : String(insertErr);
                        if (/unique|duplicate|2627|2601|23505|UQ_ArtifactWorkingState_ArtifactID/i.test(msg)) {
                            await executePgUpdate();
                        } else {
                            throw insertErr;
                        }
                    }
                }
            }

            let hydratedRow: WorkingStateRawRow | undefined = sprocReturnedRows?.[0];
            if (!hydratedRow) {
                const selectSql = `SELECT * FROM ${view} WHERE ${colArtifactId} = ${dbProvider.BuildParameterPlaceholder(0)}`;
                const rows = await dbProvider.ExecuteSQL<WorkingStateRawRow>(
                    selectSql,
                    [this.ArtifactID],
                    { isMutation: false },
                    actor
                );
                hydratedRow = rows?.[0];
            }
            if (hydratedRow) {
                const normalizedRow: WorkingStateRawRow = {};
                for (const [key, value] of Object.entries(hydratedRow)) {
                    normalizedRow[key] = IsByteArray(value) ? BytesToBase64(value) : value;
                }
                await this.LoadFromData(normalizedRow);
            }
            res.Success = true;
            res.EndedAt = new Date();
            this.ResultHistory.push(res);
            return true;
        } catch (err) {
            res.Success = false;
            res.EndedAt = new Date();
            res.Message = err instanceof Error ? err.message : String(err);
            this.ResultHistory.push(res);
            return false;
        }
    }

    private async deleteDirectlyViaDatabaseProvider(
        dbProvider: DatabaseProviderBase,
        actor: UserInfo | undefined
    ): Promise<boolean> {
        const res = new BaseEntityResult();
        res.Type = 'delete';
        res.StartedAt = new Date();
        try {
            const schema = dbProvider.ConfigData.MJCoreSchemaName || '__mj';
            const entityInfo = this.EntityInfo;
            const baseTableName = entityInfo?.BaseTable || 'ArtifactWorkingState';
            const baseViewName = entityInfo?.BaseView || 'vwArtifactWorkingStates';
            const table = dbProvider.QuoteSchemaAndView(schema, baseTableName);
            const view = dbProvider.QuoteSchemaAndView(schema, baseViewName);
            const colId = dbProvider.QuoteIdentifier('ID');
            const colArtifactId = dbProvider.QuoteIdentifier('ArtifactID');

            if (dbProvider.PlatformKey === 'sqlserver') {
                const spDeleteRef = dbProvider.QuoteSchemaAndView(
                    schema,
                    entityInfo?.spDelete || 'spDeleteArtifactWorkingState'
                );
                let targetId = this.ID && this.ID.trim().length > 0 ? this.ID.trim() : '';
                if (!targetId && this.ArtifactID && this.ArtifactID.trim().length > 0) {
                    const probeSql = `SELECT ${colId} FROM ${view} WHERE ${colArtifactId} = ${dbProvider.BuildParameterPlaceholder(0)}`;
                    const probeRows = await dbProvider.ExecuteSQL<WorkingStateRawRow>(
                        probeSql,
                        [this.ArtifactID],
                        { isMutation: false },
                        actor
                    );
                    const rawId = probeRows?.[0]?.ID ?? probeRows?.[0]?.id;
                    targetId = typeof rawId === 'string' ? rawId.trim() : '';
                    if (!targetId) {
                        this.NewRecord();
                        res.Success = true;
                        res.EndedAt = new Date();
                        this.ResultHistory.push(res);
                        return true;
                    }
                }
                if (!targetId) {
                    throw new Error('ID or ArtifactID is required to delete MJ: Artifact Working States.');
                }
                const deleteSql = `EXEC ${spDeleteRef} @ID = ${dbProvider.BuildParameterPlaceholder(0)}`;
                await dbProvider.ExecuteSQL(deleteSql, [targetId], { isMutation: true }, actor);
            } else {
                const predicates: string[] = [];
                const params: SqlBindingValue[] = [];

                if (this.ID && this.ID.trim().length > 0) {
                    predicates.push(
                        `${colId} = ${dbProvider.BuildParameterPlaceholder(params.length)}`
                    );
                    params.push(this.ID.trim());
                }
                if (this.ArtifactID && this.ArtifactID.trim().length > 0) {
                    predicates.push(
                        `${colArtifactId} = ${dbProvider.BuildParameterPlaceholder(params.length)}`
                    );
                    params.push(this.ArtifactID.trim());
                }
                if (predicates.length === 0) {
                    throw new Error('ID or ArtifactID is required to delete MJ: Artifact Working States.');
                }

                const sql = `DELETE FROM ${table} WHERE ${predicates.join(' AND ')}`;
                await dbProvider.ExecuteSQL(sql, params, { isMutation: true }, actor);
            }

            this.NewRecord();
            res.Success = true;
            res.EndedAt = new Date();
            this.ResultHistory.push(res);
            return true;
        } catch (err) {
            res.Success = false;
            res.EndedAt = new Date();
            res.Message = err instanceof Error ? err.message : String(err);
            this.ResultHistory.push(res);
            return false;
        }
    }

    private async enforceArtifactReadPermission(): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (isServerSystemUser(actor)) {
            return true;
        }
        const provider = isMetadataProvider(this.ProviderToUse)
            ? this.ProviderToUse
            : actor
              ? resolveProviderForUser(actor)
              : null;
        if (!actor || !provider || !this.ArtifactID) {
            this.NewRecord();
            return false;
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            this.ArtifactID,
            actor
        );
        if (!perms.CanRead) {
            this.NewRecord();
            return false;
        }
        return true;
    }
}
