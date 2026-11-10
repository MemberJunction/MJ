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
    Metadata,
    PostRunViewHook,
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
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

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
    provider: IEntityDataProvider | null | undefined
): provider is IEntityDataProvider & IMetadataProvider {
    return Boolean(provider && 'Entities' in provider);
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

function resolveProviderForUser(contextUser: UserInfo): IMetadataProvider | null {
    return (
        contextUser.OwningProvider ??
        Metadata.Provider ?? // global-provider-ok: fallback when UserInfo was constructed without an OwningProvider
        null
    );
}

function readWorkingStateArtifactId(row: unknown): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactWorkingStateEntity) {
        return row.ArtifactID || null;
    }
    const candidate = (row as Record<string, unknown>)['ArtifactID'];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

/**
 * Server-side `PostRunView` data hook enforcing `ArtifactPermissionEngine` read authorization
 * on `MJ: Artifact Working States` (`B1`).
 *
 * `MJ: Artifact Working States` has `IncludeInAPI = 0` (`AllowCreateAPI = 0`, `AllowUpdateAPI = 0`,
 * `AllowDeleteAPI = 0`) and is not exposed on the GraphQL schema. This hook adds defense-in-depth
 * for in-process callers so no non-system `RunView` can return `YjsState` rows for artifacts the
 * caller is not authorized to read via `ArtifactPermissionEngine`.
 */
export const ArtifactWorkingStatePostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined
): Promise<RunViewResult> => {
    if (!results?.Success || resolveTargetEntityName(params) !== 'MJ: Artifact Working States') {
        return results;
    }

    if (isServerSystemUser(contextUser)) {
        return results;
    }

    if (!contextUser) {
        return {
            ...results,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0
        };
    }

    const provider = resolveProviderForUser(contextUser);
    if (!provider || provider.ProviderType !== 'Database') {
        return results;
    }

    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        if (params.ResultType === 'count_only' && (results.TotalRowCount ?? 0) > 0) {
            return {
                ...results,
                RowCount: 0,
                TotalRowCount: 0
            };
        }
        return results;
    }

    const readAllowedByArtifact = new Map<string, boolean>();
    const keptRows: unknown[] = [];

    for (const row of results.Results) {
        const artifactId = readWorkingStateArtifactId(row);
        if (!artifactId) {
            continue;
        }
        const normId = NormalizeUUID(artifactId);
        let allowed = readAllowedByArtifact.get(normId);
        if (allowed === undefined) {
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
                contextUser
            );
            allowed = perms.CanRead;
            readAllowedByArtifact.set(normId, allowed);
        }
        if (allowed) {
            keptRows.push(row);
        }
    }

    if (keptRows.length === results.Results.length) {
        return results;
    }

    const removedCount = results.Results.length - keptRows.length;
    return {
        ...results,
        Results: keptRows,
        RowCount: keptRows.length,
        TotalRowCount: Math.max(0, (results.TotalRowCount ?? results.Results.length) - removedCount)
    };
};

/**
 * Ensures {@link ArtifactWorkingStatePostRunViewHook} is registered once in the global `PostRunView`
 * data hooks store.
 */
export function EnsureArtifactWorkingStateReadHookRegistered(): void {
    const existing = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existing.includes(ArtifactWorkingStatePostRunViewHook)) {
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
            const schema = dbProvider.ConfigData.MJCoreSchemaName || '__mj';
            const table = dbProvider.QuoteSchemaAndView(schema, 'ArtifactWorkingState');
            const view = dbProvider.QuoteSchemaAndView(schema, 'vwArtifactWorkingStates');
            const p0 = dbProvider.BuildParameterPlaceholder(0);
            const p1 = dbProvider.BuildParameterPlaceholder(1);
            const p2 = dbProvider.BuildParameterPlaceholder(2);
            const yjsBytes = this.YjsState ? Buffer.from(this.YjsState, 'base64') : null;
            const lastModUserId = this.LastModifiedByUserID || null;
            const sql = `
                DECLARE @Upserted TABLE ([ID] UNIQUEIDENTIFIER);
                MERGE ${table} AS target
                USING (SELECT CAST(${p0} AS UNIQUEIDENTIFIER) AS [ArtifactID]) AS source
                ON target.[ArtifactID] = source.[ArtifactID]
                WHEN MATCHED THEN
                    UPDATE SET
                        [YjsState] = CAST(${p1} AS VARBINARY(MAX)),
                        [LastModifiedByUserID] = CAST(${p2} AS UNIQUEIDENTIFIER)
                WHEN NOT MATCHED THEN
                    INSERT ([ArtifactID], [YjsState], [LastModifiedByUserID])
                    VALUES (CAST(${p0} AS UNIQUEIDENTIFIER), CAST(${p1} AS VARBINARY(MAX)), CAST(${p2} AS UNIQUEIDENTIFIER))
                OUTPUT INSERTED.[ID] INTO @Upserted;
                SELECT * FROM ${view} WHERE [ID] = (SELECT TOP 1 [ID] FROM @Upserted);
            `;
            const rows = await dbProvider.ExecuteSQL<Record<string, unknown>>(
                sql,
                [this.ArtifactID, yjsBytes, lastModUserId],
                undefined,
                actor
            );
            if (rows && rows.length > 0) {
                await this.LoadFromData(rows[0]);
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
            const table = dbProvider.QuoteSchemaAndView(schema, 'ArtifactWorkingState');
            const p0 = dbProvider.BuildParameterPlaceholder(0);
            const p1 = dbProvider.BuildParameterPlaceholder(1);
            const sql = `DELETE FROM ${table} WHERE [ID] = CAST(${p0} AS UNIQUEIDENTIFIER) OR [ArtifactID] = CAST(${p1} AS UNIQUEIDENTIFIER);`;
            await dbProvider.ExecuteSQL(sql, [this.ID || null, this.ArtifactID || null], undefined, actor);
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
