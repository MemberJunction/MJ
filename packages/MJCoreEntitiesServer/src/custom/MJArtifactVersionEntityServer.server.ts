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
    UpdatedByUserID?: string;
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
    provider: IEntityDataProvider | null | undefined
): provider is IEntityDataProvider & IMetadataProvider {
    return Boolean(provider && 'Entities' in provider);
}

function resolveMetadataProvider(
    entityProvider: IEntityDataProvider | null | undefined,
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
const SYNTHETIC_ARTIFACT_ID_PARAMS = new WeakSet<object>();
const IN_FLIGHT_VERSION_PERMISSION_KEYS = new Set<string>();

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
        const res = await rv.RunView<{ ID?: string; ArtifactID?: string }>(
            lookupParams,
            systemUser
        );
        if (res?.Success && Array.isArray(res.Results)) {
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
 * Any synthetically added `ArtifactID` is stripped in {@link ArtifactVersionPostRunViewHook}
 * before returning to the caller so the caller's projected shape is preserved.
 */
export const ArtifactVersionPreRunViewHook: PreRunViewHook = (
    params: RunViewParams,
    contextUser: UserInfo | undefined
): RunViewParams => {
    if (
        !params ||
        INTERNAL_VERSION_SECURITY_QUERY_PARAMS.has(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifact Versions' ||
        isServerSystemUser(contextUser) ||
        !contextUser
    ) {
        return params;
    }
    if (
        Array.isArray(params.Fields) &&
        params.Fields.length > 0 &&
        !hasFieldIgnoreCase(params.Fields, 'ArtifactID')
    ) {
        const augmented: RunViewParams = {
            ...params,
            Fields: [...params.Fields, 'ArtifactID']
        };
        SYNTHETIC_ARTIFACT_ID_PARAMS.add(augmented);
        return augmented;
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
    contextUser: UserInfo | undefined
): Promise<RunViewResult> => {
    if (
        !results?.Success ||
        INTERNAL_VERSION_SECURITY_QUERY_PARAMS.has(params) ||
        resolveTargetEntityName(params) !== 'MJ: Artifact Versions'
    ) {
        return results;
    }

    const shouldStripSyntheticArtifactId = SYNTHETIC_ARTIFACT_ID_PARAMS.has(params);

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

    const provider = resolveMetadataProvider(undefined, contextUser);
    if (!provider || provider.ProviderType !== 'Database') {
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
            // Unclassifiable projection (no ArtifactID, no single-artifact filter, and no resolvable ID):
            // keep rather than silently emptying narrow read projections (`B3`).
            keptRows.push(shouldStripSyntheticArtifactId ? stripSyntheticArtifactId(row) : row);
            continue;
        }
        const normId = NormalizeUUID(artifactId);
        let allowed = readAllowedByArtifact.get(normId);
        if (allowed === undefined) {
            const reentrancyKey = `${NormalizeUUID(contextUser.ID)}:${normId}`;
            if (IN_FLIGHT_VERSION_PERMISSION_KEYS.has(reentrancyKey)) {
                // Re-entrant lookup while `ResolvePermissions` is already evaluating this `(user, artifact)`:
                // allow the internal membership probe without infinite recursion (`B3`).
                allowed = true;
            } else {
                IN_FLIGHT_VERSION_PERMISSION_KEYS.add(reentrancyKey);
                try {
                    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                        provider,
                        artifactId,
                        contextUser
                    );
                    allowed = perms.CanRead;
                } finally {
                    IN_FLIGHT_VERSION_PERMISSION_KEYS.delete(reentrancyKey);
                }
                readAllowedByArtifact.set(normId, allowed);
            }
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
        const saveType: 'create' | 'update' = this.IsSaved ? 'update' : 'create';
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
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
        const saveResult = await super.Save(options);

        // Notify ArtifactCollaborationServer when a version's content is saved so active Yjs rooms
        // or persisted working states reconcile out-of-band version writes (REST save, Restore, Library edit).
        if (saveResult && contentDirty && typeof this.Content === 'string' && this.ArtifactID) {
            try {
                const payload: ArtifactVersionSavedEventPayload = {
                    ArtifactID: this.ArtifactID,
                    VersionID: this.ID,
                    VersionNumber: this.VersionNumber,
                    Content: this.Content,
                    PreviousContent: previousContentValue,
                    UpdatedByUserID: this.UserID || this.ContextCurrentUser?.ID
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
    }

    /**
     * Enforces `ArtifactPermissionEngine` `CanDelete` on `this.ArtifactID` for non-system users (`Blocker 2`).
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const actor = this.ContextCurrentUser;
        if (!isServerSystemUser(actor)) {
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
        return super.Delete(options);
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
