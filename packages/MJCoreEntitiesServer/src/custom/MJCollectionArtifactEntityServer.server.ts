import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityDeleteOptions,
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
    MJCollectionArtifactEntity,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, GetGlobalObjectStore, IsValidUUID, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    BuildSqlArtifactVersionIdReadablePredicateAsync,
    BuildSqlCollectionReadablePredicate,
    EmptyPostRunViewResult,
    FinalizePostRunViewResult,
    GetGlobalWeakSet,
    PrepareScopedPreRunView,
    QualifyOuterEntityColumn,
    ShouldBypassPostRunViewAsync
} from './ArtifactSecurityHookHelpers';

const COLLECTION_ARTIFACT_ENTITY_NAME = 'MJ: Collection Artifacts';
const GLOBAL_KEY_INTERNAL_COLLECTION_ARTIFACT_PARAMS = '__MJ_INTERNAL_COLLECTION_ARTIFACT_SECURITY_PARAMS__';
const GLOBAL_KEY_ORIGINAL_COLLECTION_ARTIFACT_FIELDS = '__MJ_ORIGINAL_COLLECTION_ARTIFACT_FIELDS_BY_PARAMS__';
const GLOBAL_KEY_SQL_SCOPED_COLLECTION_ARTIFACT_PARAMS = '__MJ_SQL_SCOPED_COLLECTION_ARTIFACT_PARAMS__';
const MAX_COLLECTION_ANCESTRY_DEPTH = 16;

function getInternalCollectionArtifactQueryParamsSet(): WeakSet<object> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_INTERNAL_COLLECTION_ARTIFACT_PARAMS];
        if (existing instanceof WeakSet) {
            return existing;
        }
        const created = new WeakSet<object>();
        store[GLOBAL_KEY_INTERNAL_COLLECTION_ARTIFACT_PARAMS] = created;
        return created;
    }
    return new WeakSet<object>();
}

function getOriginalCollectionArtifactFieldsMap(): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_ORIGINAL_COLLECTION_ARTIFACT_FIELDS];
        if (existing instanceof WeakMap) {
            return existing;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[GLOBAL_KEY_ORIGINAL_COLLECTION_ARTIFACT_FIELDS] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

interface CollectionArtifactRowProjection {
    ID?: string | null;
    CollectionID?: string | null;
    ArtifactVersionID?: string | null;
    ArtifactID?: string | null;
    [key: string]: string | number | boolean | Date | null | undefined;
}

interface ArtifactVersionProjection {
    ID: string;
    ArtifactID: string;
}

interface CollectionChainRowProjection {
    ID: string;
    OwnerID: string | null;
    ParentID: string | null;
}

interface CollectionGrantRowProjection {
    CollectionID: string;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

interface CollectionMaxGrants {
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

type CollectionArtifactViewRow = BaseEntity | CollectionArtifactRowProjection;

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

function readRowField(
    row: CollectionArtifactViewRow | null | undefined,
    fieldName: 'ID' | 'CollectionID' | 'ArtifactVersionID'
): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJCollectionArtifactEntity) {
        const val = row[fieldName];
        return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
    }
    const candidate = (row as CollectionArtifactRowProjection)[fieldName];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function stripSyntheticFields(
    row: CollectionArtifactViewRow,
    originalFields: string[]
): CollectionArtifactViewRow {
    if (!row || typeof row !== 'object' || row instanceof BaseEntity) {
        return row;
    }
    const copy: CollectionArtifactRowProjection = { ...(row as CollectionArtifactRowProjection) };
    if (!hasFieldIgnoreCase(originalFields, 'CollectionID')) {
        delete copy.CollectionID;
    }
    if (!hasFieldIgnoreCase(originalFields, 'ArtifactVersionID')) {
        delete copy.ArtifactVersionID;
    }
    return copy;
}

async function resolveArtifactIdForVersion(
    provider: IMetadataProvider,
    artifactVersionId: string
): Promise<string | null> {
    if (!IsValidUUID(artifactVersionId)) {
        return null;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return null;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const params: RunViewParams = {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ID='${EscapeSQLString(artifactVersionId)}'`,
        Fields: ['ID', 'ArtifactID'],
        SkipTotalRowCount: true,
        ResultType: 'simple'
    };
    getInternalCollectionArtifactQueryParamsSet().add(params);
    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(params);
    const res = await rv.RunView<ArtifactVersionProjection>(params, systemUser);
    if (!res.Success || !res.Results || res.Results.length === 0) {
        return null;
    }
    const artifactId = res.Results[0].ArtifactID;
    return artifactId && IsValidUUID(artifactId) ? artifactId.trim() : null;
}

async function batchResolveArtifactIdsForVersions(
    provider: IMetadataProvider,
    versionIds: string[]
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const validIds = Array.from(
        new Set(
            versionIds
                .filter((v) => IsValidUUID(v))
                .map((v) => NormalizeUUID(v))
        )
    );
    if (validIds.length === 0) {
        return map;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return map;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const chunkSize = 200;
    for (let i = 0; i < validIds.length; i += chunkSize) {
        const chunk = validIds.slice(i, i + chunkSize);
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const params: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${inList})`,
            Fields: ['ID', 'ArtifactID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        getInternalCollectionArtifactQueryParamsSet().add(params);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(params);
        const res = await rv.RunView<ArtifactVersionProjection>(params, systemUser);
        if (res.Success && res.Results) {
            for (const row of res.Results) {
                if (row.ID && row.ArtifactID && IsValidUUID(row.ArtifactID)) {
                    map.set(NormalizeUUID(row.ID), row.ArtifactID.trim());
                }
            }
        }
    }
    return map;
}

/**
 * Computes the maximum permission flags any collection owner or `MJ: Collection Permissions`
 * grantee along the collection's ancestry chain would gain on artifacts linked into `collectionId`.
 */
async function resolveMaxCollectionAncestryGrants(
    provider: IMetadataProvider,
    collectionId: string
): Promise<CollectionMaxGrants | null> {
    if (!IsValidUUID(collectionId)) {
        return null;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return null;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const chainIds: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = collectionId.trim();
    let hasOwnerGrant = false;

    for (let depth = 0; depth < MAX_COLLECTION_ANCESTRY_DEPTH && currentId; depth++) {
        if (!IsValidUUID(currentId)) {
            break;
        }
        const norm = NormalizeUUID(currentId);
        if (visited.has(norm)) {
            break;
        }
        visited.add(norm);
        chainIds.push(currentId);

        const colParams: RunViewParams = {
            EntityName: 'MJ: Collections',
            ExtraFilter: `ID='${EscapeSQLString(currentId)}'`,
            Fields: ['ID', 'OwnerID', 'ParentID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        getInternalCollectionArtifactQueryParamsSet().add(colParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colParams);
        const colRes = await rv.RunView<CollectionChainRowProjection>(colParams, systemUser);
        if (!colRes.Success || !colRes.Results || colRes.Results.length === 0) {
            if (depth === 0) {
                return null;
            }
            break;
        }
        const colRow = colRes.Results[0];
        if (colRow.OwnerID && colRow.OwnerID.trim().length > 0) {
            hasOwnerGrant = true;
        }
        currentId = colRow.ParentID && colRow.ParentID.trim().length > 0 ? colRow.ParentID.trim() : null;
    }

    if (hasOwnerGrant) {
        return { CanEdit: true, CanDelete: true, CanShare: true };
    }

    const grants: CollectionMaxGrants = { CanEdit: false, CanDelete: false, CanShare: false };
    const inList = chainIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const permParams: RunViewParams = {
        EntityName: 'MJ: Collection Permissions',
        ExtraFilter: `CollectionID IN (${inList})`,
        Fields: ['CollectionID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare'],
        SkipTotalRowCount: true,
        ResultType: 'simple'
    };
    getInternalCollectionArtifactQueryParamsSet().add(permParams);
    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(permParams);
    const permRes = await rv.RunView<CollectionGrantRowProjection>(permParams, systemUser);
    if (!permRes.Success) {
        return null;
    }
    for (const row of permRes.Results ?? []) {
        if (row.CanEdit) grants.CanEdit = true;
        if (row.CanDelete) grants.CanDelete = true;
        if (row.CanShare) grants.CanShare = true;
    }
    return grants;
}

/**
 * Server-side `PreRunView` hook projecting `CollectionID` and `ArtifactVersionID` when
 * a non-system caller queries `MJ: Collection Artifacts` with a partial `Fields` list.
 */
export const CollectionArtifactPreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewParams> => {
    return PrepareScopedPreRunView(
        params,
        {
            TargetEntityName: COLLECTION_ARTIFACT_ENTITY_NAME,
            RequiredFields: ['CollectionID', 'ArtifactVersionID'],
            IdColumnName: 'ArtifactVersionID',
            InternalParams: getInternalCollectionArtifactQueryParamsSet(),
            OriginalFieldsMap: getOriginalCollectionArtifactFieldsMap(),
            SqlScopedParams: GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_COLLECTION_ARTIFACT_PARAMS),
            BuildSqlPredicateAsync: (prov, user, entityInfo, runViewParams) =>
                BuildSqlArtifactVersionIdReadablePredicateAsync(
                    QualifyOuterEntityColumn(entityInfo, 'vwCollectionArtifacts', 'ArtifactVersionID', prov, runViewParams),
                    prov,
                    user
                ),
            ExtraPredicates: [
                {
                    IdColumnName: 'CollectionID',
                    BuildSqlPredicate: (prov, user, entityInfo, runViewParams) =>
                        BuildSqlCollectionReadablePredicate(
                            QualifyOuterEntityColumn(entityInfo, 'vwCollectionArtifacts', 'CollectionID', prov, runViewParams),
                            prov,
                            user
                        )
                }
            ]
        },
        contextUser,
        hookProvider
    );
};

/**
 * Server-side `PostRunView` hook filtering `MJ: Collection Artifacts` rows so callers
 * can only see memberships where they hold `CanRead` on both the collection and artifact.
 */
export const CollectionArtifactPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewResult> => {
    if (!results?.Success) {
        return results;
    }

    const provider = resolveMetadataProvider(hookProvider, contextUser);
    const sqlScopedSet = GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_COLLECTION_ARTIFACT_PARAMS);
    const { bypass, originalFields } = await ShouldBypassPostRunViewAsync(
        params,
        COLLECTION_ARTIFACT_ENTITY_NAME,
        getInternalCollectionArtifactQueryParamsSet(),
        getOriginalCollectionArtifactFieldsMap(),
        contextUser,
        provider
    );
    if (bypass) {
        sqlScopedSet.delete(params);
        return results;
    }
    if (!contextUser && provider !== null && provider.ProviderType !== 'Database') {
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

    const rows = (results.Results ?? []) as CollectionArtifactViewRow[];
    if (rows.length === 0) {
        return FinalizePostRunViewResult(params, results, [], 0, sqlScopedSet);
    }

    const versionIds = rows
        .map((r) => readRowField(r, 'ArtifactVersionID'))
        .filter((id): id is string => Boolean(id));
    const versionToArtifactMap = await batchResolveArtifactIdsForVersions(provider, versionIds);

    const collectionCanReadCache = new Map<string, boolean>();
    const artifactCanReadCache = new Map<string, boolean>();

    const checkCollectionRead = async (collectionId: string): Promise<boolean> => {
        const key = NormalizeUUID(collectionId);
        const cached = collectionCanReadCache.get(key);
        if (cached !== undefined) return cached;
        const perms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider,
            collectionId,
            contextUser
        );
        collectionCanReadCache.set(key, perms.CanRead);
        return perms.CanRead;
    };

    const checkArtifactRead = async (artifactId: string): Promise<boolean> => {
        const key = NormalizeUUID(artifactId);
        const cached = artifactCanReadCache.get(key);
        if (cached !== undefined) return cached;
        const canRead = await ArtifactPermissionEngine.Instance.CheckPermission(
            provider,
            artifactId,
            contextUser,
            'Read'
        );
        artifactCanReadCache.set(key, canRead);
        return canRead;
    };

    const filtered: CollectionArtifactViewRow[] = [];
    for (const row of rows) {
        const collectionId = readRowField(row, 'CollectionID');
        const versionId = readRowField(row, 'ArtifactVersionID');
        if (!collectionId || !versionId) {
            continue;
        }
        const artifactId = versionToArtifactMap.get(NormalizeUUID(versionId));
        if (!artifactId) {
            continue;
        }
        const [canReadCol, canReadArtifact] = await Promise.all([
            checkCollectionRead(collectionId),
            checkArtifactRead(artifactId)
        ]);
        if (canReadCol && canReadArtifact) {
            filtered.push(originalFields ? stripSyntheticFields(row, originalFields) : row);
        }
    }

    return FinalizePostRunViewResult(params, results, filtered, rows.length, sqlScopedSet);
};

export function EnsureCollectionArtifactReadHookRegistered(): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(CollectionArtifactPreRunViewHook)) {
        RegisterDataHook('PreRunView', CollectionArtifactPreRunViewHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(CollectionArtifactPostRunViewHook)) {
        RegisterDataHook('PostRunView', CollectionArtifactPostRunViewHook);
    }
}

EnsureCollectionArtifactReadHookRegistered();

/**
 * Server-side entity class for `MJ: Collection Artifacts`.
 * Enforces:
 * - `CanRead` on both `CollectionID` and target `ArtifactID` during `InnerLoad`/`Load` and `RunView`
 * - Immutability of `CollectionID` and `ArtifactVersionID` on existing records
 * - `CanEdit` on `CollectionID` + `CanShare` on target `ArtifactID` for creates/updates
 * - Anti-escalation check: collection ownership & `MJ: Collection Permissions` along the collection's
 *   ancestry chain cannot grant `CanEdit`, `CanDelete`, or `CanShare` on the target artifact beyond
 *   what the caller themselves holds on that artifact
 * - `CanEdit` on `CollectionID` for deletes
 * - Real-time permission change notifications via `ArtifactPermissionEngine.Instance.NotifyPermissionsChanged`
 */
@RegisterClass(BaseEntity, 'MJ: Collection Artifacts')
export class MJCollectionArtifactEntityServer extends MJCollectionArtifactEntity {
    public override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const loaded = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad);
        if (!loaded) {
            return false;
        }
        return this.enforceReadPermission();
    }

    public override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const key = CompositeKey.FromID(ID); // first-pk-ok: 'MJ: Collection Artifacts' has single key ID
        return this.InnerLoad(key, EntityRelationshipsToLoad);
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        const provider = resolveMetadataProvider(this.ProviderToUse, actor);
        if (provider?.ProviderType === 'Network') {
            return super.Save(options);
        }

        if (!isServerSystemUser(actor)) {
            if (!actor || !provider || !IsValidUUID(actor.ID)) {
                return this.failResult(
                    this.IsSaved ? 'update' : 'create',
                    'Permission denied: authenticated user context is required to modify collection artifacts.'
                );
            }

            if (!IsValidUUID(this.CollectionID) || !IsValidUUID(this.ArtifactVersionID)) {
                return this.failResult(
                    this.IsSaved ? 'update' : 'create',
                    'Invalid CollectionID or ArtifactVersionID.'
                );
            }

            if (this.IsSaved) {
                const oldCollectionId = this.getOldStringValue('CollectionID');
                const oldVersionId = this.getOldStringValue('ArtifactVersionID');
                if (oldCollectionId && !UUIDsEqual(oldCollectionId, this.CollectionID)) {
                    return this.failResult(
                        'update',
                        'Permission denied: CollectionID cannot be changed on an existing MJ: Collection Artifacts record.'
                    );
                }
                if (oldVersionId && !UUIDsEqual(oldVersionId, this.ArtifactVersionID)) {
                    return this.failResult(
                        'update',
                        'Permission denied: ArtifactVersionID cannot be changed on an existing MJ: Collection Artifacts record.'
                    );
                }
            }

            const targetArtifactId = await resolveArtifactIdForVersion(provider, this.ArtifactVersionID);
            if (!targetArtifactId) {
                return this.failResult(
                    this.IsSaved ? 'update' : 'create',
                    `Target ArtifactVersion '${this.ArtifactVersionID}' could not be resolved to an artifact.`
                );
            }

            const [collectionPerms, artifactPerms, maxCollectionGrants] = await Promise.all([
                ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                    provider,
                    this.CollectionID,
                    actor
                ),
                ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    targetArtifactId,
                    actor
                ),
                resolveMaxCollectionAncestryGrants(provider, this.CollectionID)
            ]);

            if (!collectionPerms.CanEdit) {
                return this.failResult(
                    this.IsSaved ? 'update' : 'create',
                    `Permission denied: caller does not hold Edit permission on collection '${this.CollectionID}'.`
                );
            }
            if (!artifactPerms.CanShare) {
                return this.failResult(
                    this.IsSaved ? 'update' : 'create',
                    `Permission denied: caller does not hold Share permission on artifact '${targetArtifactId}'.`
                );
            }
            if (!maxCollectionGrants) {
                return this.failResult(
                    this.IsSaved ? 'update' : 'create',
                    `Permission denied: unable to verify collection permission ceiling for collection '${this.CollectionID}'.`
                );
            }
            if (
                (maxCollectionGrants.CanEdit && !artifactPerms.CanEdit) ||
                (maxCollectionGrants.CanDelete && !artifactPerms.CanDelete) ||
                (maxCollectionGrants.CanShare && !artifactPerms.CanShare)
            ) {
                return this.failResult(
                    this.IsSaved ? 'update' : 'create',
                    `Permission denied: linking artifact '${targetArtifactId}' into collection '${this.CollectionID}' would grant permissions exceeding caller's own permissions on the artifact.`
                );
            }
        }

        const versionIdForNotify = this.ArtifactVersionID;
        const ok = await super.Save(options);
        if (ok && provider && versionIdForNotify && IsValidUUID(versionIdForNotify)) {
            const artifactId = await resolveArtifactIdForVersion(provider, versionIdForNotify);
            if (artifactId) {
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
        const provider = resolveMetadataProvider(this.ProviderToUse, actor);
        if (provider?.ProviderType === 'Network') {
            return super.Delete(options);
        }
        const collectionId = this.getOldStringValue('CollectionID') || this.CollectionID;
        const versionId = this.getOldStringValue('ArtifactVersionID') || this.ArtifactVersionID;

        if (!isServerSystemUser(actor)) {
            if (!actor || !provider || !IsValidUUID(actor.ID) || !IsValidUUID(collectionId)) {
                return this.failResult(
                    'delete',
                    'Permission denied: authenticated user context and CollectionID are required to remove a collection artifact.'
                );
            }
            const collectionPerms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                provider,
                collectionId,
                actor
            );
            if (!collectionPerms.CanEdit) {
                return this.failResult(
                    'delete',
                    `Permission denied: caller does not hold Edit permission on collection '${collectionId}'.`
                );
            }
        }

        const artifactId =
            provider && versionId && IsValidUUID(versionId)
                ? await resolveArtifactIdForVersion(provider, versionId)
                : null;
        const ok = await super.Delete(options);
        if (ok && artifactId) {
            await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                ArtifactID: artifactId,
                ChangedByUserID: actor?.ID
            });
        }
        return ok;
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
        if (!actor || !provider || !IsValidUUID(this.CollectionID) || !IsValidUUID(this.ArtifactVersionID)) {
            this.NewRecord();
            return false;
        }
        const targetArtifactId = await resolveArtifactIdForVersion(provider, this.ArtifactVersionID);
        if (!targetArtifactId) {
            this.NewRecord();
            return false;
        }
        const [collectionPerms, canReadArtifact] = await Promise.all([
            ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
                provider,
                this.CollectionID,
                actor
            ),
            ArtifactPermissionEngine.Instance.CheckPermission(
                provider,
                targetArtifactId,
                actor,
                'Read'
            )
        ]);
        if (!collectionPerms.CanRead || !canReadArtifact) {
            this.NewRecord();
            return false;
        }
        return true;
    }

    private getOldStringValue(fieldName: string): string | null {
        const field =
            (Array.isArray(this.Fields) ? this.Fields.find((f) => f.Name === fieldName) : undefined) ??
            this.GetFieldByName(fieldName);
        const raw = field?.OldValue;
        if (raw === null || raw === undefined) {
            return null;
        }
        const str = String(raw).trim();
        return str.length > 0 ? str : null;
    }

    private failResult(type: 'create' | 'update' | 'delete', message: string): boolean {
        LogError(`MJCollectionArtifactEntityServer ${type} blocked: ${message}`);
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

export function LoadMJCollectionArtifactEntityServer(): void {
    // Module registration helper
}
