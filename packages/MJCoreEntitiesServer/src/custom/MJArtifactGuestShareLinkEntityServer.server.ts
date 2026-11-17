import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    DatabaseProviderBase,
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
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    MJArtifactGuestShareLinkEntity,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GetGlobalObjectStore, IsValidUUID, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { randomUUID } from 'crypto';
import {
    BuildSqlArtifactReadablePredicateAsync,
    EmptyPostRunViewResult,
    FinalizePostRunViewResult,
    GetGlobalWeakSet,
    PrepareScopedPreRunView,
    QualifyOuterEntityColumnAsync,
    ShouldBypassForNonDatabaseClientProvider,
    ShouldBypassPostRunViewAsync
} from './ArtifactSecurityHookHelpers';

const GUEST_LINK_ENTITY_NAME = 'MJ: Artifact Guest Share Links';
const GLOBAL_KEY_INTERNAL_GUEST_LINK_PARAMS = '__MJ_INTERNAL_GUEST_SHARE_LINK_PARAMS__';
const GLOBAL_KEY_ORIGINAL_GUEST_LINK_FIELDS = '__MJ_ORIGINAL_GUEST_SHARE_LINK_FIELDS_BY_PARAMS__';
const GLOBAL_KEY_SQL_SCOPED_GUEST_LINK_PARAMS = '__MJ_SQL_SCOPED_GUEST_SHARE_LINK_PARAMS__';

function getOriginalGuestLinkFieldsMap(): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_ORIGINAL_GUEST_LINK_FIELDS];
        if (existing instanceof WeakMap) {
            return existing;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[GLOBAL_KEY_ORIGINAL_GUEST_LINK_FIELDS] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

type GuestLinkRowValue = string | number | boolean | Date | null | undefined;

interface GuestLinkRawRow {
    ID?: string | null;
    id?: string | null;
    MagicLinkInviteID?: string | null;
    ArtifactID?: string | null;
    ArtifactVersionID?: string | null;
    CreatedByUserID?: string | null;
    Label?: string | null;
    [key: string]: GuestLinkRowValue;
}

type GuestLinkViewRow = BaseEntity | GuestLinkRawRow;

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
    return Boolean(provider && ('Entities' in provider || 'EntityByID' in provider || 'ProviderType' in provider));
}

function resolveMetadataProvider(
    entityProvider: IEntityDataProvider | IMetadataProvider | null | undefined,
    actor: UserInfo | undefined | null
): IMetadataProvider | null {
    if (isMetadataProvider(entityProvider)) {
        return entityProvider;
    }
    return (
        actor?.OwningProvider ??
        Metadata.Provider ?? // global-provider-ok: fallback when provider is not attached to entity
        null
    );
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

function hasFieldIgnoreCase(fields: readonly string[], targetField: string): boolean {
    const lower = targetField.toLowerCase();
    return fields.some((f) => typeof f === 'string' && f.trim().toLowerCase() === lower);
}

function readGuestLinkArtifactId(row: GuestLinkViewRow | null | undefined): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactGuestShareLinkEntity) {
        return row.ArtifactID ? row.ArtifactID.trim() : null;
    }
    const candidate = (row as GuestLinkRawRow).ArtifactID;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function sanitizeGuestLinkRow(
    row: GuestLinkViewRow,
    originalFields: string[] | undefined
): GuestLinkViewRow {
    if (!row || typeof row !== 'object') {
        return row;
    }
    if (row instanceof BaseEntity) {
        return row;
    }
    const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    if (originalFields && !hasFieldIgnoreCase(originalFields, 'ArtifactID')) {
        delete copy['ArtifactID'];
    }
    return copy as GuestLinkViewRow;
}

function normalizeOptionalString(val: string | null | undefined): string | null {
    if (val === null || val === undefined) {
        return null;
    }
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Server-side `PreRunView` hook ensuring `ArtifactID` is selected when a non-system caller
 * queries `MJ: Artifact Guest Share Links` with a partial `Fields` list.
 */
export const ArtifactGuestShareLinkPreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewParams> => {
    return PrepareScopedPreRunView(
        params,
        {
            TargetEntityName: GUEST_LINK_ENTITY_NAME,
            RequiredFields: ['ArtifactID'],
            IdColumnName: 'ArtifactID',
            InternalParams: GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_GUEST_LINK_PARAMS),
            OriginalFieldsMap: getOriginalGuestLinkFieldsMap(),
            SqlScopedParams: GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_GUEST_LINK_PARAMS),
            BuildSqlPredicateAsync: async (prov, user, entityInfo, runViewParams, collectionCache) =>
                BuildSqlArtifactReadablePredicateAsync(
                    await QualifyOuterEntityColumnAsync(
                        entityInfo,
                        'vwArtifactGuestShareLinks',
                        'ArtifactID',
                        prov,
                        runViewParams,
                        user
                    ),
                    prov,
                    user,
                    { requireShareOrDelete: true, precomputedCollectionCache: collectionCache }
                )
        },
        contextUser,
        hookProvider
    );
};

/**
 * Server-side `PostRunView` hook gating `MJ: Artifact Guest Share Links` reads to `SystemUser`
 * or callers holding `CanShare` or `CanDelete` on the target artifact, while redacting `TokenHash`.
 */
export const ArtifactGuestShareLinkPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewResult> => {
    if (!results?.Success) {
        return results;
    }

    const provider = resolveMetadataProvider(hookProvider, contextUser);
    const sqlScopedSet = GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_GUEST_LINK_PARAMS);
    const { bypass, originalFields } = await ShouldBypassPostRunViewAsync(
        params,
        GUEST_LINK_ENTITY_NAME,
        GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_GUEST_LINK_PARAMS),
        getOriginalGuestLinkFieldsMap(),
        contextUser,
        provider
    );
    if (bypass) {
        sqlScopedSet.delete(params);
        return results;
    }
    if (ShouldBypassForNonDatabaseClientProvider(provider, contextUser)) {
        sqlScopedSet.delete(params);
        return results;
    }
    if (!contextUser || !provider) {
        sqlScopedSet.delete(params);
        return EmptyPostRunViewResult(results);
    }

    if (params.ResultType === 'count_only') {
        if (sqlScopedSet.has(params)) {
            sqlScopedSet.delete(params);
            return results;
        }
        return EmptyPostRunViewResult(results);
    }

    const rows = (results.Results ?? []) as GuestLinkViewRow[];
    if (rows.length === 0) {
        return FinalizePostRunViewResult(params, results, [], 0, sqlScopedSet);
    }

    const permCache = new Map<string, boolean>();
    const filtered: GuestLinkViewRow[] = [];

    for (const row of rows) {
        const artifactId = readGuestLinkArtifactId(row);
        if (!artifactId) {
            continue;
        }
        const normKey = NormalizeUUID(artifactId);
        let allowed = permCache.get(normKey);
        if (allowed === undefined) {
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
                contextUser
            );
            allowed = perms.CanShare || perms.CanDelete;
            permCache.set(normKey, allowed);
        }
        if (allowed) {
            filtered.push(sanitizeGuestLinkRow(row, originalFields));
        }
    }

    return FinalizePostRunViewResult(params, results, filtered, rows.length, sqlScopedSet);
};

export function EnsureArtifactGuestShareLinkReadHookRegistered(): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(ArtifactGuestShareLinkPreRunViewHook)) {
        RegisterDataHook('PreRunView', ArtifactGuestShareLinkPreRunViewHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(ArtifactGuestShareLinkPostRunViewHook)) {
        RegisterDataHook('PostRunView', ArtifactGuestShareLinkPostRunViewHook);
    }
}

EnsureArtifactGuestShareLinkReadHookRegistered();

/**
 * Server-side entity class for `MJ: Artifact Guest Share Links`.
 * Because `AllowCreateAPI=0, AllowUpdateAPI=0, AllowDeleteAPI=0` disables direct client GraphQL mutations,
 * server operations run as `SystemUser` and persist/update/delete rows directly through `DatabaseProviderBase`
 * while non-system direct saves/deletes are rejected unconditionally.
 */
@RegisterClass(BaseEntity, 'MJ: Artifact Guest Share Links')
export class MJArtifactGuestShareLinkEntityServer extends MJArtifactGuestShareLinkEntity {
    public override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (type === EntityPermissionType.Read) {
            return super.CheckPermissions(type, throwError);
        }
        if (isServerSystemUser(this.ContextCurrentUser)) {
            return true;
        }
        if (throwError) {
            throw new Error(
                'Direct mutations to MJ: Artifact Guest Share Links are restricted to server SystemUser operations.'
            );
        }
        return false;
    }

    public override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const loaded = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }
        return this.enforceReadPermission();
    }

    public override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const key = CompositeKey.FromID(ID); // first-pk-ok: 'MJ: Artifact Guest Share Links' has single key ID
        return this.InnerLoad(key, EntityRelationshipsToLoad);
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            return this.failResult(
                this.IsSaved ? 'update' : 'create',
                'Permission denied: direct saves to MJ: Artifact Guest Share Links are restricted to server SystemUser operations.'
            );
        }

        if (!IsValidUUID(this.MagicLinkInviteID) || !IsValidUUID(this.ArtifactID) || !IsValidUUID(this.ArtifactVersionID) || !IsValidUUID(this.CreatedByUserID)) {
            return this.failResult(
                this.IsSaved ? 'update' : 'create',
                'MagicLinkInviteID, ArtifactID, ArtifactVersionID, and CreatedByUserID must be valid UUIDs.'
            );
        }

        const provider = this.ProviderToUse;
        if (provider instanceof DatabaseProviderBase) {
            return this.saveDirectlyViaDatabaseProvider(provider, actor);
        }
        return BaseEntity.prototype.Save.call(this, options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            return this.failResult(
                'delete',
                'Permission denied: direct deletes on MJ: Artifact Guest Share Links are restricted to server SystemUser operations.'
            );
        }

        const provider = this.ProviderToUse;
        if (provider instanceof DatabaseProviderBase) {
            return this.deleteDirectlyViaDatabaseProvider(provider, actor);
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
            const schema = dbProvider.ConfigData.MJCoreSchemaName || '__mj';
            const entityInfo = this.EntityInfo;
            const baseTableName = entityInfo?.BaseTable || 'ArtifactGuestShareLink';
            const baseViewName = entityInfo?.BaseView || 'vwArtifactGuestShareLinks';
            const table = dbProvider.QuoteSchemaAndView(schema, baseTableName);
            const view = dbProvider.QuoteSchemaAndView(schema, baseViewName);
            const colId = dbProvider.QuoteIdentifier('ID');

            const recordId =
                this.ID && IsValidUUID(this.ID) ? this.ID.trim() : randomUUID();
            const label = normalizeOptionalString(this.Label);
            type SqlBindingValue = string | number | boolean | Date;

            let hydratedRow: GuestLinkViewRow | undefined;

            if (dbProvider.PlatformKey === 'sqlserver') {
                if (this.IsSaved) {
                    const spUpdateRef = dbProvider.QuoteSchemaAndView(
                        schema,
                        entityInfo?.spUpdate || 'spUpdateArtifactGuestShareLink'
                    );
                    const params: SqlBindingValue[] = [
                        recordId,
                        this.MagicLinkInviteID.trim(),
                        this.ArtifactID.trim(),
                        this.ArtifactVersionID.trim(),
                        this.CreatedByUserID.trim()
                    ];
                    const args: string[] = [
                        `@ID = ${dbProvider.BuildParameterPlaceholder(0)}`,
                        `@MagicLinkInviteID = ${dbProvider.BuildParameterPlaceholder(1)}`,
                        `@ArtifactID = ${dbProvider.BuildParameterPlaceholder(2)}`,
                        `@ArtifactVersionID = ${dbProvider.BuildParameterPlaceholder(3)}`,
                        `@CreatedByUserID = ${dbProvider.BuildParameterPlaceholder(4)}`
                    ];
                    if (label === null) {
                        args.push('@Label_Clear = 1');
                    } else {
                        args.push(`@Label_Clear = 0`, `@Label = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                        params.push(label);
                    }
                    const sql = `EXEC ${spUpdateRef} ${args.join(', ')}`;
                    const rows = await dbProvider.ExecuteSQL<GuestLinkRawRow>(sql, params, { isMutation: true }, actor);
                    hydratedRow = rows?.[0];
                } else {
                    const spCreateRef = dbProvider.QuoteSchemaAndView(
                        schema,
                        entityInfo?.spCreate || 'spCreateArtifactGuestShareLink'
                    );
                    const params: SqlBindingValue[] = [
                        recordId,
                        this.MagicLinkInviteID.trim(),
                        this.ArtifactID.trim(),
                        this.ArtifactVersionID.trim(),
                        this.CreatedByUserID.trim()
                    ];
                    const args: string[] = [
                        `@ID = ${dbProvider.BuildParameterPlaceholder(0)}`,
                        `@MagicLinkInviteID = ${dbProvider.BuildParameterPlaceholder(1)}`,
                        `@ArtifactID = ${dbProvider.BuildParameterPlaceholder(2)}`,
                        `@ArtifactVersionID = ${dbProvider.BuildParameterPlaceholder(3)}`,
                        `@CreatedByUserID = ${dbProvider.BuildParameterPlaceholder(4)}`
                    ];
                    if (label !== null) {
                        args.push(`@Label = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                        params.push(label);
                    }
                    const sql = `EXEC ${spCreateRef} ${args.join(', ')}`;
                    const rows = await dbProvider.ExecuteSQL<GuestLinkRawRow>(sql, params, { isMutation: true }, actor);
                    hydratedRow = rows?.[0];
                }
            } else {
                const q = (col: string): string => dbProvider.QuoteIdentifier(col);
                if (this.IsSaved) {
                    const params: SqlBindingValue[] = [];
                    const labelExpr =
                        label === null ? 'NULL' : (params.push(label), dbProvider.BuildParameterPlaceholder(0));
                    const updatedAtExpr = dbProvider.BuildParameterPlaceholder(params.length);
                    params.push(new Date());
                    const idExpr = dbProvider.BuildParameterPlaceholder(params.length);
                    params.push(recordId);
                    const updateSql = `UPDATE ${table} SET ${q('Label')} = ${labelExpr}, ${q('__mj_UpdatedAt')} = ${updatedAtExpr} WHERE ${colId} = ${idExpr}`;
                    await dbProvider.ExecuteSQL(updateSql, params, { isMutation: true }, actor);
                } else {
                    const params: SqlBindingValue[] = [
                        recordId,
                        this.MagicLinkInviteID.trim(),
                        this.ArtifactID.trim(),
                        this.ArtifactVersionID.trim(),
                        this.CreatedByUserID.trim()
                    ];
                    const valExprs: string[] = [
                        dbProvider.BuildParameterPlaceholder(0),
                        dbProvider.BuildParameterPlaceholder(1),
                        dbProvider.BuildParameterPlaceholder(2),
                        dbProvider.BuildParameterPlaceholder(3),
                        dbProvider.BuildParameterPlaceholder(4),
                        label === null ? 'NULL' : (params.push(label), dbProvider.BuildParameterPlaceholder(5))
                    ];
                    const insertSql = `INSERT INTO ${table} (${q('ID')}, ${q('MagicLinkInviteID')}, ${q('ArtifactID')}, ${q('ArtifactVersionID')}, ${q('CreatedByUserID')}, ${q('Label')}) VALUES (${valExprs.join(', ')})`;
                    await dbProvider.ExecuteSQL(insertSql, params, { isMutation: true }, actor);
                }
            }

            if (!hydratedRow) {
                const selectSql = `SELECT * FROM ${view} WHERE ${colId} = ${dbProvider.BuildParameterPlaceholder(0)}`;
                const rows = await dbProvider.ExecuteSQL<GuestLinkRawRow>(
                    selectSql,
                    [recordId],
                    { isMutation: false },
                    actor
                );
                hydratedRow = rows?.[0];
            }
            if (hydratedRow) {
                await this.LoadFromData(hydratedRow);
            } else {
                this.ID = recordId;
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
            if (!this.ID || !IsValidUUID(this.ID)) {
                throw new Error('A valid ID is required to delete MJ: Artifact Guest Share Links.');
            }
            const schema = dbProvider.ConfigData.MJCoreSchemaName || '__mj';
            const entityInfo = this.EntityInfo;
            const targetId = this.ID.trim();
            if (dbProvider.PlatformKey === 'sqlserver') {
                const spDeleteRef = dbProvider.QuoteSchemaAndView(
                    schema,
                    entityInfo?.spDelete || 'spDeleteArtifactGuestShareLink'
                );
                const deleteSql = `EXEC ${spDeleteRef} @ID = ${dbProvider.BuildParameterPlaceholder(0)}`;
                await dbProvider.ExecuteSQL(deleteSql, [targetId], { isMutation: true }, actor);
            } else {
                const baseTableName = entityInfo?.BaseTable || 'ArtifactGuestShareLink';
                const table = dbProvider.QuoteSchemaAndView(schema, baseTableName);
                const colId = dbProvider.QuoteIdentifier('ID');
                const deleteSql = `DELETE FROM ${table} WHERE ${colId} = ${dbProvider.BuildParameterPlaceholder(0)}`;
                await dbProvider.ExecuteSQL(deleteSql, [targetId], { isMutation: true }, actor);
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

    private async enforceReadPermission(): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (isServerSystemUser(actor)) {
            return true;
        }
        const provider = resolveMetadataProvider(this.ProviderToUse, actor);
        if (!actor && provider !== null && provider.ProviderType !== 'Database') {
            return true;
        }
        if (!actor || !provider || !IsValidUUID(this.ArtifactID)) {
            this.NewRecord();
            return false;
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            this.ArtifactID,
            actor
        );
        if (!perms.CanShare && !perms.CanDelete) {
            this.NewRecord();
            return false;
        }
        return true;
    }

    private failResult(type: 'create' | 'update' | 'delete', message: string): boolean {
        LogError(`MJArtifactGuestShareLinkEntityServer ${type} blocked: ${message}`);
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        if (Array.isArray(this.ResultHistory)) {
            this.ResultHistory.push(result);
        } else if (typeof this.RegisterResultHistoryEntry === 'function') {
            this.RegisterResultHistoryEntry(result);
        }
        return false;
    }
}

export function LoadMJArtifactGuestShareLinkEntityServer(): void {
    // Module registration helper
}
