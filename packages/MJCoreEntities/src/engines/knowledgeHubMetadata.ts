import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
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

    private _entityDocuments: MJEntityDocumentEntity[] = [];
    private _vectorIndexes: MJVectorIndexEntity[] = [];
    private _contentSources: MJContentSourceEntity[] = [];
    private _contentTypes: MJContentTypeEntity[] = [];
    private _contentSourceTypes: MJContentSourceTypeEntity[] = [];
    private _contentFileTypes: MJContentFileTypeEntity[] = [];

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

    /** Find an entity document by ID (case-insensitive UUID comparison) */
    public GetEntityDocumentById(id: string): MJEntityDocumentEntity | undefined {
        if (!id) return undefined;
        return this._entityDocuments.find(d => UUIDsEqual(d.ID, id));
    }

    /** Find all entity documents for a given entity name (case-insensitive) */
    public GetEntityDocumentsForEntity(entityName: string): MJEntityDocumentEntity[] {
        if (!entityName) return [];
        const lower = entityName.trim().toLowerCase();
        return this._entityDocuments.filter(d => d.Entity?.trim().toLowerCase() === lower);
    }

    /** Find a vector index by ID (case-insensitive UUID comparison) */
    public GetVectorIndexById(id: string): MJVectorIndexEntity | undefined {
        if (!id) return undefined;
        return this._vectorIndexes.find(v => UUIDsEqual(v.ID, id));
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
