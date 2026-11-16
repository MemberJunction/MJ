import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityInfo,
    GetDataHooks,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    Metadata,
    PlatformSQL,
    PostRunViewHook,
    PreRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    MJArtifactGuestShareLinkEntity,
    UserViewEngine,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
    GetGlobalObjectStore,
    IsValidUUID,
    NormalizeUUID,
    UUIDsEqual
} from '@memberjunction/global';

/**
 * Shared security helpers for server-side artifact & collection entity subclasses
 * and their `PreRunView` / `PostRunView` hooks.
 */

/**
 * Canonical list of the 9 artifact & collection entities whose reads depend on
 * `PostRunView` row-level ACL hooks and must therefore be blocked from unscoped
 * generic SQL / aggregate / differential bypasses.
 */
export const ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES: readonly string[] = [
    'MJ: Artifacts',
    'MJ: Artifact Versions',
    'MJ: Artifact Version Attributes',
    'MJ: Artifact Permissions',
    'MJ: Collection Artifacts',
    'MJ: Collection Permissions',
    'MJ: Collections',
    'MJ: Artifact Working States',
    'MJ: Artifact Guest Share Links'
];

/**
 * Registers all 9 artifact/collection entities in MJCore's global `PostRunView`
 * protected entity registry. Safe to call multiple times (idempotent).
 */
export function RegisterArtifactPostRunViewProtectedEntityRegistry(): void {
    for (const entityName of ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES) {
        RegisterPostRunViewProtectedEntity(entityName);
    }
}

export function GetGlobalWeakSet(globalKey: string): WeakSet<object> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[globalKey];
        if (existing instanceof WeakSet) {
            return existing;
        }
        const created = new WeakSet<object>();
        store[globalKey] = created;
        return created;
    }
    return new WeakSet<object>();
}

export function GetGlobalOriginalFieldsMap(globalKey: string): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[globalKey];
        if (existing instanceof WeakMap) {
            return existing as WeakMap<RunViewParams, string[]>;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[globalKey] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

export function IsServerSystemUser(user: UserInfo | undefined | null): boolean {
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

export function ResolveMetadataProvider(
    entityProvider: IEntityDataProvider | IMetadataProvider | null | undefined,
    actor: UserInfo | null | undefined
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

const GLOBAL_KEY_INTERNAL_HELPER_PARAMS = '__MJ_ARTIFACT_HOOK_HELPER_INTERNAL_PARAMS__';
const GLOBAL_KEY_PRE_RESOLVED_IDS = '__MJ_ARTIFACT_PRE_RESOLVED_IDS_BY_PARAMS__';
const MAX_SQL_SCOPED_IN_IDS = 5000;
const SQL_IN_CHUNK_SIZE = 500;

function getPreResolvedIdsWeakMap(): WeakMap<RunViewParams, Map<string, boolean>> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_PRE_RESOLVED_IDS];
        if (existing instanceof WeakMap) {
            return existing as WeakMap<RunViewParams, Map<string, boolean>>;
        }
        const created = new WeakMap<RunViewParams, Map<string, boolean>>();
        store[GLOBAL_KEY_PRE_RESOLVED_IDS] = created;
        return created;
    }
    return new WeakMap<RunViewParams, Map<string, boolean>>();
}

/**
 * Returns and deletes any per-`params` ACL decisions cached during {@link PrepareScopedPreRunView}
 * (for single-UUID queries) so `PostRunView` does not issue redundant `ResolvePermissions` calls.
 */
export function ConsumePreResolvedIdsForParams(params: RunViewParams): Map<string, boolean> | undefined {
    if (!params) {
        return undefined;
    }
    const map = getPreResolvedIdsWeakMap();
    const entry = map.get(params);
    if (entry) {
        map.delete(params);
    }
    return entry;
}

function canonicalizeEntityName(name: string, provider?: IMetadataProvider | null): string {
    const trimmed = name.trim();
    if (!trimmed) {
        return '';
    }
    const entity = provider?.EntityByName?.(trimmed) ??
        provider?.Entities?.find((e) => e.Name.trim().toLowerCase() === trimmed.toLowerCase());
    return entity ? entity.Name : trimmed;
}

export function EntityNamesMatch(
    actualName: string | null | undefined,
    expectedName: string,
    provider?: IMetadataProvider | null
): boolean {
    if (!actualName) {
        return false;
    }
    const actualCanon = canonicalizeEntityName(actualName, provider).trim().toLowerCase();
    const expectedCanon = canonicalizeEntityName(expectedName, provider).trim().toLowerCase();
    return actualCanon === expectedCanon;
}

function getUserViewEntityName(viewEntity: MJUserViewEntity | undefined): string | null {
    const viewEntityName = viewEntity?.Entity;
    return typeof viewEntityName === 'string' && viewEntityName.trim().length > 0
        ? viewEntityName.trim()
        : null;
}

export function ResolveTargetEntityName(
    params: RunViewParams,
    provider?: IMetadataProvider | null
): string | null {
    const md = provider ?? ResolveMetadataProvider(null, null);
    const rawEntityName =
        typeof params.EntityName === 'string' && params.EntityName.trim().length > 0
            ? params.EntityName.trim()
            : null;
    const viewEntity = params.ViewEntity as MJUserViewEntity | undefined;
    const viewEntityName = getUserViewEntityName(viewEntity);

    if (rawEntityName && viewEntityName && !EntityNamesMatch(rawEntityName, viewEntityName, md)) {
        throw new Error(
            `RunView EntityName ('${rawEntityName}') does not match view entity ('${viewEntityName}').`
        );
    }

    if (rawEntityName) {
        return canonicalizeEntityName(rawEntityName, md);
    }
    if (viewEntityName) {
        return canonicalizeEntityName(viewEntityName, md);
    }
    if (params.ViewID && md) {
        const cachedViews = UserViewEngine.Instance?.Loaded ? UserViewEngine.Instance.AllViews : undefined;
        const cachedView = cachedViews?.find((v) => UUIDsEqual(v.ID, params.ViewID!));
        if (cachedView?.Entity) {
            return canonicalizeEntityName(cachedView.Entity, md);
        }
    }
    if (params.ViewName && md) {
        const cachedViews = UserViewEngine.Instance?.Loaded ? UserViewEngine.Instance.AllViews : undefined;
        const cachedView = cachedViews?.find(
            (v) => v.Name?.trim().toLowerCase() === params.ViewName!.trim().toLowerCase()
        );
        if (cachedView?.Entity) {
            return canonicalizeEntityName(cachedView.Entity, md);
        }
        const entity = md.EntityByName?.(params.ViewName.trim());
        if (entity) {
            return entity.Name;
        }
    }
    return null;
}

export async function ResolveTargetEntityNameAsync(
    params: RunViewParams,
    provider: IMetadataProvider | null,
    contextUser?: UserInfo
): Promise<string | null> {
    const syncResolved = ResolveTargetEntityName(params, provider);
    const hasViewRef = Boolean(params.ViewID || params.ViewName);
    if (!hasViewRef || !provider || provider.ProviderType !== 'Database') {
        return syncResolved;
    }

    // Even if EntityName was passed, validate ViewID/ViewName agreement against User Views when on DB provider (`B1`).
    let viewEntityName = getUserViewEntityName(params.ViewEntity as MJUserViewEntity | undefined);
    if (!viewEntityName) {
        const cachedViews = UserViewEngine.Instance?.Loaded ? UserViewEngine.Instance.AllViews : undefined;
        if (params.ViewID) {
            const cached = cachedViews?.find((v) => UUIDsEqual(v.ID, params.ViewID!));
            viewEntityName = cached?.Entity?.trim() || null;
        } else if (params.ViewName) {
            const cached = cachedViews?.find(
                (v) => v.Name?.trim().toLowerCase() === params.ViewName!.trim().toLowerCase()
            );
            viewEntityName = cached?.Entity?.trim() || null;
        }
    }

    if (!viewEntityName && (params.ViewID || params.ViewName)) {
        const internalSet = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_HELPER_PARAMS);
        const queryActor = contextUser ?? (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? undefined;
        const filter = params.ViewID && IsValidUUID(params.ViewID.trim())
            ? `ID='${EscapeSQLString(params.ViewID.trim())}'`
            : params.ViewName
                ? `Name='${EscapeSQLString(params.ViewName.trim())}'`
                : '';
        if (filter) {
            try {
                const lookupParams: RunViewParams = {
                    EntityName: 'MJ: User Views',
                    ExtraFilter: filter,
                    Fields: ['ID', 'Entity'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                };
                internalSet.add(lookupParams);
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(lookupParams);
                const rv = RunView.FromMetadataProvider(provider);
                const res = await rv.RunView<{ ID?: string; Entity?: string }>(lookupParams, queryActor);
                if (res.Success && res.Results?.[0]?.Entity) {
                    viewEntityName = res.Results[0].Entity.trim();
                }
            } catch {
                // Fall back to sync resolution if view lookup is unavailable in mocked providers
            }
        }
    }

    if (syncResolved && viewEntityName && !EntityNamesMatch(syncResolved, viewEntityName, provider)) {
        throw new Error(
            `RunView EntityName ('${syncResolved}') does not match view entity ('${viewEntityName}').`
        );
    }

    return syncResolved ?? (viewEntityName ? canonicalizeEntityName(viewEntityName, provider) : null);
}

/**
 * Resolves canonical {@link EntityInfo} and rejects any `EntityName` vs `ViewID`/`ViewName`/`ViewEntity`
 * disagreement (`B1`). Also supports ISA parent chain checking via `EntityInfo`.
 */
export async function ResolveTargetEntityInfo(
    params: RunViewParams,
    provider: IMetadataProvider | null,
    contextUser?: UserInfo
): Promise<EntityInfo | null> {
    const resolvedName = await ResolveTargetEntityNameAsync(params, provider, contextUser);
    if (!resolvedName || !provider) {
        return null;
    }
    return (
        provider.EntityByName?.(resolvedName) ??
        provider.Entities?.find((e) => e.Name.trim().toLowerCase() === resolvedName.trim().toLowerCase()) ??
        null
    );
}

export function AppendSqlAndFilter(
    existingFilter: string | PlatformSQL | undefined,
    clause: string
): string | PlatformSQL {
    if (!existingFilter) {
        return clause;
    }
    if (typeof existingFilter === 'string') {
        const trimmed = existingFilter.trim();
        return trimmed ? `(${trimmed}) AND (${clause})` : clause;
    }
    return {
        default: existingFilter.default?.trim()
            ? `(${existingFilter.default.trim()}) AND (${clause})`
            : clause,
        ...(existingFilter.sqlserver?.trim()
            ? { sqlserver: `(${existingFilter.sqlserver.trim()}) AND (${clause})` }
            : {}),
        ...(existingFilter.postgresql?.trim()
            ? { postgresql: `(${existingFilter.postgresql.trim()}) AND (${clause})` }
            : {})
    };
}

export function BuildUuidInScopeClause(columnName: string, ids: ReadonlySet<string>): string | null {
    const validIds: string[] = [];
    for (const id of ids) {
        const trimmed = id.trim();
        if (IsValidUUID(trimmed)) {
            validIds.push(`'${EscapeSQLString(trimmed)}'`);
        }
    }
    if (validIds.length === 0) {
        return '1 = 0';
    }
    if (validIds.length > MAX_SQL_SCOPED_IN_IDS) {
        return null;
    }
    const chunks = ChunkUuidList(validIds, SQL_IN_CHUNK_SIZE);
    if (chunks.length === 1) {
        return `${columnName} IN (${chunks[0].join(',')})`;
    }
    return `(${chunks.map((c) => `${columnName} IN (${c.join(',')})`).join(' OR ')})`;
}

export interface ScopedPreRunViewPredicate {
    IdColumnName: string;
    ResolveReadableIds: (
        provider: IMetadataProvider,
        contextUser: UserInfo
    ) => Promise<ReadonlySet<string> | null>;
    CheckSingleIdReadable?: (
        provider: IMetadataProvider,
        id: string,
        contextUser: UserInfo
    ) => Promise<boolean>;
}

export interface ScopedPreRunViewConfig {
    TargetEntityName: string;
    RequiredFields: readonly string[];
    IdColumnName: string;
    InternalParams: WeakSet<object>;
    OriginalFieldsMap: WeakMap<RunViewParams, string[]>;
    SqlScopedParams: WeakSet<object>;
    ResolveReadableIds: (
        provider: IMetadataProvider,
        contextUser: UserInfo
    ) => Promise<ReadonlySet<string> | null>;
    CheckSingleIdReadable?: (
        provider: IMetadataProvider,
        id: string,
        contextUser: UserInfo
    ) => Promise<boolean>;
    ExtraPredicates?: readonly ScopedPreRunViewPredicate[];
}

/**
 * Shared `PreRunView` implementation for protected artifact/collection entities (`B1`, `B2`):
 * - Resolves target entity case-insensitively and across `ViewID`/`ViewName`/`ViewEntity` (rejecting mismatches).
 * - Augments narrow `Fields` with ACL-required columns (shallow-copied, never mutating caller object).
 * - Injects a SQL `ExtraFilter` predicate scoping `IdColumnName` BEFORE `TOP` / `COUNT(*)` so
 *   `MaxRows` paging and `ResultType: 'count_only'` are exact.
 */
export async function PrepareScopedPreRunView(
    params: RunViewParams,
    config: ScopedPreRunViewConfig,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): Promise<RunViewParams> {
    const resolvedProvider = ResolveMetadataProvider(provider, contextUser);
    if (
        !params ||
        config.InternalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        IsServerSystemUser(contextUser) ||
        (!contextUser && resolvedProvider !== null && resolvedProvider.ProviderType !== 'Database')
    ) {
        return params;
    }

    const resolvedName = await ResolveTargetEntityNameAsync(params, resolvedProvider, contextUser);
    if (!EntityNamesMatch(resolvedName, config.TargetEntityName, resolvedProvider)) {
        return params;
    }

    let updatedParams: RunViewParams = PrepareRequiredFieldsPreRunView(
        params,
        config.TargetEntityName,
        config.RequiredFields,
        config.InternalParams,
        config.OriginalFieldsMap,
        contextUser,
        resolvedProvider ?? undefined
    );

    if (!contextUser) {
        updatedParams = {
            ...updatedParams,
            ExtraFilter: AppendSqlAndFilter(updatedParams.ExtraFilter, '1 = 0')
        };
        if (updatedParams !== params && config.OriginalFieldsMap.has(params)) {
            config.OriginalFieldsMap.set(updatedParams, config.OriginalFieldsMap.get(params)!);
        }
        config.SqlScopedParams.add(updatedParams);
        return updatedParams;
    }

    if (resolvedProvider && typeof (resolvedProvider as { RunView?: unknown }).RunView === 'function') {
        const predicates: ScopedPreRunViewPredicate[] = [
            {
                IdColumnName: config.IdColumnName,
                ResolveReadableIds: config.ResolveReadableIds,
                CheckSingleIdReadable: config.CheckSingleIdReadable
            },
            ...(config.ExtraPredicates ?? [])
        ];
        const clauses: string[] = [];
        let allClausesBuilt = true;
        let preResolvedEntry: Map<string, boolean> | undefined;

        for (const pred of predicates) {
            const singleId = pred.CheckSingleIdReadable
                ? ExtractSingleUuidFieldFromFilter(updatedParams.ExtraFilter, pred.IdColumnName)
                : null;
            if (singleId && pred.CheckSingleIdReadable) {
                const allowed = await pred.CheckSingleIdReadable(resolvedProvider, singleId, contextUser);
                if (!preResolvedEntry) {
                    preResolvedEntry = new Map<string, boolean>();
                }
                preResolvedEntry.set(NormalizeUUID(singleId), allowed);
                if (!allowed) {
                    clauses.push('1 = 0');
                    break;
                }
                continue;
            }

            const readableIds = await pred.ResolveReadableIds(resolvedProvider, contextUser);
            if (readableIds === null) {
                allClausesBuilt = false;
                continue;
            }
            const scopeClause = BuildUuidInScopeClause(pred.IdColumnName, readableIds);
            if (scopeClause) {
                clauses.push(scopeClause);
                if (scopeClause === '1 = 0') {
                    break;
                }
            } else {
                allClausesBuilt = false;
            }
        }
        if (clauses.length > 0) {
            const combinedClause = clauses.length === 1 ? clauses[0] : clauses.map((c) => `(${c})`).join(' AND ');
            const priorOrigFields = config.OriginalFieldsMap.get(updatedParams);
            updatedParams = {
                ...updatedParams,
                ExtraFilter: AppendSqlAndFilter(updatedParams.ExtraFilter, combinedClause)
            };
            if (priorOrigFields) {
                config.OriginalFieldsMap.set(updatedParams, priorOrigFields);
            }
            if (allClausesBuilt || clauses.includes('1 = 0')) {
                config.SqlScopedParams.add(updatedParams);
            }
        } else if (allClausesBuilt) {
            config.SqlScopedParams.add(updatedParams);
        }
        if (preResolvedEntry) {
            getPreResolvedIdsWeakMap().set(updatedParams, preResolvedEntry);
        }
    }

    return updatedParams;
}

/**
 * Shared `PostRunView` row-count & `TotalRowCount` adjuster (`B2`):
 * - When `SqlScopedParams.has(params)` is true AND `removedCount === 0`, preserves the DB-computed
 *   `TotalRowCount` (fixing paged `MaxRows` truncation AND exact `count_only` queries).
 * - When `PostRunView` removed rows or `SqlScoped` was absent on an empty/`count_only` result,
 *   clamps/recomputes safely so unauthorized counts never leak.
 */
export function FinalizePostRunViewResult<T extends object>(
    params: RunViewParams,
    results: RunViewResult,
    filteredRows: T[],
    originalRowCount: number,
    sqlScopedParams: WeakSet<object>
): RunViewResult {
    const isSqlScoped = Boolean(params && sqlScopedParams.has(params));
    if (params) {
        sqlScopedParams.delete(params);
    }

    if (originalRowCount === 0) {
        if (!isSqlScoped && (results.TotalRowCount ?? 0) > 0) {
            return {
                ...results,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0
            };
        }
        return {
            ...results,
            RowCount: 0
        };
    }

    const removedCount = originalRowCount - filteredRows.length;
    if (removedCount === 0 && isSqlScoped) {
        return {
            ...results,
            Results: filteredRows,
            RowCount: filteredRows.length,
            TotalRowCount: results.TotalRowCount ?? filteredRows.length
        };
    }

    const isPaged = (results.TotalRowCount ?? originalRowCount) > originalRowCount;
    return {
        ...results,
        Results: filteredRows,
        RowCount: filteredRows.length,
        TotalRowCount: isPaged
            ? filteredRows.length
            : Math.max(0, (results.TotalRowCount ?? originalRowCount) - removedCount)
    };
}

/**
 * Cascades deletion of any `MJ: Artifact Guest Share Links` matching `extraFilter` (and revokes linked
 * `MJ: Magic Link Invites`) prior to deleting an `MJ: Artifacts` or `MJ: Artifact Versions` record (`S8`).
 */
export async function CascadeDeleteArtifactGuestShareLinks(
    provider: IMetadataProvider | null,
    extraFilter: string,
    actor: UserInfo | undefined
): Promise<{ Success: boolean; ErrorMessage?: string }> {
    if (!provider || typeof (provider as { RunView?: unknown }).RunView !== 'function') {
        return { Success: true };
    }
    const systemUser =
        (IsServerSystemUser(actor) ? actor : undefined) ??
        (await WellKnownUserSource.Instance.GetSystemUser(provider)) ??
        actor;
    if (!systemUser) {
        return { Success: true };
    }
    const internalSet = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_HELPER_PARAMS);
    const queryParams: RunViewParams = {
        EntityName: 'MJ: Artifact Guest Share Links',
        ExtraFilter: extraFilter,
        Fields: ['ID', 'MagicLinkInviteID'],
        SkipTotalRowCount: true,
        ResultType: 'simple'
    };
    internalSet.add(queryParams);
    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(queryParams);
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID?: string; MagicLinkInviteID?: string | null }>(queryParams, systemUser);
    if (!res.Success) {
        return {
            Success: false,
            ErrorMessage: res.ErrorMessage || 'Failed to check referencing artifact guest share links before delete.'
        };
    }

    for (const row of res.Results ?? []) {
        if (row.MagicLinkInviteID && IsValidUUID(row.MagicLinkInviteID)) {
            try {
                const inviteEntity = await provider.GetEntityObject('MJ: Magic Link Invites', systemUser);
                if (inviteEntity && (await inviteEntity.InnerLoad(CompositeKey.FromID(row.MagicLinkInviteID)))) {
                    const status = inviteEntity.Get('Status');
                    if (status === 'Active') {
                        inviteEntity.Set('Status', 'Revoked');
                        inviteEntity.Set('RevokedAt', new Date());
                        if (actor?.ID) {
                            inviteEntity.Set('RevokedByUserID', actor.ID);
                        }
                        await inviteEntity.Save();
                    }
                }
            } catch (err) {
                LogError(
                    `CascadeDeleteArtifactGuestShareLinks warning revoking invite '${row.MagicLinkInviteID}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }
        if (row.ID && IsValidUUID(row.ID)) {
            const linkEntity = await provider.GetEntityObject<MJArtifactGuestShareLinkEntity>(
                'MJ: Artifact Guest Share Links',
                systemUser
            );
            if (linkEntity && (await linkEntity.Load(row.ID))) {
                const deleted = await linkEntity.Delete();
                if (!deleted) {
                    const msg = linkEntity.LatestResult?.Message ?? `Failed to delete referencing guest share link '${row.ID}'.`;
                    return { Success: false, ErrorMessage: msg };
                }
            }
        }
    }
    return { Success: true };
}

export function ExtractSingleUuidFieldFromFilter(
    extraFilter: string | PlatformSQL | undefined,
    columnName: string
): string | null {
    if (typeof extraFilter !== 'string' || !extraFilter.trim()) {
        return null;
    }
    const trimmed = extraFilter.trim().replace(/^\((.*)\)$/, '$1').trim();
    const escapedCol = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `^(?:\\[?${escapedCol}\\]?)\\s*=\\s*'([^']+)'$`,
        'i'
    );
    const match = trimmed.match(pattern);
    if (!match || !match[1]) {
        return null;
    }
    const candidate = match[1].trim();
    return IsValidUUID(candidate) ? candidate : null;
}

export function ChunkUuidList(values: readonly string[], size: number): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < values.length; i += size) {
        out.push(values.slice(i, i + size));
    }
    return out;
}

export function PrepareRequiredFieldsPreRunView(
    params: RunViewParams,
    targetEntityName: string,
    requiredFields: readonly string[],
    internalParams: WeakSet<object>,
    originalFieldsMap: WeakMap<RunViewParams, string[]>,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
): RunViewParams {
    const resolvedProvider = ResolveMetadataProvider(provider, contextUser);
    if (
        !params ||
        internalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        !EntityNamesMatch(ResolveTargetEntityName(params, resolvedProvider), targetEntityName, resolvedProvider) ||
        IsServerSystemUser(contextUser) ||
        (!contextUser && resolvedProvider !== null && resolvedProvider.ProviderType !== 'Database')
    ) {
        return params;
    }

    if (Array.isArray(params.Fields) && params.Fields.length > 0) {
        const lowerSet = new Set(params.Fields.map((f) => f.trim().toLowerCase()));
        const missing = requiredFields.filter((req) => !lowerSet.has(req.toLowerCase()));
        if (missing.length > 0) {
            const priorOriginalFields = originalFieldsMap.get(params) ?? [...params.Fields];
            const updatedParams: RunViewParams = {
                ...params,
                Fields: [...params.Fields, ...missing]
            };
            originalFieldsMap.set(updatedParams, priorOriginalFields);
            return updatedParams;
        }
    }

    return params;
}

export function ShouldBypassPostRunView(
    params: RunViewParams,
    targetEntityName: string,
    internalParams: WeakSet<object>,
    originalFieldsMap: WeakMap<RunViewParams, string[]>,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | null
): { bypass: boolean; originalFields: string[] | undefined } {
    const originalFields = params ? originalFieldsMap.get(params) : undefined;
    if (params && originalFields) {
        originalFieldsMap.delete(params);
    }
    if (
        !params ||
        internalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        !EntityNamesMatch(ResolveTargetEntityName(params, provider), targetEntityName, provider) ||
        IsServerSystemUser(contextUser) ||
        (!contextUser && provider !== null && provider.ProviderType !== 'Database')
    ) {
        return { bypass: true, originalFields };
    }
    return { bypass: false, originalFields };
}

export async function ShouldBypassPostRunViewAsync(
    params: RunViewParams,
    targetEntityName: string,
    internalParams: WeakSet<object>,
    originalFieldsMap: WeakMap<RunViewParams, string[]>,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | null
): Promise<{ bypass: boolean; originalFields: string[] | undefined }> {
    const originalFields = params ? originalFieldsMap.get(params) : undefined;
    if (params && originalFields) {
        originalFieldsMap.delete(params);
    }
    if (
        !params ||
        internalParams.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        IsServerSystemUser(contextUser) ||
        (!contextUser && provider !== null && provider.ProviderType !== 'Database')
    ) {
        return { bypass: true, originalFields };
    }
    const resolvedName = await ResolveTargetEntityNameAsync(params, provider, contextUser);
    if (!EntityNamesMatch(resolvedName, targetEntityName, provider)) {
        return { bypass: true, originalFields };
    }
    return { bypass: false, originalFields };
}

/**
 * Resolves the set of `MJ: Artifact Versions.ID` values whose parent `ArtifactID` is in
 * `ArtifactPermissionEngine.BuildReadableArtifactIdSet(provider, user)`. Used for SQL-scoping
 * `MJ: Artifact Version Attributes` (`ArtifactVersionID`) and `MJ: Collection Artifacts` (`B2`).
 */
export async function ResolveReadableArtifactVersionIdsForUser(
    provider: IMetadataProvider,
    user: UserInfo
): Promise<Set<string>> {
    const readableArtifacts = await ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(
        provider,
        user
    );
    const versionIds = new Set<string>();
    if (readableArtifacts.size === 0 || typeof (provider as { RunView?: unknown }).RunView !== 'function') {
        return versionIds;
    }
    const queryActor =
        provider.ProviderType === 'Database'
            ? (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? user
            : user;
    const internalSet = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_HELPER_PARAMS);
    const rv = RunView.FromMetadataProvider(provider);
    for (const chunk of ChunkUuidList(Array.from(readableArtifacts), SQL_IN_CHUNK_SIZE)) {
        const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const verParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID IN (${inList})`,
            Fields: ['ID'],
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        internalSet.add(verParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(verParams);
        const res = await rv.RunView<{ ID?: string }>(verParams, queryActor);
        if (res.Success && res.Results) {
            for (const row of res.Results) {
                if (row.ID && IsValidUUID(row.ID)) {
                    versionIds.add(NormalizeUUID(row.ID));
                }
            }
        }
    }
    return versionIds;
}

export function EnsureHooksRegistered(
    preHook: PreRunViewHook,
    postHook: PostRunViewHook
): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(preHook)) {
        RegisterDataHook('PreRunView', preHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(postHook)) {
        RegisterDataHook('PostRunView', postHook);
    }
}

export function GetOldStringFieldValue(entity: BaseEntity, fieldName: string): string | null {
    const field =
        (Array.isArray(entity.Fields) ? entity.Fields.find((f) => f.Name === fieldName) : undefined) ??
        entity.GetFieldByName(fieldName);
    const raw = field?.OldValue;
    if (raw === null || raw === undefined) {
        return null;
    }
    const str = String(raw).trim();
    return str.length > 0 ? str : null;
}

export function NormalizeNullableGuidOrString(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function UuidsOrNullEqual(a: string | null, b: string | null): boolean {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return UUIDsEqual(a, b);
}

export function FailEntityOperation(
    entity: BaseEntity,
    type: 'create' | 'update' | 'delete',
    message: string
): boolean {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = type;
    result.Message = message;
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    if (typeof entity.RegisterResultHistoryEntry === 'function') {
        entity.RegisterResultHistoryEntry(result);
    } else if (Array.isArray(entity.ResultHistory)) {
        entity.ResultHistory.push(result);
    }
    return false;
}

export function EmptyPostRunViewResult(results: RunViewResult): RunViewResult {
    return {
        ...results,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0
    };
}

export function StripSyntheticFieldsFromRow<T extends object>(
    row: T,
    originalFields: readonly string[] | undefined
): T {
    if (!originalFields || row instanceof BaseEntity) {
        return row;
    }
    const keepLower = new Set(originalFields.map((f) => f.trim().toLowerCase()));
    const copy = { ...row };
    for (const key of Object.keys(copy) as Array<keyof T>) {
        if (!keepLower.has(String(key).toLowerCase())) {
            delete copy[key];
        }
    }
    return copy;
}
