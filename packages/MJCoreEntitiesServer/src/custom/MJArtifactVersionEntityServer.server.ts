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
    ArtifactExtractor,
    ArtifactPermissionEngine,
    MJArtifactEntity,
    MJArtifactTypeEntity,
    MJArtifactVersionAttributeEntity,
    MJArtifactVersionEntity,
    ValidateArtifactContentMutationAgainstLocks,
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
    GetGlobalObjectStore,
    IsValidUUID,
    MJEventType,
    MJGlobal,
    NormalizeUUID,
    RegisterClass,
    UUIDsEqual
} from '@memberjunction/global';
import { createHash } from 'crypto';
import {
    BuildSqlArtifactReadablePredicateAsync,
    CascadeDeleteArtifactGuestShareLinks,
    CascadeDeleteArtifactVersionAttributes,
    ConsumePreResolvedIdsForParams,
    EmptyPostRunViewResult,
    FinalizePostRunViewResult,
    GetWorkingStateContentDeserializer,
    PrepareScopedPreRunView,
    QualifyOuterEntityColumnAsync,
    ShouldBypassPostRunViewAsync,
    StripSyntheticFieldsFromRow
} from './ArtifactSecurityHookHelpers';

export const ARTIFACT_VERSION_SAVED_EVENT_CODE = 'MJ_ARTIFACT_VERSION_SAVED';

export interface ArtifactVersionSavedEventPayload {
    ArtifactID: string;
    VersionID: string;
    VersionNumber: number;
    Content: string;
    PreviousContent?: string | null;
    Description?: string | null;
    Comments?: string | null;
    IsRestore?: boolean;
    UpdatedByUserID?: string;
    OriginServerID?: string;
    SavedStateVectorB64?: string;
    SavedDocUpdateB64?: string;
    SavedContentHash?: string;
}

const ARTIFACT_VERSION_ENTITY_NAME = 'MJ: Artifact Versions';
const GLOBAL_KEY_TRUSTED_RESTORE = '__MJ_TRUSTED_SERVER_RESTORE_ENTITIES__';
const GLOBAL_KEY_TRUSTED_AGENT_DRAFT = '__MJ_TRUSTED_AGENT_DRAFT_VERSION_ENTITIES__';
const GLOBAL_KEY_TRUSTED_COMPACTION = '__MJ_TRUSTED_COMPACTION_VERSION_ENTITIES__';
const GLOBAL_KEY_INTERNAL_VERSION_PARAMS = '__MJ_INTERNAL_VERSION_SECURITY_QUERY_PARAMS__';
const GLOBAL_KEY_ORIGINAL_VERSION_FIELDS = '__MJ_ORIGINAL_VERSION_FIELDS_BY_PARAMS__';
const GLOBAL_KEY_SQL_SCOPED_VERSION_PARAMS = '__MJ_SQL_SCOPED_VERSION_PARAMS__';

/**
 * Marks an in-process agent run draft `MJ: Artifact Versions` entity so sequential tool calls
 * during that agent run may update its `Content` (still subject to lock validation and
 * unshared-link verification in {@link MJArtifactVersionEntityServer.Save}, `B3`).
 */
export function MarkTrustedAgentRunDraftVersionSave(entity: object): void {
    if (entity && typeof entity === 'object') {
        getGlobalWeakSet(GLOBAL_KEY_TRUSTED_AGENT_DRAFT).add(entity);
    }
}

/**
 * Marks an in-process `ArtifactCollaborationServer` room compaction save (`N3`). Every frame
 * admitted into the Yjs room already passed per-connection lock checks, so compaction can persist
 * the combined room state without attributing an owner's earlier locked edits to the triggering user.
 */
export function MarkTrustedCompactionVersionSave(entity: MJArtifactVersionEntity): void {
    if (entity && typeof entity === 'object') {
        getGlobalWeakSet(GLOBAL_KEY_TRUSTED_COMPACTION).add(entity);
    }
}

function getGlobalWeakSet(key: string): WeakSet<object> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[key];
        if (existing instanceof WeakSet) {
            return existing;
        }
        const created = new WeakSet<object>();
        store[key] = created;
        return created;
    }
    return new WeakSet<object>();
}

function getOriginalVersionFieldsMap(): WeakMap<RunViewParams, string[]> {
    const store = GetGlobalObjectStore();
    if (store) {
        const existing = store[GLOBAL_KEY_ORIGINAL_VERSION_FIELDS];
        if (existing instanceof WeakMap) {
            return existing;
        }
        const created = new WeakMap<RunViewParams, string[]>();
        store[GLOBAL_KEY_ORIGINAL_VERSION_FIELDS] = created;
        return created;
    }
    return new WeakMap<RunViewParams, string[]>();
}

export function MarkTrustedServerRestoreSave(entity: MJArtifactVersionEntity): void {
    if (entity && typeof entity === 'object') {
        getGlobalWeakSet(GLOBAL_KEY_TRUSTED_RESTORE).add(entity);
    }
}

interface ArtifactVersionRowProjection {
    ID?: string | null;
    ArtifactID?: string | null;
    [key: string]: string | number | boolean | Date | null | undefined;
}

type ArtifactVersionViewRow = BaseEntity | ArtifactVersionRowProjection;

type ExtractedAttributeItem = Parameters<typeof ArtifactExtractor.SerializeForStorage>[0][number];

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
    return Boolean(provider && ('Entities' in provider || 'ProviderType' in provider));
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

function readVersionArtifactId(row: ArtifactVersionViewRow | null | undefined): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactVersionEntity) {
        return row.ArtifactID || null;
    }
    const candidate = (row as ArtifactVersionRowProjection).ArtifactID;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function readVersionRowId(row: ArtifactVersionViewRow | null | undefined): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactVersionEntity) {
        return row.ID || null;
    }
    const candidate = (row as ArtifactVersionRowProjection).ID;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

const SINGLE_ARTIFACT_EQ_FILTER_RE =
    /^\s*\[?ArtifactID\]?\s*=\s*N?'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'\s*$/i;

function extractSingleArtifactIdFromFilter(extraFilter: RunViewParams['ExtraFilter']): string | null {
    const raw =
        typeof extraFilter === 'string'
            ? extraFilter
            : extraFilter && typeof extraFilter === 'object'
              ? extraFilter.default
              : null;
    if (typeof raw !== 'string') {
        return null;
    }
    const match = SINGLE_ARTIFACT_EQ_FILTER_RE.exec(raw);
    return match ? match[1] : null;
}

function hasFieldIgnoreCase(fields: readonly string[], targetField: string): boolean {
    const lower = targetField.toLowerCase();
    return fields.some((f) => typeof f === 'string' && f.trim().toLowerCase() === lower);
}

async function fetchVersionArtifactIdsByIds(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    versionIds: readonly string[]
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniqueEscaped = Array.from(
        new Set(
            versionIds
                .map((id) => id.trim())
                .filter((id) => id.length > 0)
                .map((id) => `'${EscapeSQLString(id)}'`)
        )
    );
    if (uniqueEscaped.length === 0) {
        return map;
    }
    try {
        const systemUser =
            (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser;
        const rv = RunView.FromMetadataProvider(provider);
        const lookupParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${uniqueEscaped.join(',')})`,
            Fields: ['ID', 'ArtifactID'],
            MaxRows: uniqueEscaped.length,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        };
        getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS).add(lookupParams);
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(lookupParams);
        const res = await rv.RunView<{ ID?: string; ArtifactID?: string }>(
            lookupParams,
            systemUser
        );
        if (!res?.Success) {
            LogError(
                `ArtifactVersionPostRunViewHook failed hydrating ArtifactID for narrow Fields projection: ${
                    res?.ErrorMessage || 'RunView returned Success=false'
                }`
            );
            return map;
        }
        if (Array.isArray(res.Results)) {
            for (const item of res.Results) {
                if (item.ID && item.ArtifactID) {
                    map.set(NormalizeUUID(item.ID), item.ArtifactID);
                }
            }
        }
    } catch (error) {
        LogError(
            `ArtifactVersionPostRunViewHook failed hydrating ArtifactID for narrow Fields projection: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }
    return map;
}

function stripSyntheticArtifactId(row: ArtifactVersionViewRow): ArtifactVersionViewRow {
    if (!row || typeof row !== 'object' || row instanceof BaseEntity) {
        return row;
    }
    if (!Object.prototype.hasOwnProperty.call(row, 'ArtifactID')) {
        return row;
    }
    const copy: ArtifactVersionRowProjection = { ...(row as ArtifactVersionRowProjection) };
    delete copy.ArtifactID;
    return copy;
}

/**
 * Server-side `PreRunView` data hook ensuring `ArtifactID` is included prior to column projection
 * when a non-system caller queries `MJ: Artifact Versions` with a narrow `Fields` list (`B3`).
 * Mutates `params` in place so `ProviderBase.RunView` (`TrustLocalCacheCompletely === true`) carries
 * the widened `Fields` into `InternalRunView` and `PostRunView` without poisoning `LocalCacheManager`.
 * Any synthetically added `ArtifactID` is stripped in {@link ArtifactVersionPostRunViewHook}
 * before returning to the caller so the caller's projected shape is preserved.
 */
export const ArtifactVersionPreRunViewHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewParams> => {
    return PrepareScopedPreRunView(
        params,
        {
            TargetEntityName: ARTIFACT_VERSION_ENTITY_NAME,
            RequiredFields: ['ArtifactID'],
            IdColumnName: 'ArtifactID',
            InternalParams: getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS),
            OriginalFieldsMap: getOriginalVersionFieldsMap(),
            SqlScopedParams: getGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_VERSION_PARAMS),
            BuildSqlPredicateAsync: async (prov, user, entityInfo, runViewParams, collectionCache) =>
                BuildSqlArtifactReadablePredicateAsync(
                    await QualifyOuterEntityColumnAsync(entityInfo, 'vwArtifactVersions', 'ArtifactID', prov, runViewParams, user),
                    prov,
                    user,
                    { precomputedCollectionCache: collectionCache }
                ),
            CheckSingleIdReadable: async (prov, artifactId, user) => {
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(prov, artifactId, user);
                return perms.CanRead;
            }
        },
        contextUser,
        hookProvider
    );
};

/**
 * Server-side `PostRunView` data hook enforcing `ArtifactPermissionEngine` `CanRead`
 * authorization on `MJ: Artifact Versions` across `RunView` and `RunMJArtifactVersionDynamicView`.
 */
export const ArtifactVersionPostRunViewHook: PostRunViewHook = async (
    params: RunViewParams,
    results: RunViewResult,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): Promise<RunViewResult> => {
    if (!results?.Success) {
        return results;
    }
    const provider = resolveMetadataProvider(hookProvider, contextUser);
    const sqlScopedSet = getGlobalWeakSet(GLOBAL_KEY_SQL_SCOPED_VERSION_PARAMS);
    const { bypass, originalFields } = await ShouldBypassPostRunViewAsync(
        params,
        ARTIFACT_VERSION_ENTITY_NAME,
        getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS),
        getOriginalVersionFieldsMap(),
        contextUser,
        provider
    );
    if (bypass) {
        sqlScopedSet.delete(params);
        if (originalFields && Array.isArray(results.Results)) {
            return {
                ...results,
                Results: (results.Results as ArtifactVersionViewRow[]).map((r) => StripSyntheticFieldsFromRow(r, originalFields))
            };
        }
        return results;
    }

    if (!contextUser || !provider || provider.ProviderType !== 'Database') {
        sqlScopedSet.delete(params);
        if (provider !== null && provider.ProviderType !== 'Database') {
            if (originalFields && Array.isArray(results.Results)) {
                return {
                    ...results,
                    Results: (results.Results as ArtifactVersionViewRow[]).map((r) => StripSyntheticFieldsFromRow(r, originalFields))
                };
            }
            return results;
        }
        return EmptyPostRunViewResult(results);
    }

    const filterArtifactId = extractSingleArtifactIdFromFilter(params.ExtraFilter);

    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        if (params.ResultType === 'count_only' && (results.TotalRowCount ?? 0) > 0) {
            if (sqlScopedSet.has(params)) {
                sqlScopedSet.delete(params);
                return results;
            }
            if (filterArtifactId) {
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
                        `ArtifactVersionPostRunViewHook failed resolving count_only CanRead for artifact ${filterArtifactId}: ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    );
                }
            }
            return EmptyPostRunViewResult(results);
        }
        return FinalizePostRunViewResult(params, results, [], 0, sqlScopedSet);
    }

    const rawRows = results.Results as ArtifactVersionViewRow[];

    // If any rows lack `ArtifactID` (e.g. direct hook call or narrow projection without PreRunView)
    // and `ExtraFilter` is not a single-artifact equality predicate, hydrate `ArtifactID` by `ID`.
    const missingIds: string[] = [];
    if (!filterArtifactId) {
        for (const row of rawRows) {
            if (!readVersionArtifactId(row)) {
                const versionId = readVersionRowId(row);
                if (versionId) {
                    missingIds.push(versionId);
                }
            }
        }
    }
    const hydratedArtifactIds =
        missingIds.length > 0
            ? await fetchVersionArtifactIdsByIds(provider, contextUser, missingIds)
            : null;

    const preResolved = ConsumePreResolvedIdsForParams(params);
    const readAllowedByArtifact = new Map<string, boolean>(preResolved);
    const keptRows: ArtifactVersionViewRow[] = [];

    for (const row of rawRows) {
        let artifactId = readVersionArtifactId(row) ?? filterArtifactId;
        if (!artifactId && hydratedArtifactIds) {
            const versionId = readVersionRowId(row);
            if (versionId) {
                artifactId = hydratedArtifactIds.get(NormalizeUUID(versionId)) ?? null;
            }
        }
        if (!artifactId) {
            // Fail CLOSED on unclassifiable rows (no ArtifactID, no single-artifact filter, and no resolvable ID).
            continue;
        }
        const normId = NormalizeUUID(artifactId);
        let allowed = readAllowedByArtifact.get(normId);
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
                    `ArtifactVersionPostRunViewHook failed resolving CanRead for artifact ${artifactId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                allowed = false;
            }
            readAllowedByArtifact.set(normId, allowed);
        }
        if (allowed) {
            keptRows.push(StripSyntheticFieldsFromRow(row, originalFields));
        }
    }

    return FinalizePostRunViewResult(params, results, keptRows, rawRows.length, sqlScopedSet);
};

export function EnsureArtifactVersionReadHookRegistered(): void {
    const existingPre = GetDataHooks<PreRunViewHook>('PreRunView');
    if (!existingPre.includes(ArtifactVersionPreRunViewHook)) {
        RegisterDataHook('PreRunView', ArtifactVersionPreRunViewHook);
    }
    const existingPost = GetDataHooks<PostRunViewHook>('PostRunView');
    if (!existingPost.includes(ArtifactVersionPostRunViewHook)) {
        RegisterDataHook('PostRunView', ArtifactVersionPostRunViewHook);
    }
}

EnsureArtifactVersionReadHookRegistered();

/**
 * Returns the UTF-8 byte length of `content`. Used by the Save hook to
 * populate `ContentSizeBytes` so clients can display file sizes without
 * reading the full blob. Exported for direct unit-testing.
 */
export function CalculateContentSizeBytes(content: string): number {
    return Buffer.byteLength(content, 'utf8');
}

@RegisterClass(BaseEntity, 'MJ: Artifact Versions')
export class MJArtifactVersionEntityServer extends MJArtifactVersionEntity {
    private _pendingAttributes: ExtractedAttributeItem[] | null = null;
    private _loadedAttributes: MJArtifactVersionAttributeEntity[] | null = null;

    /**
     * Gets the attributes for this artifact version.
     * Returns loaded attributes if available, empty array otherwise.
     * Use InnerLoad() to automatically load attributes from database.
     * After Save(), returns the newly created attributes from extraction.
     */
    public get Attributes(): MJArtifactVersionAttributeEntity[] {
        return this._loadedAttributes || [];
    }

    /**
     * Overrides generated `MJArtifactVersionEntity.Load(ID)` (which calls `super.InnerLoad` directly)
     * so single-record `entity.Load(ID)` routes through {@link InnerLoad} and enforces `CanRead`.
     */
    public override async Load(
        ID: string,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const key = CompositeKey.FromID(ID); // first-pk-ok: 'MJ: Artifact Versions' has the single key ID
        return this.InnerLoad(key, EntityRelationshipsToLoad);
    }

    /**
     * Overrides InnerLoad to:
     * 1) Enforce `ArtifactPermissionEngine` `CanRead` for non-system users (`Blocker 2`).
     * 2) Automatically load `MJ: Artifact Version Attributes` after loading the version.
     */
    public override async InnerLoad(
        compositeKey: CompositeKey,
        EntityRelationshipsToLoad?: string[]
    ): Promise<boolean> {
        const loaded = await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);

        if (!loaded) {
            return false;
        }

        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
            const provider = resolveMetadataProvider(this.ProviderToUse, actor);
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
        }

        try {
            const rv = new RunView(this.RunViewProviderToUse);
            const result = await rv.RunView<MJArtifactVersionAttributeEntity>(
                {
                    EntityName: 'MJ: Artifact Version Attributes',
                    ExtraFilter: `ArtifactVersionID='${EscapeSQLString(this.ID)}'`,
                    ResultType: 'entity_object'
                },
                this.ContextCurrentUser
            );

            if (result.Success && result.Results) {
                this._loadedAttributes = result.Results;
            } else {
                this._loadedAttributes = [];
            }
        } catch (error) {
            LogError(
                `Error loading attributes for artifact version ${this.ID}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            this._loadedAttributes = [];
        }

        return true;
    }

    /**
     * Overrides base save method to:
     * 0) Enforce `ArtifactPermissionEngine` `CanEdit` on `this.ArtifactID` for non-system users (`Blocker 2`).
     * 1) Automatically calculate the ContentHash field whenever the Content field is changed.
     * 2) Automatically extract attributes from the Content field using the ExtractRules from the ArtifactType.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const saveType: 'create' | 'update' = this.IsSaved ? 'update' : 'create';
        const actor = this.ContextCurrentUser;
        const trustedRestoreSet = getGlobalWeakSet(GLOBAL_KEY_TRUSTED_RESTORE);
        const trustedDraftSet = getGlobalWeakSet(GLOBAL_KEY_TRUSTED_AGENT_DRAFT);
        const trustedCompactionSet = getGlobalWeakSet(GLOBAL_KEY_TRUSTED_COMPACTION);
        const isTrustedRestore = trustedRestoreSet.has(this);
        const isTrustedAgentDraft = trustedDraftSet.has(this);
        const isTrustedCompaction = trustedCompactionSet.has(this);
        const provider = resolveMetadataProvider(this.ProviderToUse, actor);

        try {
            if (!isServerSystemUser(actor)) {
                if (provider?.ProviderType === 'Network') {
                    return await super.Save(options);
                }
                const artifactIdField = this.safeGetField('ArtifactID');
                const oldArtifactId =
                    typeof artifactIdField?.OldValue === 'string' &&
                    artifactIdField.OldValue.trim().length > 0
                        ? artifactIdField.OldValue.trim()
                        : null;
                const currentArtifactId = this.ArtifactID ? this.ArtifactID.trim() : '';

                if (
                    this.IsSaved &&
                    oldArtifactId &&
                    (!currentArtifactId || !UUIDsEqual(oldArtifactId, currentArtifactId))
                ) {
                    return this.recordPermissionFailure(
                        saveType,
                        'Permission denied: ArtifactID cannot be reassigned on an existing artifact version.'
                    );
                }

                const authArtifactId = (this.IsSaved ? oldArtifactId : null) ?? currentArtifactId;
                if (!actor || !provider || !authArtifactId) {
                    return this.recordPermissionFailure(
                        saveType,
                        'Permission denied: authenticated user context and target ArtifactID are required to save an artifact version.'
                    );
                }
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    authArtifactId,
                    actor
                );
                if (!perms.CanEdit) {
                    return this.recordPermissionFailure(
                        saveType,
                        `Permission denied: user '${actor.Email || actor.ID}' does not hold Edit permission on artifact '${authArtifactId}'.`
                    );
                }

                const systemActor =
                    (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? actor;
                const canQueryDb = typeof (provider as { RunView?: unknown }).RunView === 'function';
                let isArtifactOwner = perms.Source === 'Owner';

                if (canQueryDb && IsValidUUID(authArtifactId)) {
                    const artParams: RunViewParams = {
                        EntityName: 'MJ: Artifacts',
                        ExtraFilter: `ID='${EscapeSQLString(authArtifactId)}'`,
                        Fields: ['ID', 'UserID'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    };
                    getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS).add(artParams);
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(artParams);
                    const artRes = await RunView.FromMetadataProvider(provider).RunView<{ ID?: string; UserID?: string | null }>(
                        artParams,
                        systemActor
                    );
                    if (!artRes.Success && provider.ProviderType === 'Database') {
                        return this.recordPermissionFailure(
                            saveType,
                            'Permission denied: unable to verify parent artifact ownership before saving version.'
                        );
                    }
                    const artRow = artRes.Results?.[0];
                    if (artRow?.UserID && UUIDsEqual(artRow.UserID, actor.ID)) {
                        isArtifactOwner = true;
                    }
                }

                if (!this.IsSaved) {
                    // Always stamp UserID from authenticated actor on version create (`B3`).
                    if (this.hasInitializedFields()) {
                        this.UserID = actor.ID;
                    }

                    if (canQueryDb && IsValidUUID(authArtifactId)) {
                        const priorParams: RunViewParams = {
                            EntityName: ARTIFACT_VERSION_ENTITY_NAME,
                            ExtraFilter: `ArtifactID='${EscapeSQLString(authArtifactId)}'`,
                            OrderBy: 'VersionNumber DESC',
                            Fields: ['ID', 'VersionNumber', 'Content', 'Configuration', 'ContentMode', 'FileID'],
                            MaxRows: 1,
                            SkipTotalRowCount: true,
                            ResultType: 'simple'
                        };
                        getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS).add(priorParams);
                        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(priorParams);
                        const priorRes = await RunView.FromMetadataProvider(provider).RunView<{
                            ID?: string;
                            VersionNumber?: number | null;
                            Content?: string | null;
                            Configuration?: string | null;
                            ContentMode?: string | null;
                            FileID?: string | null;
                        }>(priorParams, systemActor);
                        if (!priorRes.Success && provider.ProviderType === 'Database') {
                            return this.recordPermissionFailure(
                                saveType,
                                'Permission denied: unable to verify prior artifact version locks before creating version.'
                            );
                        }
                        const nextContent = this.safeReadStringProp('Content') ?? '';
                        const nextConfig = this.safeReadStringProp('Configuration');
                        const rawFileId = this.safeReadStringProp('FileID');
                        const nextFileId = rawFileId ? rawFileId.trim() : null;
                        const nextContentMode = this.safeReadStringProp('ContentMode');
                        const priorRow = priorRes.Success ? priorRes.Results?.[0] : undefined;

                        if (priorRes.Success) {
                            if (priorRow) {
                                const priorVer =
                                    typeof priorRow.VersionNumber === 'number' && Number.isFinite(priorRow.VersionNumber)
                                        ? priorRow.VersionNumber
                                        : 0;
                                if (this.hasInitializedFields()) {
                                    this.VersionNumber = priorVer + 1;
                                }
                                if (!isTrustedCompaction) {
                                    const priorContent = typeof priorRow.Content === 'string' ? priorRow.Content : '';
                                    const priorConfig = typeof priorRow.Configuration === 'string' ? priorRow.Configuration : null;
                                    const lockCheck = ValidateArtifactContentMutationAgainstLocks(
                                        priorContent,
                                        nextContent,
                                        actor.ID,
                                        isArtifactOwner,
                                        { currentConfiguration: priorConfig, nextConfiguration: nextConfig }
                                    );
                                    if (!lockCheck.Allowed) {
                                        return this.recordPermissionFailure(
                                            saveType,
                                            lockCheck.Reason ?? 'Write rejected: new version content modifies a locked region.'
                                        );
                                    }
                                    const priorFileId = typeof priorRow.FileID === 'string' ? priorRow.FileID.trim() : null;
                                    const isFileModeSwap =
                                        (priorRow.ContentMode === 'File' || nextContentMode === 'File') &&
                                        priorFileId !== nextFileId;
                                    if (isFileModeSwap && !isArtifactOwner && !isTrustedAgentDraft && priorConfig) {
                                        const wipeCheck = ValidateArtifactContentMutationAgainstLocks(
                                            priorContent,
                                            '',
                                            actor.ID,
                                            false,
                                            { currentConfiguration: priorConfig, nextConfiguration: '{}' }
                                        );
                                        if (!wipeCheck.Allowed) {
                                            return this.recordPermissionFailure(
                                                saveType,
                                                'Write rejected: File-mode artifact with protected ranges cannot be overwritten directly via FileID replacement.'
                                            );
                                        }
                                    }
                                }
                            } else if (
                                this.hasInitializedFields() &&
                                (typeof this.VersionNumber !== 'number' || this.VersionNumber < 1)
                            ) {
                                this.VersionNumber = 1;
                            }
                        }

                        if (!isTrustedCompaction) {
                            const wsParams: RunViewParams = {
                                EntityName: 'MJ: Artifact Working States',
                                ExtraFilter: `ArtifactID='${EscapeSQLString(authArtifactId)}'`,
                                Fields: ['ID', 'ArtifactID', 'YjsState'],
                                IncludeBinaryFields: true,
                                MaxRows: 1,
                                SkipTotalRowCount: true,
                                ResultType: 'simple'
                            };
                            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(wsParams);
                            const wsRes = await RunView.FromMetadataProvider(provider).RunView<{
                                ID?: string;
                                YjsState?: string | Uint8Array | null;
                            }>(wsParams, systemActor);
                            if (!wsRes.Success && provider.ProviderType === 'Database' && !isArtifactOwner) {
                                return this.recordPermissionFailure(
                                    saveType,
                                    'Permission denied: unable to verify active artifact working state locks before saving version.'
                                );
                            }
                            const rawYjsState = wsRes.Success ? wsRes.Results?.[0]?.YjsState : null;
                            const hasWorkingStateBytes =
                                (typeof rawYjsState === 'string' && rawYjsState.trim().length > 0) ||
                                (rawYjsState instanceof Uint8Array && rawYjsState.byteLength > 0);
                            if (hasWorkingStateBytes) {
                                const deserializer = GetWorkingStateContentDeserializer();
                                if (!deserializer) {
                                    if (provider.ProviderType === 'Database' && !isArtifactOwner) {
                                        return this.recordPermissionFailure(
                                            saveType,
                                            'Permission denied: unable to decode active working-state locks before saving version.'
                                        );
                                    }
                                } else {
                                    const wsContent = deserializer(rawYjsState);
                                    if (wsContent && wsContent !== (priorRow?.Content ?? '')) {
                                        const wsLockCheck = ValidateArtifactContentMutationAgainstLocks(
                                            wsContent,
                                            nextContent,
                                            actor.ID,
                                            isArtifactOwner,
                                            { currentConfiguration: priorRow?.Configuration ?? null, nextConfiguration: nextConfig }
                                        );
                                        if (!wsLockCheck.Allowed) {
                                            return this.recordPermissionFailure(
                                                saveType,
                                                wsLockCheck.Reason ??
                                                    'Write rejected: new version content conflicts with a locked region in the active working state.'
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    const userIdField = this.safeGetField('UserID');
                    if (userIdField?.Dirty) {
                        const oldUserId = typeof userIdField.OldValue === 'string' ? userIdField.OldValue.trim() : '';
                        const rawUserId = this.safeReadStringProp('UserID');
                        const curUserId = rawUserId ? rawUserId.trim() : '';
                        if (!oldUserId || !UUIDsEqual(oldUserId, curUserId)) {
                            return this.recordPermissionFailure(
                                'update',
                                'Permission denied: UserID on a saved artifact version is immutable.'
                            );
                        }
                    }
                    const verNumField = this.safeGetField('VersionNumber');
                    const curVerNum = this.hasInitializedFields()
                        ? this.VersionNumber
                        : Object.getOwnPropertyDescriptor(this, 'VersionNumber')?.value;
                    if (verNumField?.Dirty && verNumField.OldValue !== undefined && verNumField.OldValue !== curVerNum) {
                        return this.recordPermissionFailure(
                            'update',
                            'Permission denied: VersionNumber on a saved artifact version is immutable.'
                        );
                    }

                    const contentField = this.safeGetField('Content');
                    const configurationField = this.safeGetField('Configuration');
                    const contentModeField = this.safeGetField('ContentMode');
                    const fileIdField = this.safeGetField('FileID');
                    const contentHashField = this.safeGetField('ContentHash');
                    const mutatesVersionContent = Boolean(
                        contentField?.Dirty ||
                        configurationField?.Dirty ||
                        contentModeField?.Dirty ||
                        fileIdField?.Dirty ||
                        contentHashField?.Dirty
                    );

                    if (mutatesVersionContent) {
                        if (!isTrustedAgentDraft && !isTrustedCompaction) {
                            return this.recordPermissionFailure(
                                'update',
                                'Permission denied: saved artifact versions are immutable; create a new version instead.'
                            );
                        }
                        const savedVersionId = this.safeReadId();
                        if (canQueryDb && savedVersionId && IsValidUUID(savedVersionId)) {
                            const linkCheckParams: RunViewParams = {
                                EntityName: 'MJ: Artifact Guest Share Links',
                                ExtraFilter: `ArtifactVersionID='${EscapeSQLString(savedVersionId)}'`,
                                Fields: ['ID'],
                                MaxRows: 1,
                                SkipTotalRowCount: true,
                                ResultType: 'simple'
                            };
                            getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS).add(linkCheckParams);
                            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(linkCheckParams);
                            const linkRes = await RunView.FromMetadataProvider(provider).RunView<{ ID?: string }>(
                                linkCheckParams,
                                systemActor
                            );
                            if (!linkRes.Success && provider.ProviderType === 'Database') {
                                return this.recordPermissionFailure(
                                    'update',
                                    'Permission denied: unable to verify whether version is pinned by guest share links.'
                                );
                            }
                            if ((linkRes.Results?.length ?? 0) > 0) {
                                return this.recordPermissionFailure(
                                    'update',
                                    'Permission denied: cannot mutate an artifact version referenced by guest share links.'
                                );
                            }
                        }
                        const oldContent = typeof contentField?.OldValue === 'string' ? contentField.OldValue : '';
                        const nextContent = this.safeReadStringProp('Content') ?? '';
                        const oldConfig = typeof configurationField?.OldValue === 'string' ? configurationField.OldValue : null;
                        const nextConfig = this.safeReadStringProp('Configuration');
                        if (!isTrustedCompaction && ((oldContent.length > 0 && oldContent !== nextContent) || (oldConfig && oldConfig !== nextConfig))) {
                            const lockCheck = ValidateArtifactContentMutationAgainstLocks(
                                oldContent,
                                nextContent,
                                actor.ID,
                                isArtifactOwner,
                                { currentConfiguration: oldConfig, nextConfiguration: nextConfig }
                            );
                            if (!lockCheck.Allowed) {
                                return this.recordPermissionFailure(
                                    'update',
                                    lockCheck.Reason ?? 'Write rejected: draft update modifies a locked region.'
                                );
                            }
                        }
                    }
                }
            }

            const contentField = this.safeGetField('Content');
            const previousContentValue =
                typeof contentField?.OldValue === 'string' ? contentField.OldValue : null;
            const contentDirty = this.IsSaved === false || contentField?.Dirty;
            const currentContentMode = this.hasInitializedFields() ? this.ContentMode : null;

            if (contentDirty && currentContentMode !== 'File') {
                const effectiveContent = this.safeReadStringProp('Content') ?? '';
                // 1. Always recompute server-side ContentHash & ContentSizeBytes when content changes (`B3`).
                const currentHash = this.hasInitializedFields() ? this.ContentHash : Object.getOwnPropertyDescriptor(this, 'ContentHash')?.value;
                if (effectiveContent.length > 0 || (typeof currentHash === 'string' && currentHash.length > 0)) {
                    const nextHash = effectiveContent.length > 0 ? this.CalculateContentHash(effectiveContent) : '';
                    const nextBytes = CalculateContentSizeBytes(effectiveContent);
                    if (this.hasInitializedFields()) {
                        this.ContentHash = nextHash;
                        this.ContentSizeBytes = nextBytes;
                    } else {
                        this.safeWriteStubProp('ContentHash', nextHash);
                        this.safeWriteStubProp('ContentSizeBytes', nextBytes);
                    }
                }

                // 2. Extract attributes when content is non-empty
                if (effectiveContent.length > 0) {
                    try {
                        await this.ExtractAndSaveAttributes();
                    } catch (error) {
                        this._pendingAttributes = null;
                        LogError(
                            `Error in MJArtifactVersionEntityServer.Save attribute extraction: ${
                                error instanceof Error ? error.message : String(error)
                            }`
                        );
                    }
                }
            }

            const saveResult = await super.Save(options);

            // Notify ArtifactCollaborationServer when a version's content is saved so active Yjs rooms
            // or persisted working states reconcile out-of-band version writes (REST save, Restore, Library edit).
            if (saveResult && contentDirty && typeof this.Content === 'string' && this.ArtifactID) {
                try {
                    const versionId = typeof this.ID === 'string' ? this.ID : '';
                    const versionNumber = typeof this.VersionNumber === 'number' ? this.VersionNumber : 0;
                    const descriptionValue = typeof this.Description === 'string' ? this.Description : null;
                    const commentsValue = typeof this.Comments === 'string' ? this.Comments : null;
                    const updatedByUserId = this.UserID || this.ContextCurrentUser?.ID;
                    const payload: ArtifactVersionSavedEventPayload = {
                        ArtifactID: this.ArtifactID,
                        VersionID: versionId,
                        VersionNumber: versionNumber,
                        Content: this.Content,
                        PreviousContent: previousContentValue,
                        Description: descriptionValue,
                        Comments: commentsValue,
                        IsRestore: isTrustedRestore,
                        UpdatedByUserID: updatedByUserId
                    };
                    MJGlobal.Instance.RaiseEvent({
                        component: this,
                        event: MJEventType.ComponentEvent,
                        eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                        args: payload
                    });
                } catch (error) {
                    LogError(
                        `Error raising ${ARTIFACT_VERSION_SAVED_EVENT_CODE} in MJArtifactVersionEntityServer.Save: ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    );
                }
            }

            // After successful save, create ArtifactVersionAttribute records
            if (saveResult && this._pendingAttributes && this._pendingAttributes.length > 0) {
                try {
                    const savedAttributes = await this.SaveAttributeRecords(this._pendingAttributes);
                    this._loadedAttributes = savedAttributes;
                    this._pendingAttributes = null;
                } catch (error) {
                    LogError(
                        `Error saving ArtifactVersionAttribute records: ${
                            error instanceof Error ? error.message : String(error)
                        }`
                    );
                }
            }

            return saveResult;
        } finally {
            trustedRestoreSet.delete(this);
            trustedDraftSet.delete(this);
            trustedCompactionSet.delete(this);
        }
    }

    /**
     * Enforces `ArtifactPermissionEngine` `CanDelete` on `this.ArtifactID` for non-system users (`Blocker 2`),
     * and cleans up referencing `MJ: Artifact Guest Share Links` before deleting the version (`S8`).
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        const provider = resolveMetadataProvider(this.ProviderToUse, actor);
        if (!isServerSystemUser(actor)) {
            if (provider?.ProviderType === 'Network') {
                return super.Delete(options);
            }
            const artifactIdField = this.safeGetField('ArtifactID');
            const oldArtifactId =
                typeof artifactIdField?.OldValue === 'string' &&
                artifactIdField.OldValue.trim().length > 0
                    ? artifactIdField.OldValue.trim()
                    : null;
            const currentArtifactId = this.ArtifactID ? this.ArtifactID.trim() : '';

            if (
                this.IsSaved &&
                oldArtifactId &&
                (!currentArtifactId || !UUIDsEqual(oldArtifactId, currentArtifactId))
            ) {
                return this.recordPermissionFailure(
                    'delete',
                    'Permission denied: ArtifactID cannot be reassigned before deleting an artifact version.'
                );
            }

            const authArtifactId = (this.IsSaved ? oldArtifactId : null) ?? currentArtifactId;
            if (!actor || !provider || !authArtifactId) {
                return this.recordPermissionFailure(
                    'delete',
                    'Permission denied: authenticated user context and target ArtifactID are required to delete an artifact version.'
                );
            }
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                authArtifactId,
                actor
            );
            if (!perms.CanDelete) {
                return this.recordPermissionFailure(
                    'delete',
                    `Permission denied: user '${actor.Email || actor.ID}' does not hold Delete permission on artifact '${authArtifactId}'.`
                );
            }

            const canQueryDb = typeof (provider as { RunView?: unknown }).RunView === 'function';
            let isArtifactOwner = perms.Source === 'Owner';
            const systemActor = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? actor;
            if (canQueryDb && IsValidUUID(authArtifactId)) {
                const artParams: RunViewParams = {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${EscapeSQLString(authArtifactId)}'`,
                    Fields: ['ID', 'UserID'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                };
                getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS).add(artParams);
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(artParams);
                const artRes = await RunView.FromMetadataProvider(provider).RunView<{ ID?: string; UserID?: string | null }>(
                    artParams,
                    systemActor
                );
                if (!artRes.Success && provider.ProviderType === 'Database') {
                    return this.recordPermissionFailure(
                        'delete',
                        'Permission denied: unable to verify parent artifact ownership before deleting version.'
                    );
                }
                const artRow = artRes.Results?.[0];
                if (artRow?.UserID && UUIDsEqual(artRow.UserID, actor.ID)) {
                    isArtifactOwner = true;
                }

                if (!isArtifactOwner) {
                    const versionsParams: RunViewParams = {
                        EntityName: ARTIFACT_VERSION_ENTITY_NAME,
                        ExtraFilter: `ArtifactID='${EscapeSQLString(authArtifactId)}'`,
                        OrderBy: 'VersionNumber DESC',
                        Fields: ['ID', 'VersionNumber', 'Content', 'Configuration'],
                        IgnoreMaxRows: true,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    };
                    getGlobalWeakSet(GLOBAL_KEY_INTERNAL_VERSION_PARAMS).add(versionsParams);
                    ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(versionsParams);
                    const verRes = await RunView.FromMetadataProvider(provider).RunView<{
                        ID?: string;
                        VersionNumber?: number | null;
                        Content?: string | null;
                        Configuration?: string | null;
                    }>(versionsParams, systemActor);
                    if (!verRes.Success && provider.ProviderType === 'Database') {
                        return this.recordPermissionFailure(
                            'delete',
                            'Permission denied: unable to verify artifact version locks before deleting version.'
                        );
                    }
                    const versionRows = verRes.Results ?? [];
                    const deletingId = this.safeReadId();
                    const targetRow = deletingId
                        ? versionRows.find((r) => r.ID && UUIDsEqual(r.ID, deletingId))
                        : undefined;
                    const isLatestVersion =
                        Boolean(targetRow && versionRows[0]?.ID && UUIDsEqual(targetRow.ID!, versionRows[0].ID!)) ||
                        versionRows.length === 0;
                    const deletedContent =
                        typeof targetRow?.Content === 'string'
                            ? targetRow.Content
                            : this.safeReadStringProp('Content') ?? '';
                    const deletedConfig =
                        typeof targetRow?.Configuration === 'string'
                            ? targetRow.Configuration
                            : this.safeReadStringProp('Configuration');
                    const remainingLatest = versionRows.find((r) => !deletingId || !r.ID || !UUIDsEqual(r.ID, deletingId));
                    if (isLatestVersion && (deletedContent.length > 0 || (deletedConfig && deletedConfig.length > 0))) {
                        const deleteLockCheck = ValidateArtifactContentMutationAgainstLocks(
                            deletedContent,
                            typeof remainingLatest?.Content === 'string' ? remainingLatest.Content : '',
                            actor.ID,
                            false,
                            {
                                currentConfiguration: deletedConfig,
                                nextConfiguration:
                                    typeof remainingLatest?.Configuration === 'string'
                                        ? remainingLatest.Configuration
                                        : null
                            }
                        );
                        if (!deleteLockCheck.Allowed) {
                            return this.recordPermissionFailure(
                                'delete',
                                deleteLockCheck.Reason ??
                                    'Permission denied: cannot delete a locked artifact version as a non-owner.'
                            );
                        }
                    }
                }
            }
        }

        const versionIdForCascade = this.safeReadId();
        if (versionIdForCascade && IsValidUUID(versionIdForCascade)) {
            const cascadeRes = await CascadeDeleteArtifactGuestShareLinks(
                provider,
                `ArtifactVersionID='${EscapeSQLString(versionIdForCascade)}'`,
                actor
            );
            if (!cascadeRes.Success) {
                return this.recordPermissionFailure(
                    'delete',
                    cascadeRes.ErrorMessage ?? 'Failed to clean up guest share links before deleting artifact version.'
                );
            }
            const attrCascadeRes = await CascadeDeleteArtifactVersionAttributes(
                provider,
                versionIdForCascade,
                actor
            );
            if (!attrCascadeRes.Success) {
                return this.recordPermissionFailure(
                    'delete',
                    attrCascadeRes.ErrorMessage ?? 'Failed to clean up artifact version attributes before deleting artifact version.'
                );
            }
        }

        return super.Delete(options);
    }

    private hasInitializedFields(): boolean {
        return Boolean(this.EntityInfo && Array.isArray(this.Fields) && this.Fields.length > 0);
    }

    private safeReadId(): string | null {
        if (this.hasInitializedFields()) {
            return this.ID ? this.ID.trim() : null;
        }
        const own = Object.getOwnPropertyDescriptor(this, 'ID')?.value;
        return typeof own === 'string' && own.trim().length > 0 ? own.trim() : null;
    }

    private safeReadStringProp(propName: 'Content' | 'Configuration' | 'FileID' | 'ContentMode' | 'UserID'): string | null {
        const val = this.hasInitializedFields()
            ? this[propName]
            : Object.getOwnPropertyDescriptor(this, propName)?.value;
        return typeof val === 'string' ? val : null;
    }

    private safeWriteStubProp(propName: 'ContentHash' | 'ContentSizeBytes', value: string | number): void {
        const desc = Object.getOwnPropertyDescriptor(this, propName);
        if (desc) {
            if (desc.writable) {
                Reflect.set(this, propName, value);
            }
            return;
        }
        Object.defineProperty(this, propName, { value, writable: true, configurable: true });
    }

    private safeGetField(fieldName: string) {
        if (Array.isArray(this.Fields)) {
            const found = this.Fields.find((f) => f.Name === fieldName);
            if (found) {
                return found;
            }
        }
        if (typeof this.GetFieldByName === 'function') {
            try {
                return this.GetFieldByName(fieldName);
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    /**
     * Calculates SHA-256 hash of content
     * @param content - The content to hash
     * @returns SHA-256 hash as hex string
     */
    protected CalculateContentHash(content: string): string {
        return createHash('sha256').update(content, 'utf8').digest('hex');
    }

    /**
     * Extracts attributes from Content using ArtifactType ExtractRules and saves them
     * @protected
     */
    protected async ExtractAndSaveAttributes(): Promise<void> {
        if (!this.Content) {
            return; // Nothing to extract
        }

        const md = resolveMetadataProvider(this.ProviderToUse, this.ContextCurrentUser);
        if (!md) {
            return;
        }
        const artifact = await md.GetEntityObject<MJArtifactEntity>(
            'MJ: Artifacts',
            this.ContextCurrentUser
        );
        const loadedArtifact = await artifact.Load(this.ArtifactID);

        if (!loadedArtifact) {
            throw new Error(`Failed to load Artifact with ID: ${this.ArtifactID}`);
        }

        // Load the ArtifactType hierarchy (child to parent)
        const artifactTypeChain = await this.LoadArtifactTypeHierarchy(artifact.TypeID);

        if (artifactTypeChain.length === 0) {
            return; // No extract rules to apply
        }

        // Resolve extract rules with inheritance
        const extractRules = ArtifactExtractor.ResolveExtractRules(artifactTypeChain);

        if (extractRules.length === 0) {
            return; // No rules defined
        }

        // Extract attributes
        const extractionResult = await ArtifactExtractor.ExtractAttributes({
            content: this.Content,
            extractRules: extractRules,
            throwOnError: false, // Don't throw - continue with partial results
            timeout: 5000,
            verbose: false
        });

        // Set Name and Description from standard properties
        const nameValue = ArtifactExtractor.GetStandardProperty(extractionResult.attributes, 'name');
        if (nameValue !== null && typeof nameValue === 'string') {
            this.Name = nameValue;
        }

        const descriptionValue = ArtifactExtractor.GetStandardProperty(
            extractionResult.attributes,
            'description'
        );
        if (descriptionValue !== null && typeof descriptionValue === 'string') {
            this.Description = descriptionValue;
        }

        this._pendingAttributes = extractionResult.attributes;
    }

    /**
     * Saves extracted attributes as ArtifactVersionAttribute records
     * Updates existing attributes, creates new ones, and deletes removed ones
     * @param attributes - Extracted attributes to save
     * @returns Array of saved attribute entities
     * @protected
     */
    protected async SaveAttributeRecords(
        attributes: ExtractedAttributeItem[]
    ): Promise<MJArtifactVersionAttributeEntity[]> {
        if (!this.ID) {
            throw new Error('Cannot save attributes: ArtifactVersion ID is not set');
        }

        if (!attributes || attributes.length === 0) {
            return [];
        }

        const md = resolveMetadataProvider(this.ProviderToUse, this.ContextCurrentUser);
        if (!md) {
            return [];
        }
        const operations: Promise<boolean>[] = [];
        const savedAttributes: MJArtifactVersionAttributeEntity[] = [];

        // Load existing attributes for this version
        const rv = new RunView(this.RunViewProviderToUse);
        const existingAttrsResult = await rv.RunView<MJArtifactVersionAttributeEntity>(
            {
                EntityName: 'MJ: Artifact Version Attributes',
                ExtraFilter: `ArtifactVersionID='${EscapeSQLString(this.ID)}'`,
                ResultType: 'entity_object'
            },
            this.ContextCurrentUser
        );

        const existingAttrs = existingAttrsResult?.Success ? existingAttrsResult.Results || [] : [];
        const existingAttrMap = new Map(existingAttrs.map((attr) => [attr.Name, attr]));

        // Serialize attributes for storage
        const serialized = ArtifactExtractor.SerializeForStorage(attributes);

        // Track which attributes we've processed
        const processedNames = new Set<string>();

        // Update existing or create new attributes
        for (const attrData of serialized) {
            processedNames.add(attrData.name);
            const existingAttr = existingAttrMap.get(attrData.name);

            // Null value means delete the attribute if it exists
            if (attrData.value === null || attrData.value === undefined) {
                if (existingAttr) {
                    operations.push(existingAttr.Delete());
                }
                continue;
            }

            const stdProp: MJArtifactVersionAttributeEntity['StandardProperty'] =
                attrData.standardProperty === 'name' ||
                attrData.standardProperty === 'description' ||
                attrData.standardProperty === 'displayMarkdown' ||
                attrData.standardProperty === 'displayHtml'
                    ? attrData.standardProperty
                    : null;

            // Update existing attribute
            if (existingAttr) {
                existingAttr.Type = attrData.type;
                existingAttr.Value = attrData.value;
                existingAttr.StandardProperty = stdProp;
                operations.push(existingAttr.Save());
                savedAttributes.push(existingAttr);
            } else {
                // Create new attribute
                const newAttr = await md.GetEntityObject<MJArtifactVersionAttributeEntity>(
                    'MJ: Artifact Version Attributes',
                    this.ContextCurrentUser
                );
                newAttr.NewRecord();
                newAttr.ArtifactVersionID = this.ID;
                newAttr.Name = attrData.name;
                newAttr.Type = attrData.type;
                newAttr.Value = attrData.value;
                newAttr.StandardProperty = stdProp;
                operations.push(newAttr.Save());
                savedAttributes.push(newAttr);
            }
        }

        // Delete attributes that are no longer in the serialized data
        for (const [name, attr] of existingAttrMap) {
            if (!processedNames.has(name)) {
                operations.push(attr.Delete());
            }
        }

        // Execute all operations in parallel
        await Promise.all(operations);

        return savedAttributes;
    }

    /**
     * Loads the ArtifactType hierarchy from child to root parent
     * @param typeId - Starting ArtifactType ID
     * @returns Array of ArtifactType entities from child to parent
     * @protected
     */
    protected async LoadArtifactTypeHierarchy(typeId: string): Promise<MJArtifactTypeEntity[]> {
        const hierarchy: MJArtifactTypeEntity[] = [];
        const md = resolveMetadataProvider(this.ProviderToUse, this.ContextCurrentUser);
        if (!md) {
            return hierarchy;
        }
        let currentTypeId: string | null = typeId;

        // Walk up the hierarchy (max 10 levels to prevent infinite loops)
        let maxDepth = 10;
        while (currentTypeId && maxDepth > 0) {
            const artifactType = await md.GetEntityObject<MJArtifactTypeEntity>(
                'MJ: Artifact Types',
                this.ContextCurrentUser
            );

            const loaded = await artifactType.Load(currentTypeId);
            if (!loaded) {
                break; // Type not found, stop traversal
            }

            hierarchy.push(artifactType);
            currentTypeId = artifactType.ParentID; // Move to parent
            maxDepth--;
        }

        return hierarchy;
    }

    private recordPermissionFailure(
        type: 'create' | 'update' | 'delete',
        message: string
    ): boolean {
        const res = new BaseEntityResult();
        res.Success = false;
        res.Type = type;
        res.StartedAt = new Date();
        res.EndedAt = new Date();
        res.Message = message;
        this.ResultHistory.push(res);
        return false;
    }
}
