import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, Metadata, RunView, LogError } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJTagEntity, MJTaggedItemEntity, MJTagScopeEntity, MJTagSynonymEntity } from '@memberjunction/core-entities';
import { TagScopeContext } from './TagScopeContext';
import { TagScopeFilterBuilder } from './TagScopeFilterBuilder';

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
 * Client+server shared engine that loads all Tags at startup and provides
 * hierarchy helpers, taxonomy serialization, and CRUD operations.
 *
 * Follows the BaseEngine pattern: call Config() once at startup, then use the cached data.
 *
 * Note: TaggedItems are NOT loaded at startup (they don't scale). Use RunView to query
 * TaggedItems on demand. The CreateTaggedItem() method handles this internally.
 */
@RegisterClass(BaseEngine, 'TagEngineBase')
export class TagEngineBase extends BaseEngine<TagEngineBase> {
    public static get Instance(): TagEngineBase {
        return super.getInstance<TagEngineBase>();
    }

    private _Tags: MJTagEntity[] = [];
    private _TagScopes: MJTagScopeEntity[] = [];
    private _TagSynonyms: MJTagSynonymEntity[] = [];

    /** TagID → list of TagScope rows, populated lazily after Config(). */
    private _scopesByTagID: Map<string, MJTagScopeEntity[]> | null = null;

    /** lowercased synonym text → TagID, populated lazily after Config(). */
    private _synonymIndex: Map<string, string> | null = null;

    /** All loaded Tag entities */
    public get Tags(): MJTagEntity[] {
        return this._Tags;
    }

    /** All loaded TagScope rows. */
    public get TagScopes(): MJTagScopeEntity[] {
        return this._TagScopes;
    }

    /** All loaded TagSynonym rows. */
    public get TagSynonyms(): MJTagSynonymEntity[] {
        return this._TagSynonyms;
    }

    /**
     * Initialize the engine by loading Tags + TagScopes + TagSynonyms from the
     * database. Scopes and synonyms are loaded eagerly because both are
     * consulted in hot paths (visibility filtering, ResolveTag synonym tier).
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
                EntityName: 'MJ: Tag Scopes',
                PropertyName: '_TagScopes'
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Tag Synonyms',
                PropertyName: '_TagSynonyms'
            },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
        this.rebuildScopeIndex();
        this.rebuildSynonymIndex();
    }

    /** Returns the TagScope rows attached to the given Tag (always non-null). */
    public GetScopesForTag(tagID: string): MJTagScopeEntity[] {
        if (!this._scopesByTagID) this.rebuildScopeIndex();
        return this._scopesByTagID!.get(tagID) ?? [];
    }

    /**
     * Resolve a synonym (or tag name) to a Tag, applying scope filtering when
     * a context is supplied. Case-insensitive on the synonym. Returns
     * `undefined` if no match or the matched tag isn't visible in scope.
     */
    public GetTagBySynonym(synonym: string, ctx?: TagScopeContext): MJTagEntity | undefined {
        if (!this._synonymIndex) this.rebuildSynonymIndex();
        const tagID = this._synonymIndex!.get(synonym.trim().toLowerCase());
        if (!tagID) return undefined;
        const tag = this.GetTagByID(tagID);
        if (!tag || tag.Status !== 'Active') return undefined;
        if (ctx) {
            const filter = TagScopeFilterBuilder.Instance.buildInMemoryFilter(ctx, this.scopesByTagIDMap());
            if (!filter(tag)) return undefined;
        }
        return tag;
    }

    /**
     * Return the subset of `Tags` visible under the supplied context. When
     * `ctx` is omitted, returns all `Active` tags (legacy behavior).
     */
    public GetVisibleTags(ctx?: TagScopeContext): MJTagEntity[] {
        const filter = TagScopeFilterBuilder.Instance.buildInMemoryFilter(ctx, this.scopesByTagIDMap());
        return this._Tags.filter(filter);
    }

    private scopesByTagIDMap(): Map<string, Array<{ScopeEntityID: string; ScopeRecordID: string}>> {
        if (!this._scopesByTagID) this.rebuildScopeIndex();
        const out = new Map<string, Array<{ScopeEntityID: string; ScopeRecordID: string}>>();
        for (const [tagID, rows] of this._scopesByTagID!) {
            out.set(tagID, rows.map(r => ({ ScopeEntityID: r.ScopeEntityID, ScopeRecordID: r.ScopeRecordID })));
        }
        return out;
    }

    private rebuildScopeIndex(): void {
        const map = new Map<string, MJTagScopeEntity[]>();
        for (const row of this._TagScopes) {
            const list = map.get(row.TagID);
            if (list) list.push(row);
            else map.set(row.TagID, [row]);
        }
        this._scopesByTagID = map;
    }

    private rebuildSynonymIndex(): void {
        const map = new Map<string, string>();
        // Tag names themselves are implicit synonyms for back-compat with
        // ResolveTag's exact-match tier — but we only insert explicit Synonym
        // rows here so the ResolveTag synonym pre-tier doesn't shadow the
        // exact-match tier. The exact-match tier lives in GetTagByName.
        for (const row of this._TagSynonyms) {
            const key = row.Synonym?.trim().toLowerCase();
            if (key && !map.has(key)) {
                map.set(key, row.TagID);
            }
        }
        this._synonymIndex = map;
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
     *
     * When a `ctx` is supplied, the returned tag must also be visible under
     * that scope (global, or owned by one of the context's scope rows).
     *
     * @param name - The tag name to search for
     * @param ctx - Optional scope filter
     * @returns The matching active+visible tag, or undefined if not found
     */
    public GetTagByName(name: string, ctx?: TagScopeContext): MJTagEntity | undefined {
        const lowerName = name.trim().toLowerCase();
        const candidate = this._Tags.find(t => t.Name.trim().toLowerCase() === lowerName && t.Status === 'Active');
        if (!candidate) return undefined;
        if (!ctx) return candidate;
        const filter = TagScopeFilterBuilder.Instance.buildInMemoryFilter(ctx, this.scopesByTagIDMap());
        return filter(candidate) ? candidate : undefined;
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

    // ========================================================================
    // Taxonomy Serialization
    // ========================================================================

    /**
     * Build a hierarchical tree of TagTreeNode objects for LLM prompt injection.
     *
     * When `ctx` is supplied, only tags visible under that scope are included.
     * Hidden tags are pruned from the tree; their visible children, if any,
     * are NOT promoted to the next level (we keep the structure honest — a
     * hidden parent's children are also hidden, even if those children are
     * marked global, because their position in the taxonomy is anchored to
     * the hidden parent). For the rare case where you want global descendants
     * of a hidden parent visible, query with `globalOnly: true`.
     *
     * @param rootID - If provided, only build the subtree rooted at this tag.
     *                 If omitted, build the full forest from all root-level tags.
     * @param ctx - Optional scope filter
     * @returns Array of top-level TagTreeNode objects with nested Children
     */
    public GetTaxonomyTree(rootID?: string, ctx?: TagScopeContext): TagTreeNode[] {
        const filter = ctx
            ? TagScopeFilterBuilder.Instance.buildInMemoryFilter(ctx, this.scopesByTagIDMap())
            : null;

        if (rootID) {
            const root = this.GetTagByID(rootID);
            if (!root) return [];
            if (filter && !filter(root)) return [];
            return [this.buildTreeNode(root, filter)];
        }
        const rootTags = this._Tags.filter(t => t.ParentID == null);
        return rootTags
            .filter(t => !filter || filter(t))
            .map(t => this.buildTreeNode(t, filter));
    }

    /**
     * Recursively build a TagTreeNode from a tag entity, optionally pruning
     * children that fail the visibility filter.
     */
    private buildTreeNode(tag: MJTagEntity, filter?: ((t: MJTagEntity) => boolean) | null): TagTreeNode {
        const children = this.GetChildTags(tag.ID).filter(c => !filter || filter(c));
        return {
            ID: tag.ID,
            Name: tag.Name,
            DisplayName: tag.DisplayName,
            Description: tag.Description,
            Children: children.map(c => this.buildTreeNode(c, filter))
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
        const md = this.ProviderToUse;
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
     * Uses a RunView query to check for duplicates instead of an in-memory cache,
     * since loading all TaggedItems at startup does not scale.
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
        // Check for existing TaggedItem with same tag+entity+record via DB query
        const existing = await this.findExistingTaggedItem(tagID, entityID, recordID, contextUser);

        if (existing) {
            return this.updateExistingTaggedItem(existing, weight);
        }

        return this.createNewTaggedItem(tagID, entityID, recordID, weight, contextUser);
    }

    /**
     * Query the database for an existing TaggedItem matching the given tag+entity+record.
     */
    private async findExistingTaggedItem(
        tagID: string,
        entityID: string,
        recordID: string,
        contextUser: UserInfo
    ): Promise<MJTaggedItemEntity | null> {
        const rv = this.RunViewProviderToUse;
        const result = await rv.RunView<MJTaggedItemEntity>({
            EntityName: 'MJ: Tagged Items',
            ExtraFilter: `TagID='${tagID}' AND EntityID='${entityID}' AND RecordID='${recordID}'`,
            ResultType: 'entity_object',
            MaxRows: 1
        }, contextUser);

        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        }
        return null;
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
     * Create a brand new tagged item and save it.
     */
    private async createNewTaggedItem(
        tagID: string,
        entityID: string,
        recordID: string,
        weight: number,
        contextUser: UserInfo
    ): Promise<MJTaggedItemEntity> {
        const md = this.ProviderToUse;
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

        return item;
    }
}
