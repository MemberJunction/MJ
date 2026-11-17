import {
    BaseEntity,
    CompositeKey,
    EntityDeleteOptions,
    EntitySaveOptions,
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
    MJCollectionEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
    IsValidUUID,
    NormalizeUUID,
    RegisterClass,
    UUIDsEqual
} from '@memberjunction/global';
import {
    BuildSqlCollectionReadablePredicateAsync,
    ChunkUuidList,
    EmptyPostRunViewResult,
    EnsureHooksRegistered,
    ExtractSingleUuidFieldFromFilter,
    FailEntityOperation,
    FinalizePostRunViewResult,
    GetGlobalOriginalFieldsMap,
    GetGlobalWeakSet,
    GetOldStringFieldValue,
    IsServerSystemUser,
    NormalizeNullableGuidOrString,
    PrepareScopedPreRunView,
    QualifyOuterEntityColumnAsync,
    ResolveMetadataProvider,
    ShouldBypassPostRunViewAsync,
    StripSyntheticFieldsFromRow,
    UuidsOrNullEqual
} from './ArtifactSecurityHookHelpers';

const ENTITY_NAME = 'MJ: Collections';
const GLOBAL_KEY_SQL_SCOPED_PARAMS = '__MJ_SQL_SCOPED_COLLECTION_PARAMS__';
const GLOBAL_KEY_INTERNAL_PARAMS = '__MJ_INTERNAL_COLLECTION_SECURITY_PARAMS__';
const GLOBAL_KEY_ORIGINAL_FIELDS = '__MJ_ORIGINAL_COLLECTION_FIELDS_BY_PARAMS__';
const MAX_ANCESTRY_DEPTH = 16;
const IN_CLAUSE_CHUNK = 100;

interface CollectionRowProjection {
    ID?: string;
    OwnerID?: string | null;
    ParentID?: string | null;
}

interface CollectionGrantRowProjection {
    CollectionID?: string;
    CanEdit?: boolean;
    CanDelete?: boolean;
    CanShare?: boolean;
}

interface CollectionArtifactVersionRowProjection {
    ArtifactVersionID?: string | null;
}

interface VersionArtifactRowProjection {
    ID?: string;
    ArtifactID?: string | null;
}

interface CollectionMaxGrants {
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

type CollectionViewRow = BaseEntity | CollectionRowProjection;

function readCollectionRowId(row: CollectionViewRow): string | null {
    if (row instanceof MJCollectionEntity) {
        return row.ID && row.ID.trim().length > 0 ? row.ID.trim() : null;
    }
    const candidate = (row as CollectionRowProjection).ID;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

export const CollectionPreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<RunViewParams> => {
    return PrepareScopedPreRunView(
        params,
        {
            TargetEntityName: ENTITY_NAME,
            RequiredFields: ['ID'],
            IdColumnName: 'ID',
            InternalParams: GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS),
            OriginalFieldsMap: GetGlobalOriginalFieldsMap(GLOBAL_KEY_ORIGINAL_FIELDS),
            SqlScopedParams: GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_PARAMS),
            BuildSqlPredicateAsync: async (prov, user, entityInfo, runViewParams, collectionCache) =>
                BuildSqlCollectionReadablePredicateAsync(
                    await QualifyOuterEntityColumnAsync(entityInfo, 'vwCollections', 'ID', prov, runViewParams, user),
                    prov,
                    user,
                    { precomputedCollectionCache: collectionCache }
                )
        },
        contextUser,
        provider
    );
};

export const CollectionPostRunViewHook: PostRunViewHook = async (
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
        const singleCollectionId = ExtractSingleUuidFieldFromFilter(params.ExtraFilter, 'ID');
        if (singleCollectionId && (results.TotalRowCount ?? 0) > 0) {
            try {
                const perms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                    provider,
                    singleCollectionId,
                    contextUser
                );
                if (perms.CanRead) {
                    return results;
                }
            } catch (error) {
                LogError(
                    `CollectionPostRunViewHook failed resolving count_only CanRead for collection ${singleCollectionId}: ${
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

    const rawRows = results.Results as CollectionViewRow[];
    const canReadCache = new Map<string, boolean>();
    const keptRows: CollectionViewRow[] = [];

    for (const row of rawRows) {
        const collectionId = readCollectionRowId(row);
        if (!collectionId || !IsValidUUID(collectionId)) {
            continue;
        }
        const normKey = NormalizeUUID(collectionId);
        let allowed = canReadCache.get(normKey);
        if (allowed === undefined) {
            try {
                const perms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                    provider,
                    collectionId,
                    contextUser
                );
                allowed = perms.CanRead;
            } catch (error) {
                LogError(
                    `CollectionPostRunViewHook failed resolving CanRead for collection ${collectionId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                allowed = false;
            }
            canReadCache.set(normKey, allowed);
        }
        if (allowed) {
            keptRows.push(StripSyntheticFieldsFromRow(row, originalFields));
        }
    }

    const removedCount = rawRows.length - keptRows.length;
    if (removedCount === 0 && !originalFields && !sqlScopedSet.has(params)) {
        const isPaged = (results.TotalRowCount ?? rawRows.length) > rawRows.length;
        if (!isPaged) {
            return results;
        }
    }

    return FinalizePostRunViewResult(params, results, keptRows, rawRows.length, sqlScopedSet);
};

export function EnsureCollectionReadHookRegistered(): void {
    EnsureHooksRegistered(CollectionPreRunViewHook, CollectionPostRunViewHook);
}

EnsureCollectionReadHookRegistered();

async function isActorOwnerInAncestry(
    provider: IMetadataProvider,
    startCollectionId: string,
    actorUserId: string
): Promise<boolean> {
    if (!IsValidUUID(startCollectionId) || !IsValidUUID(actorUserId)) {
        return false;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return false;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const internalParams = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS);
    const visited = new Set<string>();
    let currentId: string | null = startCollectionId.trim();

    for (let depth = 0; depth < MAX_ANCESTRY_DEPTH && currentId; depth++) {
        const norm = NormalizeUUID(currentId);
        if (visited.has(norm)) {
            return false;
        }
        visited.add(norm);

        const colParams: RunViewParams = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `ID='${EscapeSQLString(currentId)}'`,
            Fields: ['ID', 'OwnerID', 'ParentID'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        internalParams.add(colParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colParams);
        const colRes = await rv.RunView<CollectionRowProjection>(colParams, systemUser);
        if (!colRes.Success || !colRes.Results || colRes.Results.length === 0) {
            return false;
        }
        const row = colRes.Results[0];
        if (row.OwnerID && UUIDsEqual(row.OwnerID, actorUserId)) {
            return true;
        }
        currentId = row.ParentID && row.ParentID.trim().length > 0 ? row.ParentID.trim() : null;
    }
    return false;
}

async function verifyParentAndComputeMaxGrants(
    provider: IMetadataProvider,
    collectionId: string | null,
    targetParentId: string
): Promise<{ valid: boolean; reason?: string; maxGrants: CollectionMaxGrants }> {
    const emptyGrants: CollectionMaxGrants = { CanEdit: false, CanDelete: false, CanShare: false };
    if (!IsValidUUID(targetParentId)) {
        return { valid: false, reason: 'ParentID must be a valid UUID.', maxGrants: emptyGrants };
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return {
            valid: false,
            reason: 'Unable to resolve system user for collection parent validation.',
            maxGrants: emptyGrants
        };
    }

    const rv = RunView.FromMetadataProvider(provider);
    const internalParams = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS);
    const chainIds: string[] = [];
    const visited = new Set<string>();
    let hasOwnerGrant = false;
    let currentId: string | null = targetParentId.trim();

    for (let depth = 0; depth < MAX_ANCESTRY_DEPTH && currentId; depth++) {
        if (collectionId && UUIDsEqual(currentId, collectionId)) {
            return {
                valid: false,
                reason: 'Invalid ParentID: assigning this parent would create a collection cycle.',
                maxGrants: emptyGrants
            };
        }
        const norm = NormalizeUUID(currentId);
        if (visited.has(norm)) {
            return {
                valid: false,
                reason: 'Invalid ParentID: parent collection ancestry contains a cycle.',
                maxGrants: emptyGrants
            };
        }
        visited.add(norm);
        chainIds.push(currentId);

        const colParams: RunViewParams = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `ID='${EscapeSQLString(currentId)}'`,
            Fields: ['ID', 'OwnerID', 'ParentID'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        internalParams.add(colParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colParams);
        const colRes = await rv.RunView<CollectionRowProjection>(colParams, systemUser);
        if (!colRes.Success || !colRes.Results || colRes.Results.length === 0) {
            return {
                valid: false,
                reason: `Target parent collection '${currentId}' could not be loaded.`,
                maxGrants: emptyGrants
            };
        }
        const row = colRes.Results[0];
        if (row.OwnerID && row.OwnerID.trim().length > 0) {
            hasOwnerGrant = true;
        }
        currentId = row.ParentID && row.ParentID.trim().length > 0 ? row.ParentID.trim() : null;
    }

    if (currentId) {
        return {
            valid: false,
            reason: 'Invalid ParentID: parent ancestry exceeds maximum allowed depth.',
            maxGrants: emptyGrants
        };
    }

    if (hasOwnerGrant) {
        return {
            valid: true,
            maxGrants: { CanEdit: true, CanDelete: true, CanShare: true }
        };
    }

    const maxGrants: CollectionMaxGrants = { CanEdit: false, CanDelete: false, CanShare: false };
    for (const chunk of ChunkUuidList(chainIds, IN_CLAUSE_CHUNK)) {
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const permParams: RunViewParams = {
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `CollectionID IN (${inList})`,
            Fields: ['CollectionID', 'CanEdit', 'CanDelete', 'CanShare'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(permParams);
        const permRes = await rv.RunView<CollectionGrantRowProjection>(permParams, systemUser);
        if (!permRes.Success) {
            return {
                valid: false,
                reason: 'Unable to validate permission ceiling for target parent collection.',
                maxGrants: emptyGrants
            };
        }
        for (const p of permRes.Results ?? []) {
            if (p.CanEdit) maxGrants.CanEdit = true;
            if (p.CanDelete) maxGrants.CanDelete = true;
            if (p.CanShare) maxGrants.CanShare = true;
        }
    }

    return { valid: true, maxGrants };
}

async function collectDescendantArtifactIdsForCollection(
    provider: IMetadataProvider,
    rootCollectionId: string
): Promise<{ Success: boolean; ArtifactIds: string[] }> {
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return { Success: false, ArtifactIds: [] };
    }
    const rv = RunView.FromMetadataProvider(provider);
    const internalParams = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS);

    const collectionIds: string[] = [rootCollectionId];
    const seenCols = new Set<string>([NormalizeUUID(rootCollectionId)]);
    let frontier: string[] = [rootCollectionId];

    for (let depth = 0; depth < MAX_ANCESTRY_DEPTH && frontier.length > 0; depth++) {
        const nextFrontier: string[] = [];
        for (const chunk of ChunkUuidList(frontier, IN_CLAUSE_CHUNK)) {
            const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            const childParams: RunViewParams = {
                EntityName: ENTITY_NAME,
                ExtraFilter: `ParentID IN (${inList})`,
                Fields: ['ID'],
                SkipTotalRowCount: true,
                ResultType: 'simple'
            };
            internalParams.add(childParams);
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(childParams);
            const res = await rv.RunView<CollectionRowProjection>(childParams, systemUser);
            if (!res.Success) {
                return { Success: false, ArtifactIds: [] };
            }
            for (const row of res.Results ?? []) {
                if (row.ID && IsValidUUID(row.ID)) {
                    const norm = NormalizeUUID(row.ID);
                    if (!seenCols.has(norm)) {
                        seenCols.add(norm);
                        collectionIds.push(row.ID);
                        nextFrontier.push(row.ID);
                    }
                }
            }
        }
        frontier = nextFrontier;
    }

    const versionIds: string[] = [];
    const seenVersions = new Set<string>();
    for (const chunk of ChunkUuidList(collectionIds, IN_CLAUSE_CHUNK)) {
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const linkParams: RunViewParams = {
            EntityName: 'MJ: Collection Artifacts',
            ExtraFilter: `CollectionID IN (${inList})`,
            Fields: ['ArtifactVersionID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(linkParams);
        const res = await rv.RunView<CollectionArtifactVersionRowProjection>(linkParams, systemUser);
        if (!res.Success) {
            return { Success: false, ArtifactIds: [] };
        }
        for (const row of res.Results ?? []) {
            if (row.ArtifactVersionID && IsValidUUID(row.ArtifactVersionID)) {
                const norm = NormalizeUUID(row.ArtifactVersionID);
                if (!seenVersions.has(norm)) {
                    seenVersions.add(norm);
                    versionIds.push(row.ArtifactVersionID);
                }
            }
        }
    }

    if (versionIds.length === 0) {
        return { Success: true, ArtifactIds: [] };
    }

    const artifactIds: string[] = [];
    const seenArtifacts = new Set<string>();
    for (const chunk of ChunkUuidList(versionIds, IN_CLAUSE_CHUNK)) {
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const verParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${inList})`,
            Fields: ['ID', 'ArtifactID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(verParams);
        const res = await rv.RunView<VersionArtifactRowProjection>(verParams, systemUser);
        if (!res.Success) {
            return { Success: false, ArtifactIds: [] };
        }
        for (const row of res.Results ?? []) {
            if (row.ArtifactID && IsValidUUID(row.ArtifactID)) {
                const norm = NormalizeUUID(row.ArtifactID);
                if (!seenArtifacts.has(norm)) {
                    seenArtifacts.add(norm);
                    artifactIds.push(row.ArtifactID);
                }
            }
        }
    }

    return { Success: true, ArtifactIds: artifactIds };
}

/**
 * Server-side entity subclass for `MJ: Collections`.
 *
 * Enforces:
 * 1. `CanRead` on `Load` / `InnerLoad` and `PreRunView` / `PostRunView` via `ArtifactPermissionEngine`.
 * 2. Mandatory caller `OwnerID` on create (`OwnerID === actor.ID` when omitted, and rejecting forged `OwnerID`).
 * 3. Immutable `OwnerID` on updates for non-system callers.
 * 4. `CanEdit` on updates + target `ParentID`, cycle/self-parent rejection, and anti-escalation across linked artifacts when reparenting.
 * 5. `CanDelete` on `Delete()` for non-system callers.
 */
@RegisterClass(BaseEntity, 'MJ: Collections')
export class MJCollectionEntityServer extends MJCollectionEntity {
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
            if (!actor || !provider || !this.ID) {
                this.NewRecord();
                return false;
            }
            const perms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                provider,
                this.ID,
                actor
            );
            if (!perms.CanRead) {
                this.NewRecord();
                return false;
            }
        }

        return true;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const wasSaved = this.IsSaved;
        const saveType: 'create' | 'update' = wasSaved ? 'update' : 'create';
        const actor = this.ContextCurrentUser;
        const provider = ResolveMetadataProvider(this.ProviderToUse, actor);
        if (provider?.ProviderType === 'Network') {
            return super.Save(options);
        }

        const oldOwnerId = GetOldStringFieldValue(this, 'OwnerID');
        const newOwnerId = NormalizeNullableGuidOrString(this.OwnerID);
        const ownerChanged = !UuidsOrNullEqual(oldOwnerId, newOwnerId);

        const oldParentId = GetOldStringFieldValue(this, 'ParentID');
        const newParentId = NormalizeNullableGuidOrString(this.ParentID);
        const parentChanged = !UuidsOrNullEqual(oldParentId, newParentId);

        if (newParentId && this.ID && UUIDsEqual(newParentId, this.ID)) {
            return FailEntityOperation(
                this,
                saveType,
                'A collection cannot set itself as its own ParentID.'
            );
        }

        if (!IsServerSystemUser(actor)) {
            if (!actor || !provider || !IsValidUUID(actor.ID)) {
                return FailEntityOperation(
                    this,
                    saveType,
                    'Authenticated user context is required to save a collection.'
                );
            }

            if (!wasSaved) {
                if (!newOwnerId) {
                    this.OwnerID = actor.ID;
                } else if (!IsValidUUID(newOwnerId) || !UUIDsEqual(newOwnerId, actor.ID)) {
                    return FailEntityOperation(
                        this,
                        'create',
                        'Permission denied: OwnerID must match the authenticated actor when creating a collection.'
                    );
                }

                if (newParentId) {
                    const parentCheck = await verifyParentAndComputeMaxGrants(
                        provider,
                        this.ID ?? null,
                        newParentId
                    );
                    if (!parentCheck.valid) {
                        return FailEntityOperation(this, 'create', parentCheck.reason ?? 'Invalid ParentID.');
                    }
                    const parentPerms =
                        await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                            provider,
                            newParentId,
                            actor
                        );
                    if (!parentPerms.CanEdit) {
                        return FailEntityOperation(
                            this,
                            'create',
                            `Permission denied: caller does not hold Edit permission on parent collection '${newParentId}'.`
                        );
                    }
                }
            } else {
                if (!this.ID || !IsValidUUID(this.ID)) {
                    return FailEntityOperation(
                        this,
                        'update',
                        'Permission denied: collection ID is required when updating a collection.'
                    );
                }

                const colPerms =
                    await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                        provider,
                        this.ID,
                        actor
                    );
                if (!colPerms.CanEdit) {
                    return FailEntityOperation(
                        this,
                        'update',
                        `Permission denied: caller does not hold Edit permission on collection '${this.ID}'.`
                    );
                }

                if (ownerChanged) {
                    return FailEntityOperation(
                        this,
                        'update',
                        'Permission denied: OwnerID cannot be reassigned on an existing collection.'
                    );
                }

                if (parentChanged) {
                    const isDirectOwner = Boolean(oldOwnerId && UUIDsEqual(oldOwnerId, actor.ID));
                    if (newParentId !== null) {
                        // S7: Reparenting a collection under a non-null ParentID exposes the collection
                        // (and its descendant artifacts) to the target parent's permission tree. Allow
                        // the direct collection owner, OR an owner of an ancestor tree moving a sub-collection
                        // within their own owned tree.
                        const isOwnedTreeMove =
                            !isDirectOwner &&
                            oldParentId !== null &&
                            (await isActorOwnerInAncestry(provider, oldParentId, actor.ID)) &&
                            (await isActorOwnerInAncestry(provider, newParentId, actor.ID));
                        if (!isDirectOwner && !isOwnedTreeMove) {
                            return FailEntityOperation(
                                this,
                                'update',
                                `Permission denied: only the direct owner of collection '${this.ID}' (or its owning ancestor tree owner) may reparent it under another collection.`
                            );
                        }
                    } else {
                        const isCollectionOwnerOrCanDelete =
                            colPerms.CanDelete ||
                            colPerms.Source === 'Owner' ||
                            isDirectOwner;
                        if (!isCollectionOwnerOrCanDelete) {
                            return FailEntityOperation(
                                this,
                                'update',
                                `Permission denied: caller must own or hold Delete permission on collection '${this.ID}' to detach it.`
                            );
                        }
                    }
                    if (oldParentId && !isDirectOwner) {
                        const oldParentPerms =
                            await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                                provider,
                                oldParentId,
                                actor
                            );
                        if (!oldParentPerms.CanEdit) {
                            return FailEntityOperation(
                                this,
                                'update',
                                `Permission denied: caller does not hold Edit permission on current parent collection '${oldParentId}'.`
                            );
                        }
                    }
                }

                if (parentChanged && newParentId) {
                    const parentCheck = await verifyParentAndComputeMaxGrants(
                        provider,
                        this.ID,
                        newParentId
                    );
                    if (!parentCheck.valid) {
                        return FailEntityOperation(this, 'update', parentCheck.reason ?? 'Invalid ParentID.');
                    }

                    const newParentPerms =
                        await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                            provider,
                            newParentId,
                            actor
                        );
                    if (!newParentPerms.CanEdit) {
                        return FailEntityOperation(
                            this,
                            'update',
                            `Permission denied: caller does not hold Edit permission on target parent collection '${newParentId}'.`
                        );
                    }

                    const descendants = await collectDescendantArtifactIdsForCollection(provider, this.ID);
                    if (!descendants.Success) {
                        return FailEntityOperation(
                            this,
                            'update',
                            'Permission denied: unable to verify linked descendant artifacts before moving collection.'
                        );
                    }

                    for (const artifactId of descendants.ArtifactIds) {
                        const artPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                            provider,
                            artifactId,
                            actor
                        );
                        if (!artPerms.CanShare) {
                            return FailEntityOperation(
                                this,
                                'update',
                                `Permission denied: caller lacks Share permission on artifact '${artifactId}' in collection hierarchy.`
                            );
                        }
                        if (
                            (parentCheck.maxGrants.CanEdit && !artPerms.CanEdit) ||
                            (parentCheck.maxGrants.CanDelete && !artPerms.CanDelete) ||
                            (parentCheck.maxGrants.CanShare && !artPerms.CanShare)
                        ) {
                            return FailEntityOperation(
                                this,
                                'update',
                                `Permission denied: moving collection under '${newParentId}' would grant artifact permissions exceeding caller permissions.`
                            );
                        }
                    }
                }
            }
        }

        const collectionId = this.ID;
        let affectedArtifacts: string[] = [];
        if (wasSaved && (ownerChanged || parentChanged) && provider && collectionId && IsValidUUID(collectionId)) {
            const desc = await collectDescendantArtifactIdsForCollection(provider, collectionId);
            if (desc.Success) {
                affectedArtifacts = desc.ArtifactIds;
            }
        }

        const ok = await super.Save(options);
        if (ok && affectedArtifacts.length > 0) {
            for (const artifactId of affectedArtifacts) {
                await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                    ArtifactID: artifactId,
                    ChangedByUserID: actor?.ID
                });
            }
        }
        return ok;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        const provider = ResolveMetadataProvider(this.ProviderToUse, actor);
        if (provider?.ProviderType === 'Network') {
            return super.Delete(options);
        }
        const collectionId = this.ID;

        if (!IsServerSystemUser(actor)) {
            if (!actor || !provider || !collectionId || !IsValidUUID(collectionId)) {
                return FailEntityOperation(
                    this,
                    'delete',
                    'Permission denied: authenticated user context and collection ID are required to delete a collection.'
                );
            }
            const perms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                provider,
                collectionId,
                actor
            );
            if (!perms.CanDelete) {
                return FailEntityOperation(
                    this,
                    'delete',
                    `Permission denied: caller does not hold Delete permission on collection '${collectionId}'.`
                );
            }
        }

        let affectedArtifacts: string[] = [];
        if (provider && collectionId && IsValidUUID(collectionId)) {
            const desc = await collectDescendantArtifactIdsForCollection(provider, collectionId);
            if (desc.Success) {
                affectedArtifacts = desc.ArtifactIds;
            }
        }

        const ok = await super.Delete(options);
        if (ok && affectedArtifacts.length > 0) {
            for (const artifactId of affectedArtifacts) {
                await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                    ArtifactID: artifactId,
                    ChangedByUserID: actor?.ID
                });
            }
        }
        return ok;
    }
}

export function LoadMJCollectionEntityServer(): void {
    EnsureCollectionReadHookRegistered();
}
