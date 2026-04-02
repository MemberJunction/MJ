import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import {
    MJEntityDocumentEntity,
    MJVectorIndexEntity,
    MJVectorDatabaseEntity
} from "../generated/entity_subclasses";

/**
 * Caches vector-related metadata (entity documents, vector indexes, vector databases)
 * and provides helper methods for lookups and filtering. Uses BaseEngine for automatic
 * caching and entity-event auto-refresh.
 */
export class VectorMetadataEngine extends BaseEngine<VectorMetadataEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there
     * is only one instance of it in the application. Do not directly create new instances
     * of it, always use this method to get the instance.
     */
    public static get Instance(): VectorMetadataEngine {
        return super.getInstance<VectorMetadataEngine>();
    }

    private _entityDocuments: MJEntityDocumentEntity[] = [];
    private _vectorIndexes: MJVectorIndexEntity[] = [];
    private _vectorDatabases: MJVectorDatabaseEntity[] = [];

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
                EntityName: 'MJ: Vector Databases',
                PropertyName: '_vectorDatabases',
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

    /** All vector databases in the system */
    public get VectorDatabases(): MJVectorDatabaseEntity[] {
        return this._vectorDatabases;
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

    /** Find a vector database by ID (case-insensitive UUID comparison) */
    public GetVectorDatabaseById(id: string): MJVectorDatabaseEntity | undefined {
        if (!id) return undefined;
        return this._vectorDatabases.find(v => UUIDsEqual(v.ID, id));
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
