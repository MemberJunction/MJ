import {
    BaseEntity,
    BaseEntityResult,
    EntityInfo,
    GetDataHooks,
    GetEffectiveAlternateBaseViewName,
    IEntityDataProvider,
    IMetadataProvider,
    IsMaterializedDataSource,
    LogError,
    Metadata,
    PlatformSQL,
    PostRunViewHook,
    PreRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    ResolveAlternateBaseView,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    BaseArtifactPermissionDelegate,
    MJArtifactGuestShareLinkEntity,
    MJArtifactVersionAttributeEntity,
    MJMagicLinkInviteEntity,
    UserViewEngine,
    ViewInfo,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
    GetGlobalObjectStore,
    IsValidUUID,
    MJGlobal,
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
const MAX_SQL_SET_BASED_IDS = 50_000;
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
        if (!filter) {
            throw new Error('Permission denied: RunView view reference could not be resolved.');
        }
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
        if (!res.Success) {
            throw new Error(
                `Permission denied: unable to resolve target entity for RunView view reference (${res.ErrorMessage || 'view lookup failed'}).`
            );
        }
        if (res.Results?.[0]?.Entity) {
            viewEntityName = res.Results[0].Entity.trim();
        }
    }

    if (syncResolved && viewEntityName && !EntityNamesMatch(syncResolved, viewEntityName, provider)) {
        throw new Error(
            `RunView EntityName ('${syncResolved}') does not match view entity ('${viewEntityName}').`
        );
    }

    const resolved = syncResolved ?? (viewEntityName ? canonicalizeEntityName(viewEntityName, provider) : null);
    if (!resolved && (params.EntityName || params.ViewID || params.ViewName || params.ViewEntity)) {
        throw new Error('Permission denied: target entity for RunView could not be resolved.');
    }
    return resolved;
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

function assertBalancedSqlFilter(filter: string): void {
    let parenDepth = 0;
    let inSingleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < filter.length; i++) {
        const ch = filter[i];
        const next = filter[i + 1];
        if (inLineComment) {
            if (ch === '\n' || ch === '\r') {
                inLineComment = false;
            }
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inSingleQuote) {
            if (ch === "'") {
                if (next === "'") {
                    i++;
                } else {
                    inSingleQuote = false;
                }
            }
            continue;
        }
        if (ch === '-' && next === '-') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === "'") {
            inSingleQuote = true;
            continue;
        }
        if (ch === '(') {
            parenDepth++;
        } else if (ch === ')') {
            parenDepth--;
            if (parenDepth < 0) {
                throw new Error('Invalid ExtraFilter: unbalanced parentheses.');
            }
        }
    }
    if (inSingleQuote || inBlockComment || parenDepth !== 0) {
        throw new Error('Invalid ExtraFilter: unbalanced quotes or parentheses.');
    }
}

export function AppendSqlAndFilter(
    existingFilter: string | PlatformSQL | undefined,
    clause: string
): string | PlatformSQL {
    if (!existingFilter) {
        return clause;
    }
    const wrap = (raw: string | undefined): string => {
        const trimmed = raw?.trim();
        if (!trimmed) {
            return clause;
        }
        assertBalancedSqlFilter(trimmed);
        return `(${trimmed}) AND (${clause})`;
    };
    if (typeof existingFilter === 'string') {
        return wrap(existingFilter);
    }
    return {
        default: wrap(existingFilter.default),
        ...(existingFilter.sqlserver?.trim()
            ? { sqlserver: wrap(existingFilter.sqlserver) }
            : {}),
        ...(existingFilter.postgresql?.trim()
            ? { postgresql: wrap(existingFilter.postgresql) }
            : {})
    };
}

export function BuildUuidInScopeClause(
    columnName: string,
    ids: ReadonlySet<string>,
    provider?: IMetadataProvider | null
): string | null {
    const validRawIds: string[] = [];
    const quotedIds: string[] = [];
    for (const id of ids) {
        const trimmed = id.trim();
        if (IsValidUUID(trimmed)) {
            validRawIds.push(trimmed);
            quotedIds.push(`'${EscapeSQLString(trimmed)}'`);
        }
    }
    if (quotedIds.length === 0) {
        return '1 = 0';
    }
    if (quotedIds.length <= MAX_SQL_SCOPED_IN_IDS) {
        const chunks = ChunkUuidList(quotedIds, SQL_IN_CHUNK_SIZE);
        if (chunks.length === 1) {
            return `${columnName} IN (${chunks[0].join(',')})`;
        }
        return `(${chunks.map((c) => `${columnName} IN (${c.join(',')})`).join(' OR ')})`;
    }
    if (quotedIds.length > MAX_SQL_SET_BASED_IDS) {
        return null;
    }
    // Set-based predicate for large workspaces (5,001..50,000 IDs) avoiding SQL Server 8623 literal-list overflow (`R7-4`)
    const { isPg } = sqlPlatformHelpers(provider);
    if (isPg) {
        const normalizedLower = validRawIds.map((id) => id.toLowerCase());
        const jsonPayload = EscapeSQLString(JSON.stringify(normalizedLower));
        return `LOWER(CAST(${columnName} AS TEXT)) IN (SELECT elem FROM jsonb_array_elements_text('${jsonPayload}'::jsonb) AS elem)`;
    }
    const csvPayload = EscapeSQLString(validRawIds.join(','));
    return `${columnName} IN (SELECT [value] FROM STRING_SPLIT(CAST('${csvPayload}' AS NVARCHAR(MAX)), N','))`;
}

export type CollectionIdSetCache = Map<'readable' | 'shareOrDelete', Promise<Set<string> | null>>;

export interface ScopedPreRunViewPredicate {
    IdColumnName: string;
    ResolveReadableIds?: (
        provider: IMetadataProvider,
        contextUser: UserInfo
    ) => Promise<ReadonlySet<string> | null>;
    BuildSqlPredicate?: (
        provider: IMetadataProvider,
        contextUser: UserInfo,
        targetEntityInfo: EntityInfo | null,
        runViewParams?: RunViewParams
    ) => string;
    BuildSqlPredicateAsync?: (
        provider: IMetadataProvider,
        contextUser: UserInfo,
        targetEntityInfo: EntityInfo | null,
        runViewParams?: RunViewParams,
        collectionCache?: CollectionIdSetCache
    ) => Promise<{ clause: string; isExact: boolean }>;
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
    ResolveReadableIds?: (
        provider: IMetadataProvider,
        contextUser: UserInfo
    ) => Promise<ReadonlySet<string> | null>;
    BuildSqlPredicate?: (
        provider: IMetadataProvider,
        contextUser: UserInfo,
        targetEntityInfo: EntityInfo | null,
        runViewParams?: RunViewParams
    ) => string;
    BuildSqlPredicateAsync?: (
        provider: IMetadataProvider,
        contextUser: UserInfo,
        targetEntityInfo: EntityInfo | null,
        runViewParams?: RunViewParams,
        collectionCache?: CollectionIdSetCache
    ) => Promise<{ clause: string; isExact: boolean }>;
    CheckSingleIdReadable?: (
        provider: IMetadataProvider,
        id: string,
        contextUser: UserInfo
    ) => Promise<boolean>;
    ExtraPredicates?: readonly ScopedPreRunViewPredicate[];
}

const MAX_SQL_COLLECTION_ANCESTRY_HOPS = 15;
const MAX_SQL_ARTIFACT_DELEGATE_HOPS = 8;
const MAX_SQL_MULTI_HOP_COLLECTION_IN_IDS = 500;

function resolveCoreSchemaName(provider: IMetadataProvider | null | undefined): string {
    const configSchema =
        provider && 'ConfigData' in provider
            ? (provider as IMetadataProvider & { ConfigData?: { MJCoreSchemaName?: string } }).ConfigData?.MJCoreSchemaName
            : undefined;
    return configSchema?.trim() || '__mj';
}

function sqlPlatformHelpers(provider: IMetadataProvider | null | undefined) {
    const platformKey =
        provider && 'PlatformKey' in provider
            ? (provider as IMetadataProvider & { PlatformKey?: string }).PlatformKey
            : undefined;
    const isPg = platformKey === 'postgresql';
    const coreSchema = resolveCoreSchemaName(provider);
    const q = (ident: string): string => (isPg ? `"${ident}"` : `[${ident}]`);
    const vw = (viewName: string): string => `${q(coreSchema)}.${q(viewName)}`;
    const bTrue = isPg ? 'true' : '1';
    return { isPg, coreSchema, q, vw, bTrue };
}

function resolveCachedUserViewEntity(params: RunViewParams | undefined): MJUserViewEntity | undefined {
    if (!params) {
        return undefined;
    }
    if (params.ViewEntity) {
        return params.ViewEntity as MJUserViewEntity;
    }
    const cachedViews = UserViewEngine.Instance?.Loaded ? UserViewEngine.Instance.AllViews : undefined;
    if (!cachedViews) {
        return undefined;
    }
    if (params.ViewID) {
        return cachedViews.find((v) => UUIDsEqual(v.ID, params.ViewID!));
    }
    if (params.ViewName) {
        const lowerName = params.ViewName.trim().toLowerCase();
        return cachedViews.find((v) => v.Name?.trim().toLowerCase() === lowerName);
    }
    return undefined;
}

/**
 * Qualifies an outer-query column with its entity schema & effective view (honoring `AlternateBaseView`
 * including `effectiveSchemaName`, saved view pins, `DataSource: 'Materialized'`, and custom
 * `MJCoreSchemaName` — `S-f`, `N4`) so correlated `EXISTS` subqueries never bind to inner columns.
 */
export function QualifyOuterEntityColumn(
    entityInfo: EntityInfo | null | undefined,
    defaultBaseView: string,
    columnName: string,
    provider: IMetadataProvider | null | undefined,
    params?: RunViewParams
): string {
    const { coreSchema, q } = sqlPlatformHelpers(provider);
    let schema = (entityInfo?.SchemaName ?? '').trim() || coreSchema;
    let effectiveBaseView = (entityInfo?.BaseView ?? '').trim() || defaultBaseView;

    if (entityInfo && params) {
        const viewEntity = resolveCachedUserViewEntity(params);
        const effectiveAbvName = GetEffectiveAlternateBaseViewName(params, viewEntity);
        if (effectiveAbvName) {
            if (IsMaterializedDataSource(params.DataSource)) {
                throw new Error(
                    `AlternateBaseView '${effectiveAbvName}' on entity '${entityInfo.Name}' cannot be combined with DataSource: 'Materialized'.`
                );
            }
            const resolution = ResolveAlternateBaseView({
                entity: entityInfo,
                alternateBaseViewName: effectiveAbvName,
                suppressDeprecationWarning: true,
                callerName: 'QualifyOuterEntityColumn'
            });
            schema = resolution.effectiveSchemaName || schema;
            effectiveBaseView = resolution.effectiveViewName;
        } else if (
            IsMaterializedDataSource(params.DataSource) &&
            !entityInfo.BaseView?.toLowerCase().startsWith('materialized_vw')
        ) {
            effectiveBaseView = `materialized_vw${entityInfo.CodeName}`;
        }
    }

    return `${q(schema)}.${q(effectiveBaseView)}.${q(columnName)}`;
}

/**
 * Async variant of {@link QualifyOuterEntityColumn} that mirrors `GenericDatabaseProvider.resolveEffectiveBaseViewTarget`
 * (`N4`): loads `ViewEntity` when not cached in `UserViewEngine` and queries `MJ: Materialized Results`
 * so inactive/custom materialized views resolve to the exact SQL view name (`BaseView` vs `ViewName`).
 */
export async function QualifyOuterEntityColumnAsync(
    entityInfo: EntityInfo | null | undefined,
    defaultBaseView: string,
    columnName: string,
    provider: IMetadataProvider | null | undefined,
    params?: RunViewParams,
    contextUser?: UserInfo
): Promise<string> {
    const { coreSchema, q } = sqlPlatformHelpers(provider);
    let schema = (entityInfo?.SchemaName ?? '').trim() || coreSchema;
    let effectiveBaseView = (entityInfo?.BaseView ?? '').trim() || defaultBaseView;

    if (entityInfo && params) {
        let viewEntity = resolveCachedUserViewEntity(params);
        if (
            !viewEntity &&
            typeof params.AlternateBaseView !== 'string' &&
            (params.ViewID || params.ViewName)
        ) {
            try {
                viewEntity = params.ViewID
                    ? await ViewInfo.GetViewEntity(params.ViewID, contextUser)
                    : await ViewInfo.GetViewEntityByName(params.ViewName!, contextUser);
            } catch {
                // Fall back to provider RunView as contextUser when UserViewEngine is unloaded (e.g. unit test mocks)
                if (provider && typeof (provider as { RunView?: unknown }).RunView === 'function') {
                    try {
                        const lookupActor =
                            contextUser ?? (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? undefined;
                        const viewFilter = params.ViewID
                            ? `ID='${EscapeSQLString(params.ViewID)}'`
                            : `Name='${EscapeSQLString(params.ViewName!)}'`;
                        const viewLookupParams: RunViewParams = {
                            EntityName: 'MJ: User Views',
                            ExtraFilter: viewFilter,
                            MaxRows: 1,
                            SkipTotalRowCount: true,
                            ResultType: 'entity_object'
                        };
                        GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_HELPER_PARAMS).add(viewLookupParams);
                        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(viewLookupParams);
                        const viewRes = await RunView.FromMetadataProvider(provider).RunView<MJUserViewEntity>(
                            viewLookupParams,
                            lookupActor
                        );
                        if (viewRes.Success && viewRes.Results?.length) {
                            viewEntity = viewRes.Results[0];
                        }
                    } catch {
                        // Fall back cleanly to base entity schema/view
                    }
                }
            }
        }
        const effectiveAbvName = GetEffectiveAlternateBaseViewName(params, viewEntity);
        if (effectiveAbvName) {
            if (IsMaterializedDataSource(params.DataSource)) {
                throw new Error(
                    `AlternateBaseView '${effectiveAbvName}' on entity '${entityInfo.Name}' cannot be combined with DataSource: 'Materialized'.`
                );
            }
            const resolution = ResolveAlternateBaseView({
                entity: entityInfo,
                alternateBaseViewName: effectiveAbvName,
                contextUser,
                suppressDeprecationWarning: true,
                callerName: 'QualifyOuterEntityColumnAsync'
            });
            schema = resolution.effectiveSchemaName || schema;
            effectiveBaseView = resolution.effectiveViewName;
        } else if (
            IsMaterializedDataSource(params.DataSource) &&
            !entityInfo.BaseView?.toLowerCase().startsWith('materialized_vw')
        ) {
            if (provider && typeof (provider as { RunView?: unknown }).RunView === 'function' && entityInfo.ID && IsValidUUID(entityInfo.ID)) {
                try {
                    const lookupActor =
                        contextUser ?? (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? undefined;
                    const matParams: RunViewParams = {
                        EntityName: 'MJ: Materialized Results',
                        ExtraFilter: `SourceType='EntityBaseView' AND SourceEntityID='${EscapeSQLString(entityInfo.ID)}'`,
                        Fields: ['Status', 'ViewName'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    };
                    GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_HELPER_PARAMS).add(matParams);
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(matParams);
                    const matRes = await RunView.FromMetadataProvider(provider).RunView<{
                        Status?: string;
                        ViewName?: string | null;
                    }>(matParams, lookupActor);
                    const row = matRes.Success && matRes.Results?.length ? matRes.Results[0] : null;
                    if (row?.Status === 'Active') {
                        effectiveBaseView = row.ViewName?.trim() || `materialized_vw${entityInfo.CodeName}`;
                    } else {
                        effectiveBaseView = entityInfo.BaseView || defaultBaseView;
                    }
                } catch {
                    effectiveBaseView = entityInfo.BaseView || defaultBaseView;
                }
            } else {
                effectiveBaseView = `materialized_vw${entityInfo.CodeName}`;
            }
        }
    }

    return `${q(schema)}.${q(effectiveBaseView)}.${q(columnName)}`;
}

/**
 * Builds a dialect-aware SQL `EXISTS` predicate verifying that `collectionIdExpr` is readable
 * (or share/delete-capable when `requireShareOrDelete` is true) by `user` via collection ownership
 * or `MJ: Collection Permissions` across up to 16 levels (`0..15`, `B2`/`R1`/`L1`). Never returns `null`.
 */
export function BuildSqlCollectionReadablePredicate(
    collectionIdExpr: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    options?: {
        requireShareOrDelete?: boolean;
        aliasPrefix?: string;
        precomputedCollectionIds?: ReadonlySet<string> | null;
    }
): string {
    if (!user?.ID || !IsValidUUID(user.ID) || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
        return '1 = 0';
    }
    if (
        options?.precomputedCollectionIds &&
        options.precomputedCollectionIds.size <= MAX_SQL_SCOPED_IN_IDS
    ) {
        return BuildUuidInScopeClause(collectionIdExpr, options.precomputedCollectionIds) ?? '1 = 0';
    }
    const { q, vw, bTrue } = sqlPlatformHelpers(provider);
    const safeUser = EscapeSQLString(user.ID.trim());
    const prefix = options?.aliasPrefix ?? '_sc';
    const joins: string[] = [];
    const ownerChecks: string[] = [`${q(`${prefix}0`)}.${q('OwnerID')} = '${safeUser}'`];
    const colIds: string[] = [`${q(`${prefix}0`)}.${q('ID')}`];

    for (let hop = 1; hop <= MAX_SQL_COLLECTION_ANCESTRY_HOPS; hop++) {
        const prev = q(`${prefix}${hop - 1}`);
        const cur = q(`${prefix}${hop}`);
        joins.push(`LEFT JOIN ${vw('vwCollections')} ${cur} ON ${prev}.${q('ParentID')} = ${cur}.${q('ID')}`);
        ownerChecks.push(`${cur}.${q('OwnerID')} = '${safeUser}'`);
        colIds.push(`${cur}.${q('ID')}`);
    }

    const cpAlias = q(`${prefix}_cp`);
    const permMatch = options?.requireShareOrDelete
        ? `(${cpAlias}.${q('CanShare')} = ${bTrue} OR ${cpAlias}.${q('CanDelete')} = ${bTrue})`
        : `(${cpAlias}.${q('CanRead')} = ${bTrue} OR ${cpAlias}.${q('CanEdit')} = ${bTrue} OR ${cpAlias}.${q('CanDelete')} = ${bTrue} OR ${cpAlias}.${q('CanShare')} = ${bTrue})`;

    return `EXISTS (SELECT 1 FROM ${vw('vwCollections')} ${q(`${prefix}0`)} ${joins.join(' ')} WHERE ${q(`${prefix}0`)}.${q('ID')} = ${collectionIdExpr} AND (${ownerChecks.join(' OR ')} OR EXISTS (SELECT 1 FROM ${vw('vwCollectionPermissions')} ${cpAlias} WHERE ${cpAlias}.${q('UserID')} = '${safeUser}' AND ${permMatch} AND ${cpAlias}.${q('CollectionID')} IN (${colIds.join(',')}))))`;
}

function resolveRegisteredDelegateSqlScope(provider: IMetadataProvider | null | undefined): {
    artifactsEntityId: string | null;
    customEntityIds: string[];
    isExact: boolean;
} {
    const artifactsEntityId = provider?.EntityByName?.('MJ: Artifacts')?.ID ??
        provider?.Entities?.find((e) => e.Name.trim().toLowerCase() === 'mj: artifacts')?.ID ??
        null;
    const normArtifactsEntityId = artifactsEntityId && IsValidUUID(artifactsEntityId)
        ? NormalizeUUID(artifactsEntityId)
        : null;

    const candidateKeys = new Set<string>(ArtifactPermissionEngine.Instance.GetRegisteredDelegateEntityKeys());
    try {
        const classRegs = MJGlobal.Instance.ClassFactory.GetRegistrationsByRootClass(BaseArtifactPermissionDelegate);
        for (const reg of classRegs) {
            if (reg.Key) {
                candidateKeys.add(reg.Key.trim().toLowerCase());
            }
        }
    } catch {
        // ClassFactory may be uninitialized in isolated unit tests
    }

    const customEntityIds: string[] = [];
    const seenIds = new Set<string>();
    let isExact = true;

    for (const rawKey of candidateKeys) {
        const key = rawKey.trim().toLowerCase();
        if (!key || key === 'mj: artifacts' || (normArtifactsEntityId && IsValidUUID(key) && NormalizeUUID(key) === normArtifactsEntityId)) {
            continue;
        }
        isExact = false;
        let resolvedId: string | undefined;
        if (IsValidUUID(key)) {
            resolvedId = key;
        } else {
            const ent =
                provider?.EntityByName?.(key) ??
                provider?.Entities?.find((e) => e.Name.trim().toLowerCase() === key);
            if (ent?.ID && IsValidUUID(ent.ID)) {
                resolvedId = ent.ID;
            }
        }
        if (resolvedId) {
            const norm = NormalizeUUID(resolvedId);
            if (!seenIds.has(norm)) {
                seenIds.add(norm);
                customEntityIds.push(resolvedId);
            }
        }
    }

    return {
        artifactsEntityId: artifactsEntityId && IsValidUUID(artifactsEntityId) ? artifactsEntityId : null,
        customEntityIds,
        isExact
    };
}

function buildSqlArtifactReadablePredicateWithExactness(
    artifactIdExpr: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    options?: {
        requireShareOrDelete?: boolean;
        aliasPrefix?: string;
        precomputedCollectionIds?: ReadonlySet<string> | null;
    }
): { clause: string; isExact: boolean } {
    if (!user?.ID || !IsValidUUID(user.ID) || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
        return { clause: '1 = 0', isExact: true };
    }
    const { isPg, q, vw, bTrue } = sqlPlatformHelpers(provider);
    const safeUser = EscapeSQLString(user.ID.trim());
    const prefix = options?.aliasPrefix ?? '_sa';
    const { artifactsEntityId, customEntityIds, isExact } = resolveRegisteredDelegateSqlScope(provider);
    const safeArtifactsEntityId = artifactsEntityId ? EscapeSQLString(artifactsEntityId) : null;
    const customDelegateClauseForAlias = (artAlias: string): string | null => {
        if (customEntityIds.length === 0) {
            return null;
        }
        const quoted = customEntityIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        return `(${artAlias}.${q('DelegateEntityID')} IN (${quoted}) AND ${artAlias}.${q('DelegateRecordID')} IS NOT NULL)`;
    };

    const useEmptyPrecomputedCollections = Boolean(
        options?.precomputedCollectionIds &&
        options.precomputedCollectionIds.size === 0
    );

    const buildHopPredicate = (hop: number, innerIdMatchClause: string): string => {
        const hopPrefix = `${prefix}_h${hop}`;
        const artAlias = q(`${hopPrefix}_art`);
        const apAlias = q(`${hopPrefix}_ap`);
        const caAlias = q(`${hopPrefix}_ca`);
        const avAlias = q(`${hopPrefix}_av`);

        const apPermCheck = options?.requireShareOrDelete
            ? `(${apAlias}.${q('CanShare')} = ${bTrue} OR ${apAlias}.${q('CanDelete')} = ${bTrue})`
            : `(${apAlias}.${q('CanRead')} = ${bTrue} OR ${apAlias}.${q('CanEdit')} = ${bTrue} OR ${apAlias}.${q('CanDelete')} = ${bTrue} OR ${apAlias}.${q('CanShare')} = ${bTrue})`;

        const directBranches: string[] = [
            `${artAlias}.${q('UserID')} = '${safeUser}'`,
            `EXISTS (SELECT 1 FROM ${vw('vwArtifactPermissions')} ${apAlias} WHERE ${apAlias}.${q('ArtifactID')} = ${artAlias}.${q('ID')} AND ${apAlias}.${q('UserID')} = '${safeUser}' AND ${apPermCheck})`
        ];

        if (!useEmptyPrecomputedCollections) {
            const colClause = BuildSqlCollectionReadablePredicate(
                `${caAlias}.${q('CollectionID')}`,
                provider,
                user,
                {
                    requireShareOrDelete: options?.requireShareOrDelete,
                    aliasPrefix: `${hopPrefix}_c`,
                    precomputedCollectionIds: options?.precomputedCollectionIds
                }
            );
            directBranches.push(
                `EXISTS (SELECT 1 FROM ${vw('vwCollectionArtifacts')} ${caAlias} INNER JOIN ${vw('vwArtifactVersions')} ${avAlias} ON ${caAlias}.${q('ArtifactVersionID')} = ${avAlias}.${q('ID')} WHERE ${avAlias}.${q('ArtifactID')} = ${artAlias}.${q('ID')} AND ${colClause})`
            );
        }

        const standaloneClause = `((${artAlias}.${q('DelegateEntityID')} IS NULL OR ${artAlias}.${q('DelegateRecordID')} IS NULL) AND (${directBranches.join(' OR ')}))`;
        const hopBranches: string[] = [standaloneClause];

        const customClause = customDelegateClauseForAlias(artAlias);
        if (customClause) {
            hopBranches.push(customClause);
        }

        if (safeArtifactsEntityId && hop < MAX_SQL_ARTIFACT_DELEGATE_HOPS) {
            const nextArtAlias = q(`${prefix}_h${hop + 1}_art`);
            const nextIdCast = isPg
                ? `LOWER(CAST(${nextArtAlias}.${q('ID')} AS TEXT))`
                : `LOWER(CAST(${nextArtAlias}.${q('ID')} AS NVARCHAR(36)))`;
            const nextMatch = `${nextIdCast} = LOWER(${artAlias}.${q('DelegateRecordID')})`;
            const parentSubquery = buildHopPredicate(hop + 1, nextMatch);
            hopBranches.push(
                `(${artAlias}.${q('DelegateEntityID')} = '${safeArtifactsEntityId}' AND ${artAlias}.${q('DelegateRecordID')} IS NOT NULL AND ${parentSubquery})`
            );
        }

        return `EXISTS (SELECT 1 FROM ${vw('vwArtifacts')} ${artAlias} WHERE ${innerIdMatchClause} AND (${hopBranches.join(' OR ')}))`;
    };

    const rootArtAlias = q(`${prefix}_h0_art`);
    const clause = buildHopPredicate(0, `${rootArtAlias}.${q('ID')} = ${artifactIdExpr}`);
    return {
        clause,
        // Treat missing `MJ: Artifacts` entity metadata as inexact so mock providers fail safely (`R1`).
        isExact: isExact && Boolean(safeArtifactsEntityId)
    };
}

function getOrFetchCollectionIds(
    provider: IMetadataProvider,
    user: UserInfo,
    requireShareOrDelete: boolean,
    collectionCache?: CollectionIdSetCache
): Promise<Set<string> | null> {
    const cacheKey: 'readable' | 'shareOrDelete' = requireShareOrDelete ? 'shareOrDelete' : 'readable';
    const existing = collectionCache?.get(cacheKey);
    if (existing) {
        return existing;
    }
    const promise = ArtifactPermissionEngine.Instance.TryBuildReadableCollectionIdSet(provider, user, {
        requireShareOrDelete
    });
    collectionCache?.set(cacheKey, promise);
    return promise;
}

/**
 * Async variant of {@link BuildSqlCollectionReadablePredicate} that precomputes readable (or
 * share/delete-capable, `B5`) collection IDs once per hook call.
 */
export async function BuildSqlCollectionReadablePredicateAsync(
    collectionIdExpr: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    options?: {
        requireShareOrDelete?: boolean;
        aliasPrefix?: string;
        precomputedCollectionCache?: CollectionIdSetCache;
    }
): Promise<{ clause: string; isExact: boolean }> {
    if (!user?.ID || !IsValidUUID(user.ID) || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
        return { clause: '1 = 0', isExact: true };
    }
    let precomputedCollectionIds: Set<string> | null = null;
    if (provider) {
        const resolvedCols = await getOrFetchCollectionIds(
            provider,
            user,
            options?.requireShareOrDelete === true,
            options?.precomputedCollectionCache
        );
        if (!resolvedCols) {
            const errMsg = `Permission check failed for user '${user.ID}': unable to resolve readable collections.`;
            LogError(`BuildSqlCollectionReadablePredicateAsync: ${errMsg}`);
            throw new Error(errMsg);
        }
        if (resolvedCols.size <= MAX_SQL_SCOPED_IN_IDS) {
            precomputedCollectionIds = resolvedCols;
        }
        // When > MAX_SQL_SCOPED_IN_IDS (5,000), leave precomputedCollectionIds=null so
        // BuildSqlCollectionReadablePredicate emits its bounded 17-table collection ancestry predicate (`R6-3`).
    }
    return {
        clause: BuildSqlCollectionReadablePredicate(collectionIdExpr, provider, user, {
            requireShareOrDelete: options?.requireShareOrDelete,
            aliasPrefix: options?.aliasPrefix,
            precomputedCollectionIds
        }),
        isExact: true
    };
}

/**
 * Builds a dialect-aware SQL `EXISTS` predicate verifying that `artifactIdExpr` is readable (or
 * share/delete-capable when `requireShareOrDelete` is true) by `user` via ownership,
 * `MJ: Artifact Permissions`, `MJ: Collection Artifacts` + 16-level collection ancestry (`0..15`), or
 * `ParentArtifactPermissionDelegate` (`MJ: Artifacts` parent chain up to depth 8, overriding ownership).
 * Unregistered custom delegates fail closed (`1 = 0`). Never returns `null` (`B2`, `R1`, `L1`).
 */
export function BuildSqlArtifactReadablePredicate(
    artifactIdExpr: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    options?: {
        requireShareOrDelete?: boolean;
        aliasPrefix?: string;
        precomputedCollectionIds?: ReadonlySet<string> | null;
    }
): string {
    return buildSqlArtifactReadablePredicateWithExactness(artifactIdExpr, provider, user, options).clause;
}

/**
 * Async variant of {@link BuildSqlArtifactReadablePredicate} that precomputes readable (or share/delete-capable,
 * `B5`) collection IDs once per `RunView` call (`<= 500` in multi-hop SQL to avoid SQL Server 260-table & 8623
 * expression limits, `R1`/`N6`, falling back to a single `BuildReadableArtifactIdSet` `IN (...)` when `> 500`),
 * and reports `isExact` for safe `SqlScopedParams` tracking.
 */
export async function BuildSqlArtifactReadablePredicateAsync(
    artifactIdExpr: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    options?: {
        requireShareOrDelete?: boolean;
        aliasPrefix?: string;
        precomputedCollectionCache?: CollectionIdSetCache;
        singleCollectionScopeId?: string | null;
    }
): Promise<{ clause: string; isExact: boolean }> {
    if (!user?.ID || !IsValidUUID(user.ID) || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
        return { clause: '1 = 0', isExact: true };
    }
    let precomputedCollectionIds: Set<string> | null = null;
    if (provider) {
        const requireShareOrDelete = options?.requireShareOrDelete === true;
        const resolvedCols = await getOrFetchCollectionIds(
            provider,
            user,
            requireShareOrDelete,
            options?.precomputedCollectionCache
        );
        if (!resolvedCols) {
            const errMsg = `Permission check failed for user '${user.ID}': unable to resolve readable artifact collections.`;
            LogError(`BuildSqlArtifactReadablePredicateAsync: ${errMsg}`);
            throw new Error(errMsg);
        }
        const singleCol = options?.singleCollectionScopeId?.trim();
        if (singleCol && IsValidUUID(singleCol)) {
            const normCol = NormalizeUUID(singleCol);
            if (!resolvedCols.has(normCol)) {
                return { clause: '1 = 0', isExact: true };
            }
            precomputedCollectionIds = new Set<string>([singleCol]);
        } else if (resolvedCols.size <= MAX_SQL_MULTI_HOP_COLLECTION_IN_IDS) {
            precomputedCollectionIds = resolvedCols;
        } else {
            // Avoid emitting 9x >500 literal lists (~45k literals, SQL Server 8623) or 260+ tables (`B5`, `N6`, `R5-4`)
            const { isExact } = resolveRegisteredDelegateSqlScope(provider);
            const readableArtifacts = await ArtifactPermissionEngine.Instance.TryBuildReadableArtifactIdSet(
                provider,
                user,
                requireShareOrDelete ? (p) => p.CanShare || p.CanDelete : undefined
            );
            if (!readableArtifacts) {
                const errMsg = `Permission check failed for user '${user.ID}': unable to resolve readable artifacts.`;
                LogError(`BuildSqlArtifactReadablePredicateAsync: ${errMsg}`);
                throw new Error(errMsg);
            }
            const scopeClause = BuildUuidInScopeClause(artifactIdExpr, readableArtifacts, provider);
            if (scopeClause) {
                return {
                    clause: scopeClause,
                    isExact
                };
            }
            const errMsg = `Artifact query exceeded SQL readability scope cap (${readableArtifacts.size} readable artifacts across ${resolvedCols.size} collections for user '${user.ID}'). Filter by CollectionID or ArtifactID to narrow the query.`;
            LogError(`BuildSqlArtifactReadablePredicateAsync: ${errMsg}`);
            throw new Error(errMsg);
        }
    }
    return buildSqlArtifactReadablePredicateWithExactness(artifactIdExpr, provider, user, {
        ...options,
        precomputedCollectionIds
    });
}

/**
 * Builds a dialect-aware SQL `EXISTS` predicate verifying that an `ArtifactVersionID` expression
 * belongs to an artifact readable by `user` (`B2`, `R1`).
 */
export function BuildSqlArtifactVersionIdReadablePredicate(
    artifactVersionIdExpr: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    options?: { aliasPrefix?: string; precomputedCollectionIds?: ReadonlySet<string> | null }
): string {
    if (!user?.ID || !IsValidUUID(user.ID) || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
        return '1 = 0';
    }
    const { q, vw } = sqlPlatformHelpers(provider);
    const prefix = options?.aliasPrefix ?? '_sv';
    const verAlias = q(`${prefix}_ver`);
    const innerArt = BuildSqlArtifactReadablePredicate(`${verAlias}.${q('ArtifactID')}`, provider, user, {
        aliasPrefix: `${prefix}_a`,
        precomputedCollectionIds: options?.precomputedCollectionIds
    });
    return `EXISTS (SELECT 1 FROM ${vw('vwArtifactVersions')} ${verAlias} WHERE ${verAlias}.${q('ID')} = ${artifactVersionIdExpr} AND ${innerArt})`;
}

/**
 * Async variant of {@link BuildSqlArtifactVersionIdReadablePredicate} sharing precomputed collection IDs (`R1`).
 */
export async function BuildSqlArtifactVersionIdReadablePredicateAsync(
    artifactVersionIdExpr: string,
    provider: IMetadataProvider | null | undefined,
    user: UserInfo | null | undefined,
    options?: {
        aliasPrefix?: string;
        precomputedCollectionCache?: CollectionIdSetCache;
        singleCollectionScopeId?: string | null;
    }
): Promise<{ clause: string; isExact: boolean }> {
    if (!user?.ID || !IsValidUUID(user.ID) || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
        return { clause: '1 = 0', isExact: true };
    }
    const { q, vw } = sqlPlatformHelpers(provider);
    const prefix = options?.aliasPrefix ?? '_sv';
    const verAlias = q(`${prefix}_ver`);
    const innerArt = await BuildSqlArtifactReadablePredicateAsync(`${verAlias}.${q('ArtifactID')}`, provider, user, {
        aliasPrefix: `${prefix}_a`,
        precomputedCollectionCache: options?.precomputedCollectionCache,
        singleCollectionScopeId: options?.singleCollectionScopeId
    });
    if (innerArt.clause === '1 = 0') {
        return { clause: '1 = 0', isExact: innerArt.isExact };
    }
    return {
        clause: `EXISTS (SELECT 1 FROM ${vw('vwArtifactVersions')} ${verAlias} WHERE ${verAlias}.${q('ID')} = ${artifactVersionIdExpr} AND ${innerArt.clause})`,
        isExact: innerArt.isExact
    };
}

/**
 * Shared `PreRunView` implementation for protected artifact/collection entities (`B1`, `B2`, `R1`):
 * - Resolves target entity case-insensitively and across `ViewID`/`ViewName`/`ViewEntity` (rejecting mismatches).
 * - Augments narrow `Fields` with ACL-required columns (shallow-copied, never mutating caller object).
 * - Injects a SQL `EXISTS` (or single-UUID) `ExtraFilter` predicate BEFORE `TOP` / `COUNT(*)` so
 *   `MaxRows` paging and `ResultType: 'count_only'` are exact at any scale without a 5,000-ID limit.
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
        ShouldBypassForNonDatabaseClientProvider(resolvedProvider, contextUser)
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
        const targetEntityInfo =
            resolvedProvider.EntityByName?.(config.TargetEntityName) ??
            resolvedProvider.Entities?.find(
                (e) => e.Name.trim().toLowerCase() === config.TargetEntityName.trim().toLowerCase()
            ) ??
            null;
        const predicates: ScopedPreRunViewPredicate[] = [
            {
                IdColumnName: config.IdColumnName,
                ResolveReadableIds: config.ResolveReadableIds,
                BuildSqlPredicate: config.BuildSqlPredicate,
                BuildSqlPredicateAsync: config.BuildSqlPredicateAsync,
                CheckSingleIdReadable: config.CheckSingleIdReadable
            },
            ...(config.ExtraPredicates ?? [])
        ];
        const clauses: string[] = [];
        let allClausesBuilt = true;
        let preResolvedEntry: Map<string, boolean> | undefined;
        const collectionCache: CollectionIdSetCache = new Map();

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

            if (pred.BuildSqlPredicateAsync) {
                const asyncPred = await pred.BuildSqlPredicateAsync(
                    resolvedProvider,
                    contextUser,
                    targetEntityInfo,
                    updatedParams,
                    collectionCache
                );
                clauses.push(asyncPred.clause || '1 = 0');
                if (!asyncPred.isExact) {
                    allClausesBuilt = false;
                }
                if (asyncPred.clause === '1 = 0') {
                    break;
                }
                continue;
            }

            if (pred.BuildSqlPredicate) {
                const sqlClause = pred.BuildSqlPredicate(
                    resolvedProvider,
                    contextUser,
                    targetEntityInfo,
                    updatedParams
                );
                clauses.push(sqlClause || '1 = 0');
                if (sqlClause === '1 = 0') {
                    break;
                }
                continue;
            }

            if (pred.ResolveReadableIds) {
                const readableIds = await pred.ResolveReadableIds(resolvedProvider, contextUser);
                if (readableIds === null) {
                    // Fail closed: never fall back to unscoped post-filter only (`B2`).
                    clauses.push('1 = 0');
                    break;
                }
                const scopeClause = BuildUuidInScopeClause(pred.IdColumnName, readableIds);
                if (scopeClause) {
                    clauses.push(scopeClause);
                    if (scopeClause === '1 = 0') {
                        break;
                    }
                } else {
                    // Fail closed when materialized list exceeds limit rather than dropping SQL scope (`B2`).
                    clauses.push('1 = 0');
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
            if (allClausesBuilt) {
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

async function resolveCascadeSystemUser(
    provider: IMetadataProvider,
    actor: UserInfo | undefined
): Promise<UserInfo | undefined> {
    return (
        (IsServerSystemUser(actor) ? actor : undefined) ??
        (await WellKnownUserSource.Instance.GetSystemUser(provider)) ??
        actor
    );
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
    if (!provider || typeof (provider as { RunView?: object }).RunView !== 'function') {
        return { Success: true };
    }
    const systemUser = await resolveCascadeSystemUser(provider, actor);
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
                const inviteEntity = await provider.GetEntityObject<MJMagicLinkInviteEntity>(
                    'MJ: Magic Link Invites',
                    systemUser
                );
                if (inviteEntity && (await inviteEntity.Load(row.MagicLinkInviteID))) {
                    if (inviteEntity.Status === 'Active' || inviteEntity.Status === 'Consumed') {
                        inviteEntity.Status = 'Revoked';
                        const savedInvite = await inviteEntity.Save();
                        if (!savedInvite) {
                            const msg =
                                inviteEntity.LatestResult?.CompleteMessage ??
                                `Failed to revoke referencing Magic Link invite '${row.MagicLinkInviteID}'.`;
                            return { Success: false, ErrorMessage: msg };
                        }
                    }
                }
            } catch (err) {
                const msg = `CascadeDeleteArtifactGuestShareLinks failed revoking invite '${row.MagicLinkInviteID}': ${
                    err instanceof Error ? err.message : String(err)
                }`;
                LogError(msg);
                return { Success: false, ErrorMessage: msg };
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

/**
 * Cascades deletion of any `MJ: Artifact Version Attributes` belonging to `artifactVersionId`
 * before `MJArtifactVersionEntityServer.Delete()` removes the version row so `FK_ArtifactVersionAttribute_ArtifactVersion`
 * does not reject valid version deletions (caller `CanDelete` and lock guards already ran).
 */
export async function CascadeDeleteArtifactVersionAttributes(
    provider: IMetadataProvider | null,
    artifactVersionId: string,
    actor: UserInfo | undefined
): Promise<{ Success: boolean; ErrorMessage?: string }> {
    if (
        !provider ||
        !IsValidUUID(artifactVersionId) ||
        typeof (provider as { RunView?: object }).RunView !== 'function'
    ) {
        return { Success: true };
    }
    const systemUser = await resolveCascadeSystemUser(provider, actor);
    if (!systemUser) {
        return { Success: true };
    }
    const internalSet = GetGlobalWeakSet(GLOBAL_KEY_INTERNAL_HELPER_PARAMS);
    const queryParams: RunViewParams = {
        EntityName: 'MJ: Artifact Version Attributes',
        ExtraFilter: `ArtifactVersionID='${EscapeSQLString(artifactVersionId)}'`,
        Fields: ['ID'],
        SkipTotalRowCount: true,
        ResultType: 'simple'
    };
    internalSet.add(queryParams);
    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(queryParams);
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<{ ID?: string }>(queryParams, systemUser);
    if (!res.Success) {
        return {
            Success: false,
            ErrorMessage: res.ErrorMessage || 'Failed to check referencing artifact version attributes before delete.'
        };
    }

    for (const row of res.Results ?? []) {
        if (row.ID && IsValidUUID(row.ID)) {
            const attrEntity = await provider.GetEntityObject<MJArtifactVersionAttributeEntity>(
                'MJ: Artifact Version Attributes',
                systemUser
            );
            if (attrEntity && (await attrEntity.Load(row.ID))) {
                const deleted = await attrEntity.Delete();
                if (!deleted) {
                    const msg =
                        attrEntity.LatestResult?.CompleteMessage ??
                        attrEntity.LatestResult?.Message ??
                        `Failed to delete referencing artifact version attribute '${row.ID}'.`;
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
    const stripOuterParens = (input: string): string => {
        let cur = input.trim();
        while (cur.startsWith('(') && cur.endsWith(')')) {
            let depth = 0;
            let inQuote = false;
            let wrapsAll = true;
            for (let i = 0; i < cur.length; i++) {
                const ch = cur[i];
                if (ch === "'") {
                    if (inQuote && cur[i + 1] === "'") {
                        i++;
                        continue;
                    }
                    inQuote = !inQuote;
                    continue;
                }
                if (inQuote) continue;
                if (ch === '(') depth++;
                else if (ch === ')') {
                    depth--;
                    if (depth === 0 && i < cur.length - 1) {
                        wrapsAll = false;
                        break;
                    }
                }
            }
            if (!wrapsAll || depth !== 0) break;
            cur = cur.slice(1, -1).trim();
        }
        return cur;
    };

    const trimmed = stripOuterParens(extraFilter);
    // Split strictly on top-level AND outside string literals/parens; refuse any top-level OR/NOT
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let inQuote = false;
    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (ch === "'") {
            if (inQuote && trimmed[i + 1] === "'") {
                i++;
                continue;
            }
            inQuote = !inQuote;
            continue;
        }
        if (inQuote) continue;
        if (ch === '(') {
            depth++;
            continue;
        }
        if (ch === ')') {
            depth--;
            continue;
        }
        if (depth === 0) {
            const rest = trimmed.slice(i);
            const orNotMatch = /^(?:OR|NOT)(?=\s|\()/i.exec(rest);
            if (orNotMatch && (i === 0 || /[\s)]/.test(trimmed[i - 1]))) {
                return null;
            }
            const andMatch = /^AND(?=\s|\()/i.exec(rest);
            if (andMatch && i > 0 && /[\s)]/.test(trimmed[i - 1])) {
                parts.push(trimmed.slice(start, i).trim());
                i += 2; // advance past 'AND' (-1 for loop i++)
                start = i + 1;
            }
        }
    }
    parts.push(trimmed.slice(start).trim());

    const escapedCol = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^(?:\\[?${escapedCol}\\]?)\\s*=\\s*N?'([^']+)'$`, 'i');
    for (const part of parts) {
        const unwrapped = stripOuterParens(part);
        const match = pattern.exec(unwrapped);
        if (match && match[1]) {
            const candidate = match[1].trim();
            if (IsValidUUID(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}

export function ChunkUuidList(values: readonly string[], size: number): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < values.length; i += size) {
        out.push(values.slice(i, i + size));
    }
    return out;
}

/**
 * Returns `true` when `provider` is a client/network provider (`ProviderType === 'Network'`,
 * or non-`Database` when `contextUser` is unset). Client providers run in processes that also
 * load server packages (e.g. integration tests or SSR); server SQL-scoping and `PostRunView`
 * hooks must NOT run on them because the actual enforcement executes on the server's `Database`
 * provider and injecting `EXISTS (... FROM vwArtifacts ...)` client-side would fail
 * `ClientClauseScreen` at the GraphQL boundary.
 */
export function ShouldBypassForNonDatabaseClientProvider(
    provider: IMetadataProvider | null | undefined,
    contextUser: UserInfo | undefined
): boolean {
    if (provider === null || provider === undefined) {
        return false;
    }
    return provider.ProviderType === 'Network' || (!contextUser && provider.ProviderType !== 'Database');
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
        ShouldBypassForNonDatabaseClientProvider(resolvedProvider, contextUser)
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
        ShouldBypassForNonDatabaseClientProvider(provider, contextUser)
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
        ShouldBypassForNonDatabaseClientProvider(provider, contextUser)
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
    const readableArtifacts = await ArtifactPermissionEngine.Instance.TryBuildReadableArtifactIdSet(
        provider,
        user
    );
    if (!readableArtifacts) {
        const errMsg = `Permission check failed for user '${user.ID}': unable to resolve readable artifacts.`;
        LogError(`ResolveReadableArtifactVersionIdsForUser: ${errMsg}`);
        throw new Error(errMsg);
    }
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
        if (!res.Success) {
            const errMsg = res.ErrorMessage || `Permission check failed querying artifact versions for user '${user.ID}'.`;
            LogError(`ResolveReadableArtifactVersionIdsForUser: ${errMsg}`);
            throw new Error(errMsg);
        }
        if (res.Results) {
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

const GLOBAL_KEY_WORKING_STATE_DESERIALIZER = '__MJ_ARTIFACT_WORKING_STATE_DESERIALIZER__';

export type WorkingStateContentDeserializer = (rawYjsState: string | Uint8Array | null | undefined) => string;

/**
 * Registers the server-side Yjs working-state binary-to-serialized-content deserializer (`R5-1`),
 * called by `ArtifactCollaborationServer` (in `@memberjunction/server`) so `MJArtifactVersionEntityServer`
 * and lock validators can verify locks on `MJ: Artifact Working States.YjsState` without a circular dependency.
 *
 * Standalone note (`S6-4`): Any Node process loading `@memberjunction/core-entities-server` without
 * `@memberjunction/server` (and without calling `RegisterWorkingStateContentDeserializer`) has no
 * Yjs deserializer registered and therefore fails closed on non-owner version saves whenever an active
 * `MJ: Artifact Working States.YjsState` row exists.
 */
export function RegisterWorkingStateContentDeserializer(fn: WorkingStateContentDeserializer | null): void {
    const store = GetGlobalObjectStore();
    if (!store) {
        return;
    }
    if (fn) {
        store[GLOBAL_KEY_WORKING_STATE_DESERIALIZER] = fn;
    } else {
        delete store[GLOBAL_KEY_WORKING_STATE_DESERIALIZER];
    }
}

/** Returns the registered {@link WorkingStateContentDeserializer}, if any (`R5-1`). */
export function GetWorkingStateContentDeserializer(): WorkingStateContentDeserializer | null {
    const store = GetGlobalObjectStore();
    const fn = store?.[GLOBAL_KEY_WORKING_STATE_DESERIALIZER];
    return typeof fn === 'function' ? (fn as WorkingStateContentDeserializer) : null;
}
