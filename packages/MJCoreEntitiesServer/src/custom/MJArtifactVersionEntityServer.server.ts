import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityDeleteOptions,
    EntitySaveOptions,
    IEntityDataProvider,
    IMetadataProvider,
    LogError,
    Metadata,
    RunView,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    ArtifactExtractor,
    ArtifactPermissionEngine,
    MJArtifactEntity,
    MJArtifactTypeEntity,
    MJArtifactVersionAttributeEntity,
    MJArtifactVersionEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { createHash } from 'crypto';

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

        const contentDirty = this.IsSaved === false || this.GetFieldByName('Content')?.Dirty;

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
