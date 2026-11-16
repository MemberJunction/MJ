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
    MJArtifactPermissionEntityExtended
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
    GetGlobalOriginalFieldsMap,
    GetGlobalWeakSet,
    IsServerSystemUser,
    PrepareRequiredFieldsPreRunView,
    ResolveMetadataProvider,
    ShouldBypassPostRunView,
    StripSyntheticFieldsFromRow
} from './ArtifactSecurityHookHelpers';

const ENTITY_NAME = 'MJ: Artifact Permissions';
const GLOBAL_KEY_INTERNAL_PARAMS = '__MJ_INTERNAL_ARTIFACT_PERMISSION_PARAMS__';
const GLOBAL_KEY_ORIGINAL_FIELDS = '__MJ_ORIGINAL_ARTIFACT_PERMISSION_FIELDS_BY_PARAMS__';
const IN_CLAUSE_CHUNK = 100;

interface ArtifactPermissionRowProjection {
    ID?: string;
    ArtifactID?: string;
}

type ArtifactPermissionViewRow = BaseEntity | ArtifactPermissionRowProjection;

function readRowUuid(row: ArtifactPermissionViewRow, field: 'ID' | 'ArtifactID'): string | null {
    if (row instanceof MJArtifactPermissionEntityExtended) {
        const val = field === 'ID' ? row.ID : row.ArtifactID;
        return val && val.trim().length > 0 ? val.trim() : null;
    }
    const candidate = (row as ArtifactPermissionRowProjection)[field];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

async function batchHydrateArtifactIdsByPermIds(
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
            Fields: ['ID', 'ArtifactID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        internalParams.add(lookupParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(lookupParams);
        const res = await rv.RunView<ArtifactPermissionRowProjection>(lookupParams, systemUser);
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

export const ArtifactPermissionPreRunViewHook: PreRunViewHook = (
    params: RunViewParams,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): RunViewParams => {
    return PrepareRequiredFieldsPreRunView(
        params,
        ENTITY_NAME,
        ['ID', 'ArtifactID'],
        GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS),
        GetGlobalOriginalFieldsMap(GLOBAL_KEY_ORIGINAL_FIELDS),
        contextUser,
        provider
    );
};

export const ArtifactPermissionPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser?: UserInfo,
    hookProvider?: IMetadataProvider
): Promise<RunViewResult> => {
    const provider = ResolveMetadataProvider(hookProvider, contextUser);
    const { bypass, originalFields } = ShouldBypassPostRunView(
        params,
        ENTITY_NAME,
        GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_PARAMS),
        GetGlobalOriginalFieldsMap(GLOBAL_KEY_ORIGINAL_FIELDS),
        contextUser,
        provider
    );
    if (bypass) {
        return results;
    }
    if (!contextUser || !provider) {
        return EmptyPostRunViewResult(results);
    }

    if (params.ResultType === 'count_only') {
        const filterArtifactId = ExtractSingleUuidFieldFromFilter(params.ExtraFilter, 'ArtifactID');
        if (filterArtifactId && (results.TotalRowCount ?? 0) > 0) {
            try {
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    filterArtifactId,
                    contextUser
                );
                if (perms.CanRead) {
                    return results;
                }
            } catch (error) {
                LogError(
                    `ArtifactPermissionPostRunViewHook failed resolving count_only CanRead for artifact ${filterArtifactId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }
        return EmptyPostRunViewResult(results);
    }

    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        return results;
    }

    const rawRows = results.Results as ArtifactPermissionViewRow[];
    const missingIds: string[] = [];
    for (const row of rawRows) {
        if (!readRowUuid(row, 'ArtifactID')) {
            const id = readRowUuid(row, 'ID');
            if (id) {
                missingIds.push(id);
            }
        }
    }

    const hydratedArtifactIds =
        missingIds.length > 0 ? await batchHydrateArtifactIdsByPermIds(provider, missingIds) : new Map<string, string>();

    const canReadByArtifact = new Map<string, boolean>();
    const keptRows: ArtifactPermissionViewRow[] = [];

    for (const row of rawRows) {
        let artifactId = readRowUuid(row, 'ArtifactID');
        if (!artifactId) {
            const rowId = readRowUuid(row, 'ID');
            if (rowId && IsValidUUID(rowId)) {
                artifactId = hydratedArtifactIds.get(NormalizeUUID(rowId)) ?? null;
            }
        }
        if (!artifactId || !IsValidUUID(artifactId)) {
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
                    `ArtifactPermissionPostRunViewHook failed resolving CanRead for artifact ${artifactId}: ${
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

    const removedCount = rawRows.length - keptRows.length;
    const isPaged = (results.TotalRowCount ?? rawRows.length) > rawRows.length;
    if (removedCount === 0 && !originalFields && !isPaged) {
        return results;
    }

    return {
        ...results,
        Results: keptRows,
        RowCount: keptRows.length,
        TotalRowCount: isPaged
            ? keptRows.length
            : Math.max(0, (results.TotalRowCount ?? rawRows.length) - removedCount)
    };
};

export function EnsureArtifactPermissionReadHookRegistered(): void {
    EnsureHooksRegistered(ArtifactPermissionPreRunViewHook, ArtifactPermissionPostRunViewHook);
}

EnsureArtifactPermissionReadHookRegistered();

/**
 * Server-side entity subclass for `MJ: Artifact Permissions`.
 *
 * Extends {@link MJArtifactPermissionEntityExtended} (preserving its `Save` and `Delete`
 * `CanShare` / grant-ceiling / immutability checks) with server-side `CanRead` enforcement on
 * `Load` / `InnerLoad` and `PreRunView` / `PostRunView`.
 */
@RegisterClass(BaseEntity, 'MJ: Artifact Permissions')
export class MJArtifactPermissionEntityServer extends MJArtifactPermissionEntityExtended {
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
            if (!actor || !provider || !this.ArtifactID || !IsValidUUID(this.ArtifactID)) {
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
        }

        return true;
    }
}

export function LoadMJArtifactPermissionEntityServer(): void {
    EnsureArtifactPermissionReadHookRegistered();
}
