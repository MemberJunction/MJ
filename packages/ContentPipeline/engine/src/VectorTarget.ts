/**
 * @fileoverview Where a record's vectors go, resolved from metadata.
 *
 * There is no driver contract here and no class key in a Record Process's Options. MJ already
 * describes this entirely in data: a Content Source (or failing that its Content Type) names a
 * `MJ: Vector Indexes` row, that row names the vector database, the embedding model, the index name
 * and its dimensions, and the database row names the registered `VectorDBBase` class and the
 * credential its key comes from. Resolving from there means every provider MJ registers is usable,
 * namespace routing and provider directives come from the provider rather than from us, and moving
 * a source to a different index is an edit to one field.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogStatus, UserInfo } from '@memberjunction/core';
import {
    KnowledgeHubMetadataEngine,
    MJVectorDatabaseEntity,
    MJVectorIndexEntity,
} from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { CredentialEngine } from '@memberjunction/credentials';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { AIEngine } from '@memberjunction/aiengine';

/** Everything a stage needs to read or write this record's vectors. */
export interface ResolvedVectorTarget {
    /** The instantiated provider. */
    Database: VectorDBBase;
    /** The index to write into — `VectorIndex.ExternalID`, falling back to its name. */
    IndexName: string;
    /** The embedding model, from the Content Type's override or the index's own. */
    EmbeddingModelID: string | null;
    /** Reduced dimensions, when the index declares them. */
    Dimensions: number | null;
    /** Provider-specific routing — namespace and the like — straight off the index row. */
    ProviderConfig: Record<string, unknown> | undefined;
    /** The index row, for anything a caller needs that is not summarised here. */
    Index: MJVectorIndexEntity;
}

/**
 * Resolve the vector target for a content source.
 *
 * Cached per source for the life of the resolver: a page of five hundred chunks shares one index,
 * one provider instance and one credential lookup.
 */
export class VectorTargetResolver {
    private readonly cache = new Map<string, Promise<ResolvedVectorTarget>>();

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /** The target for a content source, resolved through its type when the source names none. */
    public Resolve(contentSourceID: string): Promise<ResolvedVectorTarget> {
        const existing = this.cache.get(contentSourceID);
        if (existing) {
            return existing;
        }
        const promise = this.load(contentSourceID).catch((error: unknown) => {
            // A failed resolution must not be cached, or one transient credential failure poisons
            // every later record in the run.
            this.cache.delete(contentSourceID);
            throw error;
        });
        this.cache.set(contentSourceID, promise);
        return promise;
    }

    private async load(contentSourceID: string): Promise<ResolvedVectorTarget> {
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        await knowledge.Config(false, this.contextUser, this.provider);
        const source = knowledge.ContentSources.find((s) => UUIDsEqual(s.ID, contentSourceID));
        if (!source) {
            throw new Error(`Content Source '${contentSourceID}' not found`);
        }
        const contentType = source.ContentTypeID
            ? knowledge.ContentTypes.find((t) => UUIDsEqual(t.ID, source.ContentTypeID))
            : undefined;

        // Source first, then its content type. Nothing falls back to a global default: writing a
        // tenant's vectors into whichever index happened to be first is worse than refusing.
        const indexID = source.VectorIndexID ?? contentType?.VectorIndexID ?? null;
        if (!indexID) {
            throw new Error(
                `Neither Content Source '${source.Name}' nor its Content Type names a Vector Index, ` +
                    'so there is nowhere to write its vectors.',
            );
        }

        await AIEngine.Instance.Config(false, this.contextUser, this.provider);
        const index = AIEngine.Instance.VectorIndexes?.find((i) => UUIDsEqual(i.ID, indexID));
        if (!index) {
            throw new Error(`Vector Index '${indexID}' is not in metadata`);
        }
        const databaseEntity = await this.loadDatabase(index.VectorDatabaseID);
        const database = await this.instantiate(databaseEntity);

        return {
            Database: database,
            IndexName: index.ExternalID || index.Name,
            // The content type's model wins where it has one — a type may be embedded differently
            // from the rest of its index — otherwise the index's own.
            EmbeddingModelID: contentType?.EmbeddingModelID ?? index.EmbeddingModelID ?? null,
            Dimensions: index.Dimensions ?? null,
            ProviderConfig: this.parseProviderConfig(index),
            Index: index,
        };
    }

    /** The `MJ: Vector Databases` row naming the driver class and the credential for its key. */
    private async loadDatabase(databaseID: string): Promise<MJVectorDatabaseEntity> {
        await AIEngine.Instance.Config(false, this.contextUser, this.provider);
        const entity = AIEngine.Instance.VectorDatabases?.find((d) => UUIDsEqual(d.ID, databaseID));
        if (!entity) {
            throw new Error(`Vector Database '${databaseID}' is not in metadata`);
        }
        return entity;
    }

    /** Build the registered provider, with whatever key its credential supplies. */
    private async instantiate(entity: MJVectorDatabaseEntity): Promise<VectorDBBase> {
        const apiKey = await this.resolveAPIKey(entity);
        // A sentinel rather than an empty string: colocated providers authenticate through the host
        // connection wired below, and the base constructor rejects an empty key.
        const database = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase,
            entity.ClassKey,
            apiKey || 'colocated',
        );
        if (!database) {
            throw new Error(`No vector database driver is registered for ClassKey '${entity.ClassKey}'`);
        }
        database.TryWireColocatedHost(this.provider);
        if (!database.SupportsColocatedQuery && database.RequiresAPIKey && !apiKey) {
            throw new Error(`Vector database '${entity.Name}' requires an API key and none is configured`);
        }
        return database;
    }

    /**
     * The database's key, from `MJ: Credentials`.
     *
     * Secrets live there and nowhere else — not in a Record Process's Options, not in a source's
     * Configuration. An empty result is legitimate for in-process and colocated providers, so the
     * caller decides whether the absence is fatal.
     */
    private async resolveAPIKey(entity: MJVectorDatabaseEntity): Promise<string> {
        if (!entity.CredentialID) {
            return '';
        }
        await CredentialEngine.Instance.Config(false, this.contextUser, this.provider);
        const credential = CredentialEngine.Instance.getCredentialById(entity.CredentialID);
        if (!credential) {
            LogStatus(`VectorTargetResolver: credential '${entity.CredentialID}' not found for '${entity.Name}'`);
            return '';
        }
        const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
            credentialId: entity.CredentialID,
        });
        const apiKey = resolved?.values?.apiKey;
        return typeof apiKey === 'string' ? apiKey : '';
    }

    /** `VectorIndex.ProviderConfig` — namespace and other provider routing, as stored. */
    private parseProviderConfig(index: MJVectorIndexEntity): Record<string, unknown> | undefined {
        if (!index.ProviderConfig) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(index.ProviderConfig) as unknown;
            return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
        } catch {
            throw new Error(`Vector Index '${index.Name}' has a ProviderConfig that is not valid JSON`);
        }
    }
}
