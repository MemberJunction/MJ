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
    type MJUserViewEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    EscapeSQLString,
    MJEventType,
    MJGlobal,
    NormalizeUUID,
    RegisterClass,
    UUIDsEqual
} from '@memberjunction/global';
import { createHash } from 'crypto';

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

const TRUSTED_SERVER_RESTORE_ENTITIES = new WeakSet<object>();

export function MarkTrustedServerRestoreSave(entity: MJArtifactVersionEntity): void {
    if (entity && typeof entity === 'object') {
        TRUSTED_SERVER_RESTORE_ENTITIES.add(entity);
    }
}

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

function readVersionArtifactId(row: unknown): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactVersionEntity) {
        return row.ArtifactID || null;
    }
    const candidate = (row as Record<string, unknown>)['ArtifactID'];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function readVersionRowId(row: unknown): string | null {
    if (!row || typeof row !== 'object') {
        return null;
    }
    if (row instanceof MJArtifactVersionEntity) {
        return row.ID || null;
    }
    const candidate = (row as Record<string, unknown>)['ID'];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

const INTERNAL_VERSION_SECURITY_QUERY_PARAMS = new WeakSet<object>();
const ORIGINAL_CALLER_FIELDS_BY_PARAMS = new WeakMap<RunViewParams, string[]>();

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
        INTERNAL_VERSION_SECURITY_QUERY_PARAMS.add(lookupParams);
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

function stripSyntheticArtifactId(row: unknown): unknown {
    if (!row || typeof row !== 'object' || row instanceof BaseEntity) {
        return row;
    }
    if (!Object.prototype.hasOwnProperty.call(row, 'ArtifactID')) {
        return row;
    }
    const copy = { ...(row as Record<string, unknown>) };
    delete copy['ArtifactID'];
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
export const ArtifactVersionPreRunViewHook: PreRunViewHook = (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    hookProvider?: IMetadataProvider
): RunViewParams => {
    const provider = resolveMetadataProvider(hookProvider, contextUser);
    if (
        !params ||
        INTERNAL_VERSION_SECURITY_QUERY_PARAMS.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifact Versions' ||
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
        ORIGINAL_CALLER_FIELDS_BY_PARAMS.set(params, [...params.Fields]);
        params.Fields = [...params.Fields, 'ArtifactID'];
    }
    return params;
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
    if (
        !results?.Success ||
        INTERNAL_VERSION_SECURITY_QUERY_PARAMS.has(params) ||
        ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifact Versions'
    ) {
        return results;
    }

    const shouldStripSyntheticArtifactId = ORIGINAL_CALLER_FIELDS_BY_PARAMS.has(params);

    if (isServerSystemUser(contextUser)) {
        return results;
    }

    const provider = resolveMetadataProvider(hookProvider, contextUser);

    if (!contextUser) {
        // Client-side providers (e.g. GraphQLDataProvider where ProviderType === 'Network') invoke
        // PostRunView hooks with contextUser === undefined after MJServer has already enforced
        // server-side CanRead (`DSLC2`). On a server DatabaseProviderBase (`ProviderType === 'Database'`)
        // or when no provider is configured, missing `contextUser` MUST fail closed (`R6-3`) because
        // `DatabaseProviderBase.InternalRunView` falls back to `this.CurrentUser` and
        // `ProviderBase.RunView`'s `LocalCacheManager` cache-hit path skips `CheckUserReadPermissions`.
        if (provider !== null && provider.ProviderType !== 'Database') {
            if (shouldStripSyntheticArtifactId && Array.isArray(results.Results)) {
                return {
                    ...results,
                    Results: results.Results.map(stripSyntheticArtifactId)
                };
            }
            return results;
        }
        return {
            ...results,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0
        };
    }

    if (!provider) {
        return {
            ...results,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0
        };
    }

    if (provider.ProviderType !== 'Database') {
        if (shouldStripSyntheticArtifactId && Array.isArray(results.Results)) {
            return {
                ...results,
                Results: results.Results.map(stripSyntheticArtifactId)
            };
        }
        return results;
    }

    if (!Array.isArray(results.Results) || results.Results.length === 0) {
        return results;
    }

    const filterArtifactId = extractSingleArtifactIdFromFilter(params.ExtraFilter);

    // If any rows lack `ArtifactID` (e.g. direct hook call or narrow projection without PreRunView)
    // and `ExtraFilter` is not a single-artifact equality predicate, hydrate `ArtifactID` by `ID`.
    const missingIds: string[] = [];
    if (!filterArtifactId) {
        for (const row of results.Results) {
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

    const readAllowedByArtifact = new Map<string, boolean>();
    const keptRows: unknown[] = [];

    for (const row of results.Results) {
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
            keptRows.push(shouldStripSyntheticArtifactId ? stripSyntheticArtifactId(row) : row);
        }
    }

    if (keptRows.length === results.Results.length && !shouldStripSyntheticArtifactId) {
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
                    ExtraFilter: `ArtifactVersionID='${this.ID}'`,
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
        const isTrustedRollback = ArtifactPermissionEngine.Instance.IsTrustedServerVersionRollback(this);
        try {
            const saveType: 'create' | 'update' = this.IsSaved ? 'update' : 'create';
            const actor = this.ContextCurrentUser;
            if (!isServerSystemUser(actor) && !isTrustedRollback) {
                const provider = resolveMetadataProvider(this.ProviderToUse, actor);
                if (!actor || !provider || !this.ArtifactID) {
                    return this.recordPermissionFailure(
                        saveType,
                        'Permission denied: authenticated user context and target ArtifactID are required to save an artifact version.'
                    );
                }
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    this.ArtifactID,
                    actor
                );
                if (!perms.CanEdit) {
                    return this.recordPermissionFailure(
                        saveType,
                        `Permission denied: user '${actor.Email || actor.ID}' does not hold Edit permission on artifact '${this.ArtifactID}'.`
                    );
                }
            }

        const contentField = this.GetFieldByName('Content');
        const previousContentValue =
            typeof contentField?.OldValue === 'string' ? contentField.OldValue : null;
        const contentDirty = this.IsSaved === false || contentField?.Dirty;

        if (contentDirty && this.Content) {
            try {
                // 1. Calculate ContentHash using SHA-256
                this.ContentHash = this.CalculateContentHash(this.Content);

                // 2. Capture the UTF-8 byte length so the client can render file sizes
                //    without reading the full Content blob.
                this.ContentSizeBytes = CalculateContentSizeBytes(this.Content);

                // 3. Extract attributes (sets Name/Description and stores pending attributes)
                await this.ExtractAndSaveAttributes();
            } catch (error) {
                LogError(
                    `Error in MJArtifactVersionEntityServer.Save pre-processing: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        // Save the main entity
        const isTrustedRestore = TRUSTED_SERVER_RESTORE_ENTITIES.has(this);
        let saveResult: boolean;
        try {
            saveResult = await super.Save(options);
        } finally {
            TRUSTED_SERVER_RESTORE_ENTITIES.delete(this);
        }

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
                // Populate loaded attributes with the newly created ones
                this._loadedAttributes = savedAttributes;
                this._pendingAttributes = null; // Clear pending attributes
            } catch (error) {
                LogError(
                    `Error saving ArtifactVersionAttribute records: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
                // Don't fail the save if attribute creation fails
            }
        }

        return saveResult;
        } finally {
            if (isTrustedRollback) {
                ArtifactPermissionEngine.Instance.UnmarkTrustedServerVersionRollback(this);
            }
        }
    }

    /**
     * Enforces `ArtifactPermissionEngine` `CanDelete` on `this.ArtifactID` for non-system users (`Blocker 2`).
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const isTrustedRollback = ArtifactPermissionEngine.Instance.IsTrustedServerVersionRollback(this);
        try {
            const actor = this.ContextCurrentUser;
            if (!isServerSystemUser(actor) && !isTrustedRollback) {
                const provider = resolveMetadataProvider(this.ProviderToUse, actor);
                if (!actor || !provider || !this.ArtifactID) {
                    return this.recordPermissionFailure(
                        'delete',
                        'Permission denied: authenticated user context and target ArtifactID are required to delete an artifact version.'
                    );
                }
                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    provider,
                    this.ArtifactID,
                    actor
                );
                if (!perms.CanDelete) {
                    return this.recordPermissionFailure(
                        'delete',
                        `Permission denied: user '${actor.Email || actor.ID}' does not hold Delete permission on artifact '${this.ArtifactID}'.`
                    );
                }
            }
            return await super.Delete(options);
        } finally {
            if (isTrustedRollback) {
                ArtifactPermissionEngine.Instance.UnmarkTrustedServerVersionRollback(this);
            }
        }
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
                ExtraFilter: `ArtifactVersionID='${this.ID}'`,
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
