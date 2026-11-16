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

const GLOBAL_KEY_ORIGINAL_GUEST_LINK_FIELDS = '__MJ_ORIGINAL_GUEST_SHARE_LINK_FIELDS_BY_PARAMS__';

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
    ArtifactID?: string | null;
    ArtifactVersionID?: string | null;
    CreatedByUserID?: string | null;
    TokenHash?: string | null;
    Label?: string | null;
    ExpiresAt?: Date | string | null;
    RevokedAt?: Date | string | null;
    RevokedByUserID?: string | null;
    LastAccessedAt?: Date | string | null;
    AccessCount?: number | null;
    [key: string]: GuestLinkRowValue;
}

type GuestLinkViewRow = BaseEntity | GuestLinkRawRow;
type SqlBindingValue = string | number | boolean | Date;

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

function clearGuestLinkEntityTokenHash(entity: MJArtifactGuestShareLinkEntity): void {
    entity.TokenHash = '';
    const tokenHashField =
        (Array.isArray(entity.Fields)
            ? entity.Fields.find((f) => f.Name.toLowerCase() === 'tokenhash')
            : undefined) ??
        (typeof entity.GetFieldByName === 'function' ? entity.GetFieldByName('TokenHash') : undefined);
    if (tokenHashField && typeof tokenHashField.ResetOldValue === 'function') {
        tokenHashField.ResetOldValue();
    }
}

function sanitizeGuestLinkRow(
    row: GuestLinkViewRow,
    originalFields: string[] | undefined
): GuestLinkViewRow {
    if (!row || typeof row !== 'object') {
        return row;
    }
    if (row instanceof MJArtifactGuestShareLinkEntity) {
        clearGuestLinkEntityTokenHash(row);
        return row;
    }
    if (row instanceof BaseEntity) {
        return row;
    }
    const copy: GuestLinkRawRow = { ...(row as GuestLinkRawRow) };
    if (Object.prototype.hasOwnProperty.call(copy, 'TokenHash')) {
        copy.TokenHash = '';
    }
    if (Object.prototype.hasOwnProperty.call(copy, 'tokenHash')) {
        copy.tokenHash = '';
    }
    if (originalFields && !hasFieldIgnoreCase(originalFields, 'ArtifactID')) {
        delete copy.ArtifactID;
    }
    return copy;
}

function normalizeOptionalDate(val: Date | string | null | undefined): Date | null {
    if (val === null || val === undefined) {
        return null;
    }
    if (val instanceof Date) {
        return Number.isNaN(val.getTime()) ? null : val;
    }
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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
export const ArtifactGuestShareLinkPreRunViewHook: PreRunViewHook = (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): RunViewParams => {
    const provider = resolveMetadataProvider(hookProvider, contextUser);
    if (
        !params ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifact Guest Share Links' ||
        isServerSystemUser(contextUser) ||
        (!contextUser && provider !== null && provider.ProviderType !== 'Database')
    ) {
        return params;
    }
    if (
        Array.isArray(params.Fields) &&
        params.Fields.length > 0 &&
        !hasFieldIgnoreCase(params.Fields, 'ArtifactID')
    ) {
        getOriginalGuestLinkFieldsMap().set(params, [...params.Fields]);
        params.Fields = [...params.Fields, 'ArtifactID'];
    }
    return params;
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
    if (
        !results?.Success ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifact Guest Share Links'
    ) {
        return results;
    }

    const originalFieldsMap = getOriginalGuestLinkFieldsMap();
    const originalFields = originalFieldsMap.get(params);
    if (originalFields) {
        originalFieldsMap.delete(params);
    }

    const provider = resolveMetadataProvider(hookProvider, contextUser);
    if (isServerSystemUser(contextUser)) {
        return results;
    }
    if (!contextUser && provider !== null && provider.ProviderType !== 'Database') {
        return results;
    }
    if (!contextUser || !provider) {
        results.Results = [];
        results.RowCount = 0;
        results.TotalRowCount = 0;
        return results;
    }

    if (params.ResultType === 'count_only') {
        // Fail closed on unscoped count_only queries so total link counts never leak across unauthorized artifacts.
        results.Results = [];
        results.RowCount = 0;
        results.TotalRowCount = 0;
        return results;
    }

    const rows = (results.Results ?? []) as GuestLinkViewRow[];
    if (rows.length === 0) {
        results.RowCount = 0;
        if (typeof params.MaxRows === 'number' && params.MaxRows > 0) {
            results.TotalRowCount = 0;
        }
        return results;
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

    const removedCount = rows.length - filtered.length;
    const isPaged = (results.TotalRowCount ?? rows.length) > rows.length;
    results.Results = filtered;
    results.RowCount = filtered.length;
    results.TotalRowCount = isPaged
        ? filtered.length
        : Math.max(0, (results.TotalRowCount ?? rows.length) - removedCount);
    return results;
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

        if (!IsValidUUID(this.ArtifactID) || !IsValidUUID(this.ArtifactVersionID) || !IsValidUUID(this.CreatedByUserID)) {
            return this.failResult(
                this.IsSaved ? 'update' : 'create',
                'ArtifactID, ArtifactVersionID, and CreatedByUserID must be valid UUIDs.'
            );
        }
        if (!this.TokenHash || this.TokenHash.trim().length === 0) {
            return this.failResult(
                this.IsSaved ? 'update' : 'create',
                'TokenHash is required on MJ: Artifact Guest Share Links.'
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
            const expiresAt = normalizeOptionalDate(this.ExpiresAt);
            const revokedAt = normalizeOptionalDate(this.RevokedAt);
            const revokedByUserId =
                this.RevokedByUserID && IsValidUUID(this.RevokedByUserID)
                    ? this.RevokedByUserID.trim()
                    : null;
            const lastAccessedAt = normalizeOptionalDate(this.LastAccessedAt);
            const accessCount =
                typeof this.AccessCount === 'number' && Number.isFinite(this.AccessCount) && this.AccessCount >= 0
                    ? Math.trunc(this.AccessCount)
                    : 0;

            let hydratedRow: GuestLinkRawRow | undefined;

            if (dbProvider.PlatformKey === 'sqlserver') {
                if (this.IsSaved) {
                    const spUpdateRef = dbProvider.QuoteSchemaAndView(
                        schema,
                        entityInfo?.spUpdate || 'spUpdateArtifactGuestShareLink'
                    );
                    const params: SqlBindingValue[] = [
                        recordId,
                        this.ArtifactID.trim(),
                        this.ArtifactVersionID.trim(),
                        this.CreatedByUserID.trim(),
                        this.TokenHash.trim()
                    ];
                    const args: string[] = [
                        `@ID = ${dbProvider.BuildParameterPlaceholder(0)}`,
                        `@ArtifactID = ${dbProvider.BuildParameterPlaceholder(1)}`,
                        `@ArtifactVersionID = ${dbProvider.BuildParameterPlaceholder(2)}`,
                        `@CreatedByUserID = ${dbProvider.BuildParameterPlaceholder(3)}`,
                        `@TokenHash = ${dbProvider.BuildParameterPlaceholder(4)}`
                    ];
                    this.appendSqlServerOptionalUpdateArg(dbProvider, args, params, 'Label', label);
                    this.appendSqlServerOptionalUpdateArg(dbProvider, args, params, 'ExpiresAt', expiresAt);
                    this.appendSqlServerOptionalUpdateArg(dbProvider, args, params, 'RevokedAt', revokedAt);
                    this.appendSqlServerOptionalUpdateArg(dbProvider, args, params, 'RevokedByUserID', revokedByUserId);
                    this.appendSqlServerOptionalUpdateArg(dbProvider, args, params, 'LastAccessedAt', lastAccessedAt);
                    args.push(`@AccessCount = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                    params.push(accessCount);

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
                        this.ArtifactID.trim(),
                        this.ArtifactVersionID.trim(),
                        this.CreatedByUserID.trim(),
                        this.TokenHash.trim()
                    ];
                    const args: string[] = [
                        `@ID = ${dbProvider.BuildParameterPlaceholder(0)}`,
                        `@ArtifactID = ${dbProvider.BuildParameterPlaceholder(1)}`,
                        `@ArtifactVersionID = ${dbProvider.BuildParameterPlaceholder(2)}`,
                        `@CreatedByUserID = ${dbProvider.BuildParameterPlaceholder(3)}`,
                        `@TokenHash = ${dbProvider.BuildParameterPlaceholder(4)}`
                    ];
                    if (label !== null) {
                        args.push(`@Label = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                        params.push(label);
                    }
                    if (expiresAt !== null) {
                        args.push(`@ExpiresAt = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                        params.push(expiresAt);
                    }
                    if (revokedAt !== null) {
                        args.push(`@RevokedAt = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                        params.push(revokedAt);
                    }
                    if (revokedByUserId !== null) {
                        args.push(`@RevokedByUserID = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                        params.push(revokedByUserId);
                    }
                    if (lastAccessedAt !== null) {
                        args.push(`@LastAccessedAt = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                        params.push(lastAccessedAt);
                    }
                    args.push(`@AccessCount = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                    params.push(accessCount);

                    const sql = `EXEC ${spCreateRef} ${args.join(', ')}`;
                    const rows = await dbProvider.ExecuteSQL<GuestLinkRawRow>(sql, params, { isMutation: true }, actor);
                    hydratedRow = rows?.[0];
                }
            } else {
                const q = (col: string): string => dbProvider.QuoteIdentifier(col);
                if (this.IsSaved) {
                    const params: SqlBindingValue[] = [];
                    const setClauses: string[] = [];
                    const addCol = (col: string, val: SqlBindingValue | null): void => {
                        if (val === null) {
                            setClauses.push(`${q(col)} = NULL`);
                        } else {
                            setClauses.push(`${q(col)} = ${dbProvider.BuildParameterPlaceholder(params.length)}`);
                            params.push(val);
                        }
                    };
                    addCol('Label', label);
                    addCol('ExpiresAt', expiresAt);
                    addCol('RevokedAt', revokedAt);
                    addCol('RevokedByUserID', revokedByUserId);
                    addCol('LastAccessedAt', lastAccessedAt);
                    addCol('AccessCount', accessCount);
                    addCol('__mj_UpdatedAt', new Date());

                    const wherePlaceholder = dbProvider.BuildParameterPlaceholder(params.length);
                    params.push(recordId);
                    const updateSql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${colId} = ${wherePlaceholder}`;
                    await dbProvider.ExecuteSQL(updateSql, params, { isMutation: true }, actor);
                } else {
                    const params: SqlBindingValue[] = [
                        recordId,
                        this.ArtifactID.trim(),
                        this.ArtifactVersionID.trim(),
                        this.CreatedByUserID.trim(),
                        this.TokenHash.trim()
                    ];
                    const valExprs: string[] = [
                        dbProvider.BuildParameterPlaceholder(0),
                        dbProvider.BuildParameterPlaceholder(1),
                        dbProvider.BuildParameterPlaceholder(2),
                        dbProvider.BuildParameterPlaceholder(3),
                        dbProvider.BuildParameterPlaceholder(4)
                    ];
                    const pushOpt = (val: SqlBindingValue | null): void => {
                        if (val === null) {
                            valExprs.push('NULL');
                        } else {
                            valExprs.push(dbProvider.BuildParameterPlaceholder(params.length));
                            params.push(val);
                        }
                    };
                    pushOpt(label);
                    pushOpt(expiresAt);
                    pushOpt(revokedAt);
                    pushOpt(revokedByUserId);
                    pushOpt(lastAccessedAt);
                    pushOpt(accessCount);

                    const insertSql = `INSERT INTO ${table} (${q('ID')}, ${q('ArtifactID')}, ${q('ArtifactVersionID')}, ${q('CreatedByUserID')}, ${q('TokenHash')}, ${q('Label')}, ${q('ExpiresAt')}, ${q('RevokedAt')}, ${q('RevokedByUserID')}, ${q('LastAccessedAt')}, ${q('AccessCount')}) VALUES (${valExprs.join(', ')})`;
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

    private appendSqlServerOptionalUpdateArg(
        dbProvider: DatabaseProviderBase,
        args: string[],
        params: SqlBindingValue[],
        fieldName: string,
        val: SqlBindingValue | null
    ): void {
        if (val === null) {
            args.push(`@${fieldName}_Clear = 1`);
        } else {
            args.push(
                `@${fieldName}_Clear = 0`,
                `@${fieldName} = ${dbProvider.BuildParameterPlaceholder(params.length)}`
            );
            params.push(val);
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
            clearGuestLinkEntityTokenHash(this);
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
        clearGuestLinkEntityTokenHash(this);
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
