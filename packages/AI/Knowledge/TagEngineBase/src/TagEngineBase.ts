import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, Metadata, LogError } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { MJTagEntity, MJTaggedItemEntity } from '@memberjunction/core-entities';

/**
 * Tree node representing a tag in its hierarchical taxonomy.
 * Used for serializing the tag hierarchy to LLM prompts.
 */
export interface TagTreeNode {
    /** The unique identifier of the tag */
    ID: string;
    /** The internal name of the tag */
    Name: string;
    /** The human-readable display name */
    DisplayName: string;
    /** Optional description of the tag */
    Description: string | null;
    /** Child tags in the hierarchy */
    Children: TagTreeNode[];
}

/**
 * Client+server shared engine that loads all Tags and TaggedItems at startup and provides
 * hierarchy helpers, taxonomy serialization, and CRUD operations.
 *
 * Follows the BaseEngine pattern: call Config() once at startup, then use the cached data.
 */
@RegisterClass(BaseEngine, 'TagEngineBase')
export class TagEngineBase extends BaseEngine<TagEngineBase> {
    public static get Instance(): TagEngineBase {
        return super.getInstance<TagEngineBase>();
    }

    private _Tags: MJTagEntity[] = [];
    private _TaggedItems: MJTaggedItemEntity[] = [];

    /** All loaded Tag entities */
    public get Tags(): MJTagEntity[] {
        return this._Tags;
    }

    /** All loaded TaggedItem entities */
    public get TaggedItems(): MJTaggedItemEntity[] {
        return this._TaggedItems;
    }

    /**
     * Initialize the engine by loading Tags and TaggedItems from the database.
     * @param forceRefresh - If true, reload even if already loaded
     * @param contextUser - Required for server-side operations
     * @param provider - Optional metadata provider override
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Tags',
                PropertyName: '_Tags'
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Tagged Items',
                PropertyName: '_TaggedItems'
            },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ========================================================================
    // Lookup Helpers
    // ========================================================================

    /**
     * Find a tag by its ID using case-insensitive UUID comparison.
     * @param id - The tag ID to search for
     * @returns The matching tag, or undefined if not found
     */
    public GetTagByID(id: string): MJTagEntity | undefined {
        return this._Tags.find(t => UUIDsEqual(t.ID, id));
    }

    /**
     * Find a tag by its Name using case-insensitive string comparison.
     * Only returns tags with Status='Active' (excludes merged, deprecated, and deleted tags).
     * @param name - The tag name to search for
     * @returns The matching active tag, or undefined if not found
     */
    public GetTagByName(name: string): MJTagEntity | undefined {
        const lowerName = name.trim().toLowerCase();
        return this._Tags.find(t => t.Name.trim().toLowerCase() === lowerName && t.Status === 'Active');
    }

    /**
     * Get direct children of a given parent tag.
     * @param parentID - The parent tag ID
     * @returns Array of tags whose ParentID matches the given ID
     */
    public GetChildTags(parentID: string): MJTagEntity[] {
        return this._Tags.filter(t => UUIDsEqual(t.ParentID, parentID));
    }

    /**
     * Get all descendants of a given root tag, recursively.
     * @param rootID - The root tag ID
     * @returns Flat array of all descendant tags (does not include the root itself)
     */
    public GetSubtree(rootID: string): MJTagEntity[] {
        const result: MJTagEntity[] = [];
        this.collectDescendants(rootID, result);
        return result;
    }

    /**
     * Recursively collect all descendants of a tag into the result array.
     */
    private collectDescendants(parentID: string, result: MJTagEntity[]): void {
        const children = this.GetChildTags(parentID);
        for (const child of children) {
            result.push(child);
            this.collectDescendants(child.ID, result);
        }
    }

    /**
     * Get all tagged items associated with a specific entity record.
     * @param entityID - The entity ID (from the Entities metadata table)
     * @param recordID - The specific record ID within that entity
     * @returns Array of TaggedItem entities matching both entityID and recordID
     */
    public GetTaggedItemsForRecord(entityID: string, recordID: string): MJTaggedItemEntity[] {
        return this._TaggedItems.filter(
            ti => UUIDsEqual(ti.EntityID, entityID) && UUIDsEqual(ti.RecordID, recordID)
        );
    }

    // ========================================================================
    // Taxonomy Serialization
    // ========================================================================

    /**
     * Build a hierarchical tree of TagTreeNode objects for LLM prompt injection.
     * @param rootID - If provided, only build the subtree rooted at this tag.
     *                 If omitted, build the full forest from all root-level tags.
     * @returns Array of top-level TagTreeNode objects with nested Children
     */
    public GetTaxonomyTree(rootID?: string): TagTreeNode[] {
        if (rootID) {
            const root = this.GetTagByID(rootID);
            if (!root) {
                return [];
            }
            return [this.buildTreeNode(root)];
        }
        // Build forest from all root-level tags (those with no parent)
        const rootTags = this._Tags.filter(t => t.ParentID == null);
        return rootTags.map(t => this.buildTreeNode(t));
    }

    /**
     * Recursively build a TagTreeNode from a tag entity.
     */
    private buildTreeNode(tag: MJTagEntity): TagTreeNode {
        const children = this.GetChildTags(tag.ID);
        return {
            ID: tag.ID,
            Name: tag.Name,
            DisplayName: tag.DisplayName,
            Description: tag.Description,
            Children: children.map(c => this.buildTreeNode(c))
        };
    }

    // ========================================================================
    // CRUD Helpers
    // ========================================================================

    /**
     * Create a new Tag entity, save it to the database, and add it to the local cache.
     * @param name - The internal name for the tag
     * @param displayName - The human-readable display name
     * @param parentID - The parent tag ID, or null for a root-level tag
     * @param description - Optional description
     * @param contextUser - The user context for the operation
     * @returns The newly created and saved MJTagEntity
     */
    public async CreateTag(
        name: string,
        displayName: string,
        parentID: string | null,
        description: string | null,
        contextUser: UserInfo
    ): Promise<MJTagEntity> {
        const md = new Metadata();
        const tag = await md.GetEntityObject<MJTagEntity>('MJ: Tags', contextUser);
        tag.NewRecord();
        tag.Name = name;
        tag.DisplayName = displayName;
        tag.ParentID = parentID;
        tag.Description = description;

        const saved = await tag.Save();
        if (!saved) {
            throw new Error(`Failed to save new tag "${name}": ${tag.LatestResult?.Message ?? 'Unknown error'}`);
        }

        this._Tags.push(tag);
        return tag;
    }

    /**
     * Create a new TaggedItem linking a tag to an entity record, or update the weight
     * if a TaggedItem for that tag+entity+record combination already exists.
     *
     * @param tagID - The tag to associate
     * @param entityID - The entity ID (from the Entities metadata)
     * @param recordID - The specific record ID
     * @param weight - Relevance weight (0.0 to 1.0)
     * @param contextUser - The user context for the operation
     * @returns The created or updated MJTaggedItemEntity
     */
    public async CreateTaggedItem(
        tagID: string,
        entityID: string,
        recordID: string,
        weight: number,
        contextUser: UserInfo
    ): Promise<MJTaggedItemEntity> {
        // Check for existing TaggedItem with same tag+entity+record
        const existing = this._TaggedItems.find(
            ti => UUIDsEqual(ti.TagID, tagID) &&
                  UUIDsEqual(ti.EntityID, entityID) &&
                  UUIDsEqual(ti.RecordID, recordID)
        );

        if (existing) {
            return this.updateExistingTaggedItem(existing, weight);
        }

        return this.createNewTaggedItem(tagID, entityID, recordID, weight, contextUser);
    }

    /**
     * Update the weight of an existing tagged item and save it.
     */
    private async updateExistingTaggedItem(
        item: MJTaggedItemEntity,
        weight: number
    ): Promise<MJTaggedItemEntity> {
        item.Weight = weight;
        const saved = await item.Save();
        if (!saved) {
            throw new Error(`Failed to update tagged item weight: ${item.LatestResult?.Message ?? 'Unknown error'}`);
        }
        return item;
    }

    /**
     * Create a brand new tagged item, save it, and add it to the local cache.
     */
    private async createNewTaggedItem(
        tagID: string,
        entityID: string,
        recordID: string,
        weight: number,
        contextUser: UserInfo
    ): Promise<MJTaggedItemEntity> {
        const md = new Metadata();
        const item = await md.GetEntityObject<MJTaggedItemEntity>('MJ: Tagged Items', contextUser);
        item.NewRecord();
        item.TagID = tagID;
        item.EntityID = entityID;
        item.RecordID = recordID;
        item.Weight = weight;

        const saved = await item.Save();
        if (!saved) {
            throw new Error(`Failed to save new tagged item: ${item.LatestResult?.Message ?? 'Unknown error'}`);
        }

        this._TaggedItems.push(item);
        return item;
    }
}
