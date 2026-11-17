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
    MJArtifactVersionAttributeEntity
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
    BuildSqlArtifactVersionIdReadablePredicateAsync,
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
    QualifyOuterEntityColumn,
    ResolveMetadataProvider,
    ShouldBypassPostRunViewAsync,
    StripSyntheticFieldsFromRow
} from './ArtifactSecurityHookHelpers';

const ENTITY_NAME = 'MJ: Artifact Version Attributes';
const GLOBAL_KEY_INTERNAL_PARAMS = '__MJ_INTERNAL_ARTIFACT_VERSION_ATTRIBUTE_PARAMS__';
const GLOBAL_KEY_SQL_SCOPED_PARAMS = '__MJ_SQL_SCOPED_ARTIFACT_VERSION_ATTRIBUTE_PARAMS__';
const GLOBAL_KEY_ORIGINAL_FIELDS = '__MJ_ORIGINAL_ARTIFACT_VERSION_ATTRIBUTE_FIELDS_BY_PARAMS__';
const IN_CLAUSE_CHUNK = 100;

interface VersionAttributeRowProjection {
    ID?: string;
    ArtifactVersionID?: string;
}

interface VersionArtifactLookupProjection {
    ID?: string;
    ArtifactID?: string;
}

type VersionAttributeViewRow = BaseEntity | VersionAttributeRowProjection;

function readAttrRowUuid(
    row: VersionAttributeViewRow,
    field: 'ID' | 'ArtifactVersionID'
): string | null {
    if (row instanceof MJArtifactVersionAttributeEntity) {
        const val = field === 'ID' ? row.ID : row.ArtifactVersionID;
        return val && val.trim().length > 0 ? val.trim() : null;
    }
    const candidate = (row as VersionAttributeRowProjection)[field];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

async function batchHydrateVersionIdsByAttributeIds(
    provider: IMetadataProvider,
    attrIds: readonly string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const validIds = [...new Set(attrIds.filter((id) => IsValidUUID(id)).map((id) => id.trim()))];
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
            Fields: ['ID', 'ArtifactVersionID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        internalParams.add(lookupParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(lookupParams);
        const res = await rv.RunView<VersionAttributeRowProjection>(lookupParams, systemUser);
        if (res.Success && res.Results) {
            for (const row of res.Results) {
                if (row.ID && row.ArtifactVersionID && IsValidUUID(row.ArtifactVersionID)) {
                    out.set(NormalizeUUID(row.ID), row.ArtifactVersionID.trim());
                }
            }
        }
    }
    return out;
}

async function batchResolveArtifactIdsByVersionIds(
    provider: IMetadataProvider,
    versionIds: readonly string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const validIds = [...new Set(versionIds.filter((id) => IsValidUUID(id)).map((id) => id.trim()))];
    if (validIds.length === 0) {
        return out;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        return out;
    }
    const rv = RunView.FromMetadataProvider(provider);

    for (const chunk of ChunkUuidList(validIds, IN_CLAUSE_CHUNK)) {
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const lookupParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${inList})`,
            Fields: ['ID', 'ArtifactID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(lookupParams);
        const res = await rv.RunView<VersionArtifactLookupProjection>(lookupParams, systemUser);
        if (res.Success && res.Results) {
            for (const row of res.Results) {
                if (row.ID && row.ArtifactID && IsValidUUID(row.ArtifactID)) {
                    out.set(NormalizeUUID(row.ID), row.ArtifactID.trim());
                }
            }
        }
    }
    return out;
}

export const ArtifactVersionAttributePreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<RunViewParams> => {
    return PrepareScopedPreRunView(
        params,
        {
            TargetEntityName: ENTITY_NAME,
            RequiredFields: ['ID', 'ArtifactVersionID'],
            IdColumnName: 'ArtifactVersionID',
            InternalParams: GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS),
            OriginalFieldsMap: GetGlobalOriginalFieldsMap(GLOBAL_KEY_ORIGINAL_FIELDS),
            SqlScopedParams: GetGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_PARAMS),
            BuildSqlPredicateAsync: (prov, user, entityInfo, runViewParams) =>
                BuildSqlArtifactVersionIdReadablePredicateAsync(
                    QualifyOuterEntityColumn(entityInfo, 'vwArtifactVersionAttributes', 'ArtifactVersionID', prov, runViewParams),
                    prov,
                    user
                )
        },
        contextUser,
        provider
    );
};

export const ArtifactVersionAttributePostRunViewHook: PostRunViewHook = async (
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
        const filterVersionId = ExtractSingleUuidFieldFromFilter(
            params.ExtraFilter,
            'ArtifactVersionID'
        );
        if (filterVersionId && (results.TotalRowCount ?? 0) > 0) {
            try {
                const artMap = await batchResolveArtifactIdsByVersionIds(provider, [filterVersionId]);
                const artifactId = artMap.get(NormalizeUUID(filterVersionId));
                if (artifactId) {
                    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                        provider,
                        artifactId,
                        contextUser
                    );
                    if (perms.CanRead) {
                        return results;
                    }
                }
            } catch (error) {
                LogError(
                    `ArtifactVersionAttributePostRunViewHook failed resolving count_only CanRead for version ${filterVersionId}: ${
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

    const rawRows = results.Results as VersionAttributeViewRow[];
    const missingAttrIds: string[] = [];
    for (const row of rawRows) {
        if (!readAttrRowUuid(row, 'ArtifactVersionID')) {
            const attrId = readAttrRowUuid(row, 'ID');
            if (attrId) {
                missingAttrIds.push(attrId);
            }
        }
    }

    const hydratedVersionIds =
        missingAttrIds.length > 0
            ? await batchHydrateVersionIdsByAttributeIds(provider, missingAttrIds)
            : new Map<string, string>();

    const versionIds: string[] = [];
    for (const row of rawRows) {
        const versionId =
            readAttrRowUuid(row, 'ArtifactVersionID') ??
            (() => {
                const id = readAttrRowUuid(row, 'ID');
                return id && IsValidUUID(id) ? hydratedVersionIds.get(NormalizeUUID(id)) ?? null : null;
            })();
        if (versionId && IsValidUUID(versionId)) {
            versionIds.push(versionId);
        }
    }

    const versionToArtifactMap = await batchResolveArtifactIdsByVersionIds(provider, versionIds);
    const canReadByArtifact = new Map<string, boolean>();
    const keptRows: VersionAttributeViewRow[] = [];

    for (const row of rawRows) {
        let versionId = readAttrRowUuid(row, 'ArtifactVersionID');
        if (!versionId) {
            const rowId = readAttrRowUuid(row, 'ID');
            if (rowId && IsValidUUID(rowId)) {
                versionId = hydratedVersionIds.get(NormalizeUUID(rowId)) ?? null;
            }
        }
        if (!versionId || !IsValidUUID(versionId)) {
            continue;
        }
        const artifactId = versionToArtifactMap.get(NormalizeUUID(versionId));
        if (!artifactId) {
            continue;
        }
        const normArtId = NormalizeUUID(artifactId);
        let allowed = canReadByArtifact.get(normArtId);
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
                    `ArtifactVersionAttributePostRunViewHook failed resolving CanRead for artifact ${artifactId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                allowed = false;
            }
            canReadByArtifact.set(normArtId, allowed);
        }
        if (allowed) {
            keptRows.push(StripSyntheticFieldsFromRow(row, originalFields));
        }
    }

    return FinalizePostRunViewResult(params, results, keptRows, rawRows.length, sqlScopedSet);
};

export function EnsureArtifactVersionAttributeReadHookRegistered(): void {
    EnsureHooksRegistered(
        ArtifactVersionAttributePreRunViewHook,
        ArtifactVersionAttributePostRunViewHook
    );
}

EnsureArtifactVersionAttributeReadHookRegistered();

/**
 * Server-side entity subclass for `MJ: Artifact Version Attributes`.
 *
 * Enforces:
 * 1. `CanRead` on `Load` / `InnerLoad` and `PreRunView` / `PostRunView` via the parent `ArtifactID`.
 * 2. `CanEdit` on parent `ArtifactID` during `Save()` / `Delete()` (so authorized version saves
 *    continue to persist extracted attributes while unauthorized GraphQL writes are rejected).
 * 3. Immutable `ArtifactVersionID` on saved attribute rows.
 */
@RegisterClass(BaseEntity, 'MJ: Artifact Version Attributes')
export class MJArtifactVersionAttributeEntityServer extends MJArtifactVersionAttributeEntity {
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
            if (!actor || !provider || !this.ArtifactVersionID || !IsValidUUID(this.ArtifactVersionID)) {
                this.NewRecord();
                return false;
            }
            const artMap = await batchResolveArtifactIdsByVersionIds(provider, [this.ArtifactVersionID]);
            const artifactId = artMap.get(NormalizeUUID(this.ArtifactVersionID));
            if (!artifactId) {
                this.NewRecord();
                return false;
            }
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
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

        if (!IsServerSystemUser(actor)) {
            if (!actor || !provider || !IsValidUUID(actor.ID)) {
                return FailEntityOperation(
                    this,
                    saveType,
                    'Authenticated user context is required to save artifact version attributes.'
                );
            }

            const oldVersionId = GetOldStringFieldValue(this, 'ArtifactVersionID');
            const newVersionId = NormalizeNullableGuidOrString(this.ArtifactVersionID);

            if (wasSaved && oldVersionId && (!newVersionId || !UUIDsEqual(oldVersionId, newVersionId))) {
                return FailEntityOperation(
                    this,
                    'update',
                    'Permission denied: ArtifactVersionID cannot be reassigned on an existing attribute.'
                );
            }
            if (!newVersionId || !IsValidUUID(newVersionId)) {
                return FailEntityOperation(
                    this,
                    saveType,
                    'A valid ArtifactVersionID is required to save an artifact version attribute.'
                );
            }

            const artMap = await batchResolveArtifactIdsByVersionIds(provider, [newVersionId]);
            const artifactId = artMap.get(NormalizeUUID(newVersionId));
            if (!artifactId) {
                return FailEntityOperation(
                    this,
                    saveType,
                    `Permission denied: unable to resolve parent artifact for version '${newVersionId}'.`
                );
            }

            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
                actor
            );
            if (!perms.CanEdit) {
                return FailEntityOperation(
                    this,
                    saveType,
                    `Permission denied: caller does not hold Edit permission on artifact '${artifactId}'.`
                );
            }
        }

        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        const provider = ResolveMetadataProvider(this.ProviderToUse, actor);
        if (provider?.ProviderType === 'Network') {
            return super.Delete(options);
        }

        if (!IsServerSystemUser(actor)) {
            const versionId =
                GetOldStringFieldValue(this, 'ArtifactVersionID') ??
                NormalizeNullableGuidOrString(this.ArtifactVersionID);
            if (!actor || !provider || !versionId || !IsValidUUID(versionId)) {
                return FailEntityOperation(
                    this,
                    'delete',
                    'Permission denied: authenticated user context and ArtifactVersionID are required to delete an attribute.'
                );
            }

            const artMap = await batchResolveArtifactIdsByVersionIds(provider, [versionId]);
            const artifactId = artMap.get(NormalizeUUID(versionId));
            if (!artifactId) {
                return FailEntityOperation(
                    this,
                    'delete',
                    `Permission denied: unable to resolve parent artifact for version '${versionId}'.`
                );
            }

            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
                actor
            );
            if (!perms.CanEdit) {
                return FailEntityOperation(
                    this,
                    'delete',
                    `Permission denied: caller does not hold Edit permission on artifact '${artifactId}'.`
                );
            }
        }

        return super.Delete(options);
    }
}

export function LoadMJArtifactVersionAttributeEntityServer(): void {
    EnsureArtifactVersionAttributeReadHookRegistered();
}
