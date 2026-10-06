/**
 * @fileoverview The vector writer, implemented on MemberJunction's own vector stack.
 *
 * {@link BaseVectorWriter} stays as the stage's seam, because batching and rate-limiting against a
 * particular store's limits is a real concern and the stage should not carry it. What changed after
 * review is that this is the only implementation anyone should need: it resolves a vector database
 * through `MJ: Vector Databases` and embeds through `AIEmbeddingRunner`, so every provider MJ
 * already registers — Pinecone, Qdrant, pgvector, SQL Server, the in-memory ones — is available to
 * a content source without a line of code here per vendor.
 *
 * Writing a second implementation should be unnecessary. If a store needs different behaviour, the
 * right place for it is a `VectorDBBase` driver, where the rest of MJ gets it too.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJVectorDatabaseEntity } from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import { RecordMetadata, VectorDBBase, VectorRecord as MJVectorRecord } from '@memberjunction/ai-vectordb';
import {
    BaseVectorWriter,
    VectorMetadataUpdate,
    VectorRecord,
    VectorWriteContext,
    VectorWriteOutcome,
} from '@memberjunction/content-pipeline-base';

/** The default writer key — what a source gets when it names none. */
export const MJ_VECTOR_WRITER = 'MJVectorStore';

/** Settings a run supplies for the store it is writing to. */
interface ResolvedTarget {
    Database: VectorDBBase;
    IndexName: string;
    /**
     * The partition within the index.
     *
     * Several providers treat this as required and silently write to a default partition when it is
     * missing, which puts one tenant's vectors where another tenant's search will find them. When a
     * run declares one, it is passed through; when a provider requires one and nothing declared it,
     * the write fails rather than guessing.
     */
    Namespace?: string;
    ModelID?: string;
    Dimensions?: number;
}

/**
 * Narrow arbitrary metadata to what a vector store will accept.
 *
 * Stores take scalars and string arrays, not nested objects. Serialising the rest rather than
 * dropping it keeps the value retrievable, and keeps a nested object from failing the whole batch at
 * the provider with an error that names only the record.
 */
function toStoreMetadata(metadata: Record<string, unknown>): RecordMetadata {
    const out: RecordMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (value === null || value === undefined) {
            continue;
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            out[key] = value;
        } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
            out[key] = value as string[];
        } else {
            out[key] = JSON.stringify(value);
        }
    }
    return out;
}

@RegisterClass(BaseVectorWriter, MJ_VECTOR_WRITER)
export class MJVectorStoreWriter extends BaseVectorWriter {
    public readonly Key = MJ_VECTOR_WRITER;

    public async Upsert(
        records: readonly VectorRecord[],
        context: VectorWriteContext,
    ): Promise<VectorWriteOutcome[]> {
        if (records.length === 0) {
            return [];
        }
        const target = await this.resolveTarget(context);
        const embedding = await new AIEmbeddingRunner().RunEmbedding({
            Texts: records.map((r) => r.Text),
            // Named explicitly: these vectors are compared against stored vectors, so every one of
            // them has to come from the same model rather than whichever the prompt fell back to.
            ModelID: target.ModelID,
            Dimensions: target.Dimensions,
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Description: 'Content pipeline Embed stage',
        });
        if (!embedding.Success) {
            // One failed call fails the page, and transiently: the texts are unchanged, so a retry
            // is the right response rather than marking every record permanently failed.
            return records.map((r) => ({
                RecordID: r.RecordID,
                Success: false,
                Message: embedding.ErrorMessage ?? 'embedding failed',
                IsTransient: true,
            }));
        }

        const payload: MJVectorRecord[] = records.map((record, i) => ({
            id: record.RecordID,
            values: embedding.Vectors[i],
            metadata: toStoreMetadata({ ...record.Metadata, EmbeddingModelID: embedding.ModelID }),
        }));
        return this.write(records, payload, target, context);
    }

    /**
     * Replace stored metadata without re-embedding.
     *
     * Implemented as an upsert of the metadata alone — MJ's providers treat a record written without
     * values as a metadata update — so a record whose tags changed does not pay for a model call to
     * reproduce the vector it already has.
     */
    public override async UpdateMetadata(
        records: readonly VectorMetadataUpdate[],
        context: VectorWriteContext,
    ): Promise<VectorWriteOutcome[]> {
        if (records.length === 0) {
            return [];
        }
        const target = await this.resolveTarget(context);
        const payload: MJVectorRecord[] = records.map((record) => ({
            id: record.RecordID,
            values: [],
            metadata: toStoreMetadata(record.Metadata),
        }));
        return this.write(records, payload, target, context);
    }

    /** Hand the batch to the store, and report per-record what happened. */
    private async write(
        records: readonly { RecordID: string }[],
        payload: MJVectorRecord[],
        target: ResolvedTarget,
        context: VectorWriteContext,
    ): Promise<VectorWriteOutcome[]> {
        if (target.Database.IsReadOnly) {
            return records.map((r) => ({
                RecordID: r.RecordID,
                Success: false,
                Message: 'the configured vector database is read-only',
            }));
        }
        try {
            const response = await target.Database.CreateRecords(
                payload,
                target.IndexName,
                target.Namespace ? { namespace: target.Namespace } : undefined,
            );
            if (response.success === false) {
                throw new Error(response.message ?? 'the vector store rejected the batch');
            }
            context.ReportProgress(`stored ${payload.length} vector(s)`);
            return records.map((r) => ({ RecordID: r.RecordID, Success: true }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`MJVectorStoreWriter: writing ${payload.length} vector(s) failed: ${message}`);
            return records.map((r) => ({ RecordID: r.RecordID, Success: false, Message: message, IsTransient: true }));
        }
    }

    /** The vector database, index and partition this run writes to. */
    private async resolveTarget(context: VectorWriteContext): Promise<ResolvedTarget> {
        const configuration = context.Configuration;
        const databaseID = configuration.VectorDatabaseID as string | undefined;
        const indexName = configuration.VectorIndexName as string | undefined;
        if (!databaseID || !indexName) {
            throw new Error(
                'Embed needs VectorDatabaseID and VectorIndexName in the run configuration to know where to write.',
            );
        }
        const entity = await this.loadDatabase(databaseID, context.ContextUser);
        const apiKey = (configuration.VectorDatabaseAPIKey as string | undefined) ?? '';
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
        database.TryWireColocatedHost(context.Provider);
        if (!database.SupportsColocatedQuery && database.RequiresAPIKey && !apiKey) {
            throw new Error(`Vector database '${entity.Name}' requires an API key and none is configured`);
        }
        return {
            Database: database,
            IndexName: indexName,
            Namespace: (configuration.VectorNamespace as string | undefined) || undefined,
            ModelID: configuration.EmbeddingModelID as string | undefined,
            Dimensions: typeof configuration.EmbeddingDimensions === 'number' ? configuration.EmbeddingDimensions : undefined,
        };
    }

    /** The `MJ: Vector Databases` row naming the driver to use. */
    private async loadDatabase(databaseID: string, contextUser: UserInfo): Promise<MJVectorDatabaseEntity> {
        const entity = await Metadata.Provider.GetEntityObject<MJVectorDatabaseEntity>(
            'MJ: Vector Databases',
            contextUser,
        );
        if (!(await entity.Load(databaseID))) {
            throw new Error(`Vector Database '${databaseID}' could not be loaded`);
        }
        return entity;
    }
}
