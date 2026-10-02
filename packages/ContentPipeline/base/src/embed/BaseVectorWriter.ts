/**
 * @fileoverview The vector-store side of Embed.
 *
 * A registered driver rather than a direct dependency on one store's client, for the same reason
 * every other driver here is: which store a deployment uses, and how it batches and rate-limits
 * against that store's own limits, is a deployment's decision.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** One record to embed and store. */
export interface VectorRecord {
    /** The record's key, which becomes the vector's id. */
    RecordID: string;
    /** The text to embed. */
    Text: string;
    /** What to store alongside the vector. */
    Metadata: Record<string, unknown>;
}

/** One record whose metadata changed but whose content did not. */
export interface VectorMetadataUpdate {
    /** The record's key, which is the stored vector's id. */
    RecordID: string;
    /** The metadata to replace. */
    Metadata: Record<string, unknown>;
}

/** What a writer is told about the run it is serving. */
export interface VectorWriteContext {
    /** The acting user. */
    ContextUser: UserInfo;
    /** The provider to read through. */
    Provider: IMetadataProvider;
    /** Anything the deployment configured for this run. */
    Configuration: Readonly<Record<string, unknown>>;
    /** Fires when the run is asked to stop. */
    Signal: AbortSignal;
    /** Report progress during a long write. */
    ReportProgress(message: string): void;
}

/** What happened to one record in a bulk write. */
export interface VectorWriteOutcome {
    RecordID: string;
    Success: boolean;
    /** Why it failed, when it did. */
    Message?: string;
    /** Whether the failure is worth retrying. */
    IsTransient?: boolean;
}

/**
 * A registered way of turning text into stored vectors.
 *
 * Both operations are bulk by design: embedding a page in one model call and upserting it in one
 * store call is the entire reason Embed implements a finalize.
 */
export abstract class BaseVectorWriter {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /**
     * Generate embeddings for a page and upsert them.
     *
     * Sub-batching and rate-limiting against the store's own limits belong here, not in the stage.
     */
    public abstract Upsert(
        records: readonly VectorRecord[],
        context: VectorWriteContext,
    ): Promise<VectorWriteOutcome[]>;

    /**
     * Replace stored metadata without re-embedding.
     *
     * For records whose vector-metadata fields changed while their content did not — re-embedding
     * them would pay a model call to produce the vector that is already there.
     *
     * A writer that cannot do this should leave it unimplemented rather than fake it; the stage
     * falls back to a full embed, which writes the metadata anyway.
     */
    public UpdateMetadata?(
        records: readonly VectorMetadataUpdate[],
        context: VectorWriteContext,
    ): Promise<VectorWriteOutcome[]>;

    /** Resolve a registered writer by key, returning null rather than a hollow base instance. */
    public static Resolve(key: string): BaseVectorWriter | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseVectorWriter>(
            BaseVectorWriter,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}
