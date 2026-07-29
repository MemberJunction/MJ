import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { NormalizeUUID } from "@memberjunction/global";
import {
    MJEntityDocumentEntity,
    MJVectorIndexEntity,
    MJContentSourceEntity,
    MJContentTypeEntity,
    MJContentSourceTypeEntity,
    MJContentFileTypeEntity
} from "../generated/entity_subclasses";

/**
 * Caches Knowledge Hub metadata: entity documents, vector indexes, vector databases,
 * content sources, content types, content source types, and content file types.
 * Provides helper methods for lookups and filtering. Uses BaseEngine for automatic
 * caching and entity-event auto-refresh.
 */
export class KnowledgeHubMetadataEngine extends BaseEngine<KnowledgeHubMetadataEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there
     * is only one instance of it in the application. Do not directly create new instances
     * of it, always use this method to get the instance.
     */
    public static get Instance(): KnowledgeHubMetadataEngine {
        return super.getInstance<KnowledgeHubMetadataEngine>();
    }

    protected constructor() {
        super();
        // Any data change (add/update/delete or full refresh, on any cached array) invalidates the
        // by-id indexes wholesale — the cheapest correct strategy, since NotifyDataChange fires on
        // every BaseEngine mutation path. Lazily rebuilt on the next lookup.
        this.DataChange$.subscribe(() => this._idIndexes.clear());
    }

    private _entityDocuments: MJEntityDocumentEntity[] = [];
    private _vectorIndexes: MJVectorIndexEntity[] = [];
    private _contentSources: MJContentSourceEntity[] = [];
    private _contentTypes: MJContentTypeEntity[] = [];
    private _contentSourceTypes: MJContentSourceTypeEntity[] = [];
    private _contentFileTypes: MJContentFileTypeEntity[] = [];

    /**
     * Lazily-built `NormalizeUUID(ID) → row` indexes, one per cached array (keyed by array name),
     * powering the O(1) `Get…ByID` helpers. Cleared wholesale on any {@link DataChange$} emission
     * (see the constructor) so entries never go stale as the underlying caches mutate.
     */
    private _idIndexes = new Map<string, Map<string, BaseEntity>>();

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Entity Documents',
                PropertyName: '_entityDocuments',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Vector Indexes',
                PropertyName: '_vectorIndexes',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Content Sources',
                PropertyName: '_contentSources',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Content Types',
                PropertyName: '_contentTypes',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Content Source Types',
                PropertyName: '_contentSourceTypes',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Content File Types',
                PropertyName: '_contentFileTypes',
                CacheLocal: true
            }
        ];
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    // ================================================================
    // Cached data getters
    // ================================================================

    /** All entity documents in the system (both active and inactive) */
    public get EntityDocuments(): MJEntityDocumentEntity[] {
        return this._entityDocuments;
    }

    /** All vector indexes in the system */
    public get VectorIndexes(): MJVectorIndexEntity[] {
        return this._vectorIndexes;
    }

    /** All content sources */
    public get ContentSources(): MJContentSourceEntity[] {
        return this._contentSources;
    }

    /** All content types */
    public get ContentTypes(): MJContentTypeEntity[] {
        return this._contentTypes;
    }

    /** All content source types (Web, RSS, Email, etc.) */
    public get ContentSourceTypes(): MJContentSourceTypeEntity[] {
        return this._contentSourceTypes;
    }

    /** All content file types (.pdf, .html, etc.) */
    public get ContentFileTypes(): MJContentFileTypeEntity[] {
        return this._contentFileTypes;
    }

    // ================================================================
    // Helper methods
    // ================================================================

    /** Returns only entity documents with Status = 'Active' */
    public GetActiveEntityDocuments(): MJEntityDocumentEntity[] {
        return this._entityDocuments.filter(d => d.Status === 'Active');
    }

    /**
     * Returns a cached `NormalizeUUID(ID) → row` index for one of the engine's cached arrays,
     * building it on first use. The whole index cache is cleared on any {@link DataChange$}
     * emission, so a returned index is always consistent with the current cache contents.
     * O(N) to build once, then O(1) per lookup.
     */
    private getIDIndex<T extends BaseEntity>(key: string, rows: T[], idOf: (row: T) => string): Map<string, T> {
        // Downcast is safe by construction: each `key` is only ever paired with one row type.
        let index = this._idIndexes.get(key) as Map<string, T> | undefined;
        if (!index) {
            index = new Map<string, T>();
            for (const row of rows) {
                const id = idOf(row);
                if (id) index.set(NormalizeUUID(id), row);
            }
            this._idIndexes.set(key, index);
        }
        return index;
    }

    /** Find an entity document by ID (case-insensitive UUID comparison). O(1) after first hit. */
    public GetEntityDocumentByID(id: string): MJEntityDocumentEntity | undefined {
        if (!id) return undefined;
        return this.getIDIndex('entityDocuments', this._entityDocuments, d => d.ID).get(NormalizeUUID(id));
    }

    /** Find a content source by ID (case-insensitive UUID comparison). O(1) after first hit. */
    public GetContentSourceByID(id: string): MJContentSourceEntity | undefined {
        if (!id) return undefined;
        return this.getIDIndex('contentSources', this._contentSources, s => s.ID).get(NormalizeUUID(id));
    }

    /** Find a content type by ID (case-insensitive UUID comparison). O(1) after first hit. */
    public GetContentTypeByID(id: string): MJContentTypeEntity | undefined {
        if (!id) return undefined;
        return this.getIDIndex('contentTypes', this._contentTypes, t => t.ID).get(NormalizeUUID(id));
    }

    /** Find a content source type by ID (case-insensitive UUID comparison). O(1) after first hit. */
    public GetContentSourceTypeByID(id: string): MJContentSourceTypeEntity | undefined {
        if (!id) return undefined;
        return this.getIDIndex('contentSourceTypes', this._contentSourceTypes, t => t.ID).get(NormalizeUUID(id));
    }

    /** Find a content file type by ID (case-insensitive UUID comparison). O(1) after first hit. */
    public GetContentFileTypeByID(id: string): MJContentFileTypeEntity | undefined {
        if (!id) return undefined;
        return this.getIDIndex('contentFileTypes', this._contentFileTypes, t => t.ID).get(NormalizeUUID(id));
    }

    /** Find all entity documents for a given entity name (case-insensitive) */
    public GetEntityDocumentsForEntity(entityName: string): MJEntityDocumentEntity[] {
        if (!entityName) return [];
        const lower = entityName.trim().toLowerCase();
        return this._entityDocuments.filter(d => d.Entity?.trim().toLowerCase() === lower);
    }

    /** Find a vector index by ID (case-insensitive UUID comparison). O(1) after first hit. */
    public GetVectorIndexByID(id: string): MJVectorIndexEntity | undefined {
        if (!id) return undefined;
        return this.getIDIndex('vectorIndexes', this._vectorIndexes, v => v.ID).get(NormalizeUUID(id));
    }

    /**
     * Returns distinct entity names that have active entity documents (for dropdowns).
     * Sorted alphabetically.
     */
    public GetEntitiesWithDocuments(): string[] {
        const nameSet = new Set<string>();
        for (const doc of this._entityDocuments) {
            if (doc.Status === 'Active' && doc.Entity) {
                nameSet.add(doc.Entity);
            }
        }
        return Array.from(nameSet).sort();
    }
}
