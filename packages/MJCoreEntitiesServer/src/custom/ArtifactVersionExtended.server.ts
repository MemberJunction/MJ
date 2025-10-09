import { BaseEntity, EntitySaveOptions, Metadata, RunView, LogError } from "@memberjunction/core";
import { ArtifactVersionEntity, ArtifactEntity, ArtifactTypeEntity, ArtifactVersionAttributeEntity, ArtifactExtractor } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { createHash } from 'crypto';

@RegisterClass(BaseEntity, "MJ: Artifact Versions")
export class ArtifactVersionExtended extends ArtifactVersionEntity {
    private _pendingAttributes: any[] | null = null;

    /**
     * Overrides base save method to:
     * 1) Automatically calculate the ContentHash field whenever the Content field is changed
     * 2) Automatically extract attributes from the Content field using the ExtractRules from the ArtifactType
     * @param options
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const contentDirty = this.IsSaved === false || this.Fields.find(f => f.Name === "Content")?.Dirty;

        if (contentDirty && this.Content) {
            try {
                // 1. Calculate ContentHash using SHA-256
                this.ContentHash = this.CalculateContentHash(this.Content);

                // 2. Extract attributes (sets Name/Description and stores pending attributes)
                await this.ExtractAndSaveAttributes();
            }
            catch (error) {
                LogError(`Error in ArtifactVersionExtended.Save pre-processing: ${error instanceof Error ? error.message : error}`);
            }
        }

        // Save the main entity
        const saveResult = await super.Save(options);

        // After successful save, create ArtifactVersionAttribute records
        if (saveResult && this._pendingAttributes && this._pendingAttributes.length > 0) {
            try {
                await this.SaveAttributeRecords(this._pendingAttributes);
                this._pendingAttributes = null; // Clear pending attributes
            }
            catch (error) {
                LogError(`Error saving ArtifactVersionAttribute records: ${error instanceof Error ? error.message : error}`);
                // Don't fail the save if attribute creation fails
            }
        }

        return saveResult;
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

        // Load the parent Artifact to get TypeID
        const md = new Metadata();
        const artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.ContextCurrentUser);
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

        const descriptionValue = ArtifactExtractor.GetStandardProperty(extractionResult.attributes, 'description');
        if (descriptionValue !== null && typeof descriptionValue === 'string') {
            this.Description = descriptionValue;
        }

        // We need to save the ArtifactVersion first to get an ID before saving attributes
        // So we'll do this in a post-save hook. For now, store the extraction result
        // so we can save attributes after the main save completes
        this._pendingAttributes = extractionResult.attributes;
    }

    /**
     * Saves extracted attributes as ArtifactVersionAttribute records
     * Deletes existing attributes for this version first
     * @param attributes - Extracted attributes to save
     * @protected
     */
    protected async SaveAttributeRecords(attributes: any[]): Promise<void> {
        if (!this.ID) {
            throw new Error('Cannot save attributes: ArtifactVersion ID is not set');
        }

        const md = new Metadata();

        // Delete existing attributes for this version
        const rv = new RunView();
        const existingAttrs = await rv.RunView<ArtifactVersionAttributeEntity>({
            EntityName: 'MJ: Artifact Version Attributes',
            ExtraFilter: `ArtifactVersionID='${this.ID}'`,
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);

        if (existingAttrs?.Success && existingAttrs.Results?.length > 0) {
            for (const attr of existingAttrs.Results) {
                await attr.Delete();
            }
        }

        // Create new attribute records
        const serialized = ArtifactExtractor.SerializeForStorage(attributes);

        for (const attrData of serialized) {
            const attr = await md.GetEntityObject<ArtifactVersionAttributeEntity>(
                'MJ: Artifact Version Attributes',
                this.ContextCurrentUser
            );

            attr.NewRecord();
            attr.ArtifactVersionID = this.ID;
            attr.Name = attrData.name;
            attr.Type = attrData.type;
            attr.Value = attrData.value;
            attr.StandardProperty = (attrData.standardProperty as 'name' | 'description' | 'displayMarkdown' | 'displayHtml' | null) || null;

            await attr.Save();
        }
    }

    /**
     * Loads the ArtifactType hierarchy from child to root parent
     * @param typeId - Starting ArtifactType ID
     * @returns Array of ArtifactType entities from child to parent
     * @protected
     */
    protected async LoadArtifactTypeHierarchy(typeId: string): Promise<ArtifactTypeEntity[]> {
        const hierarchy: ArtifactTypeEntity[] = [];
        const md = new Metadata();
        let currentTypeId: string | null = typeId;

        // Walk up the hierarchy (max 10 levels to prevent infinite loops)
        let maxDepth = 10;
        while (currentTypeId && maxDepth > 0) {
            const artifactType = await md.GetEntityObject<ArtifactTypeEntity>(
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
}

/**
 * Stub function to ensure this class is not tree shaken out
 */
export function LoadArtifactVersionExtendedServerSubClass() {
    // This function is intentionally empty - it just needs to exist to prevent tree shaking
}
