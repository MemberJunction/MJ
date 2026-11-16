import {
    BaseEntity,
    CompositeKey,
    IMetadataProvider,
    LogError,
    PostRunViewHook,
    PreRunViewHook,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo
} from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    MJCollectionPermissionEntityExtended
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
    IsValidUUID,
    NormalizeUUID,
    RegisterClass
} from '@memberjunction/global';
import {
    ChunkUuidList,
    EmptyPostRunViewResult,
    EnsureHooksRegistered,
    ExtractSingleUuidFieldFromFilter,
    FinalizePostRunViewResult,
    GetGlobalOriginalFieldsMap,
    GetGlobalWeakSet,
    IsServerSystemUser,
    PrepareScopedPreRunView,
    ResolveMetadataProvider,
    ShouldBypassPostRunViewAsync,
    StripSyntheticFieldsFromRow
} from './ArtifactSecurityHookHelpers';

const ENTITY_NAME = 'MJ: Collection Permissions';
const GLOBAL_KEY_INTERNAL_PARAMS = '__MJ_INTERNAL_COLLECTION_PERMISSION_PARAMS__';
const GLOBAL_KEY_ORIGINAL_FIELDS = '__MJ_ORIGINAL_COLLECTION_PERMISSION_FIELDS_BY_PARAMS__';
const GLOBAL_KEY_SQL_SCOPED_PARAMS = '__MJ_SQL_SCOPED_COLLECTION_PERMISSION_PARAMS__';
const IN_CLAUSE_CHUNK = 100;

interface CollectionPermissionRowProjection {
    ID?: string;
    CollectionID?: string;
}

type CollectionPermissionViewRow = BaseEntity | CollectionPermissionRowProjection;

function readRowUuid(row: CollectionPermissionViewRow, field: 'ID' | 'CollectionID'): string | null {
    if (row instanceof MJCollectionPermissionEntityExtended) {
        const val = field === 'ID' ? row.ID : row.CollectionID;
        return val && val.trim().length > 0 ? val.trim() : null;
    }
    const candidate = (row as CollectionPermissionRowProjection)[field];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

async function batchHydrateCollectionIdsByPermIds(
    provider: IMetadataProvider,
    permIds: readonly string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const validIds = [...new Set(permIds.filter((id) => IsValidUUID(id)).map((id) => id.trim()))];
    if (validIds.length === 0) {
        return out;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return out;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const internalParams = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS);

    for (const chunk of ChunkUuidList(validIds, IN_CLAUSE_CHUNK)) {
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const lookupParams: RunViewParams = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `ID IN (${inList})`,
            Fields: ['ID', 'CollectionID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        internalParams.add(lookupParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(lookupParams);
        const res = await rv.RunView<CollectionPermissionRowProjection>(lookupParams, systemUser);
        if (res.Success && res.Results) {
            for (const row of res.Results) {
                if (row.ID && row.CollectionID && IsValidUUID(row.CollectionID)) {
                    out.set(NormalizeUUID(row.ID), row.CollectionID.trim());
                }
            }
        }
    }
    return out;
}

export const CollectionPermissionPreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<RunViewParams> => {
    return PrepareScopedPreRunView(
        params,
        {
            TargetEntityName: ENTITY_NAME,
            RequiredFields: ['ID', 'CollectionID'],
            IdColumnName: 'CollectionID',
            InternalParams: GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS),
            OriginalFieldsMap: GetGlobalOriginalFieldsMap(GLOBAL_KEY_ORIGINAL_FIELDS),
            SqlScopedParams: GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_PARAMS),
            ResolveReadableIds: (prov, user) =>
                ArtifactPermissionEngine.Instance.BuildReadableCollectionIdSet(prov, user)
        },
        contextUser,
        provider
    );
};

export const CollectionPermissionPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser?: UserInfo,
    hookProvider?: IMetadataProvider
): Promise<RunViewResult> => {
    const provider = ResolveMetadataProvider(hookProvider, contextUser);
    const sqlScopedSet = GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_PARAMS);
    const { bypass, originalFields } = await ShouldBypassPostRunViewAsync(
        params,
        ENTITY_NAME,
        GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS),
        GetGlobalOriginalFieldsMap(GLOBAL_KEY_ORIGINAL_FIELDS),
        contextUser,
        provider
    );
    if (bypass) {
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
        const filterCollectionId = ExtractSingleUuidFieldFromFilter(params.ExtraFilter, 'CollectionID');
        if (filterCollectionId && (results.TotalRowCount ?? 0) > 0) {
            try {
                const perms =
                    await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                        provider,
                        filterCollectionId,
                        contextUser
                    );
                if (perms.CanRead) {
                    return results;
                }
            } catch (error) {
                LogError(
                    `CollectionPermissionPostRunViewHook failed resolving count_only CanRead for collection ${filterCollectionId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }
        return EmptyPostRunViewResult(results);
    }

    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        return FinalizePostRunViewResult(params, results, [], 0, sqlScopedSet);
    }

    const rawRows = results.Results as CollectionPermissionViewRow[];
    const missingIds: string[] = [];
    for (const row of rawRows) {
        if (!readRowUuid(row, 'CollectionID')) {
            const id = readRowUuid(row, 'ID');
            if (id) {
                missingIds.push(id);
            }
        }
    }

    const hydratedCollectionIds =
        missingIds.length > 0
            ? await batchHydrateCollectionIdsByPermIds(provider, missingIds)
            : new Map<string, string>();

    const canReadByCollection = new Map<string, boolean>();
    const keptRows: CollectionPermissionViewRow[] = [];

    for (const row of rawRows) {
        let collectionId = readRowUuid(row, 'CollectionID');
        if (!collectionId) {
            const rowId = readRowUuid(row, 'ID');
            if (rowId && IsValidUUID(rowId)) {
                collectionId = hydratedCollectionIds.get(NormalizeUUID(rowId)) ?? null;
            }
        }
        if (!collectionId || !IsValidUUID(collectionId)) {
            continue;
        }
        const normColId = NormalizeUUID(collectionId);
        let allowed = canReadByCollection.get(normColId);
        if (allowed === undefined) {
            try {
                const perms =
                    await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                        provider,
                        collectionId,
                        contextUser
                    );
                allowed = perms.CanRead;
            } catch (error) {
                LogError(
                    `CollectionPermissionPostRunViewHook failed resolving CanRead for collection ${collectionId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                allowed = false;
            }
            canReadByCollection.set(normColId, allowed);
        }
        if (allowed) {
            keptRows.push(StripSyntheticFieldsFromRow(row, originalFields));
        }
    }

    return FinalizePostRunViewResult(params, results, keptRows, rawRows.length, sqlScopedSet);
};

export function EnsureCollectionPermissionReadHookRegistered(): void {
    EnsureHooksRegistered(CollectionPermissionPreRunViewHook, CollectionPermissionPostRunViewHook);
}

EnsureCollectionPermissionReadHookRegistered();

/**
 * Server-side entity subclass for `MJ: Collection Permissions`.
 *
 * Extends {@link MJCollectionPermissionEntityExtended} (preserving its `Save` and `Delete`
 * `CanShare` / grant-ceiling / descendant-artifact anti-escalation / immutability checks)
 * with server-side `CanRead` enforcement on `Load` / `InnerLoad` and `PreRunView` / `PostRunView`.
 */
@RegisterClass(BaseEntity, 'MJ: Collection Permissions')
export class MJCollectionPermissionEntityServer extends MJCollectionPermissionEntityExtended {
    public override async Load(
        ID: string,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const key = CompositeKey.FromID(ID);
        return this.InnerLoad(key, EntityRelationshipsToLoad);
    }

    public override async InnerLoad(
        compositeKey: CompositeKey,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const loaded = await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }

        const actor = this.ContextCurrentUser;
        if (!IsServerSystemUser(actor)) {
            const provider = ResolveMetadataProvider(this.ProviderToUse, actor);
            if (!actor && provider !== null && provider.ProviderType !== 'Database') {
                return true;
            }
            if (!actor || !provider || !this.CollectionID || !IsValidUUID(this.CollectionID)) {
                this.NewRecord();
                return false;
            }
            const perms =
                await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                    provider,
                    this.CollectionID,
                    actor
                );
            if (!perms.CanRead) {
                this.NewRecord();
                return false;
            }
        }

        return true;
    }
}

export function LoadMJCollectionPermissionEntityServer(): void {
    EnsureCollectionPermissionReadHookRegistered();
}
