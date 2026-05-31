import { BaseEmbeddings, EmbedTextsResult } from "@memberjunction/ai";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { BaseEntity, UserInfo } from "@memberjunction/core";
import { MJEntityDocumentEntity, MJTemplateContentEntity, MJTemplateEntityExtended } from "@memberjunction/core-entities";

export type VectorizeEntityParams = {
    entityID: string;
    entityDocumentID?: string;
    /**
     * If defined, all records within the given list will be vectorized
     * instead of all records within the entity. Note that the list's
     * EntityID field must equal the entityID parameter.
    */
    listID?: string;
    /**
     * The number of records to fetch from the list at a time. Defaults to 50.
     */
    listBatchCount?: number;
    /**
     * The number of records to vectorize at a time. Defaults to 50.
     */
    VectorizeBatchCount?: number;
    /**
     * The number of records to upsert to the vector database at a time. Defaults to 50.
     */
    UpsertBatchCount?: number;
    /**
     * The UserInfo object to use
     */
    CurrentUser?: UserInfo;
    /**
     * The number of records to skip before starting to fetch records from the list.
     */
    StartingOffset?: number;
    options?: VectorizeEntityOptions;
    /**
     * Optional callback invoked during vectorization with progress updates.
     * Called after each batch is upserted to the vector database.
     */
    OnProgress?: (update: VectorizeProgressUpdate) => void;
}

export type VectorizeEntityOptions = {
    /** Delay in ms between API calls to avoid rate limiting */
    delayTimeMS?: number;
    /** Whether to force re-vectorization of already-vectorized records */
    forceRevectorize?: boolean;
}

/**
 * Progress update emitted during vectorization.
 * Pass a callback via VectorizeEntityParams.OnProgress to receive updates.
 */
export type VectorizeProgressUpdate = {
    /** Total records to process (may increase as pages are fetched) */
    TotalRecords: number;
    /** Number of records processed so far */
    ProcessedRecords: number;
    /** Current pipeline stage */
    Stage: 'embedding' | 'upserting' | 'complete' | 'error';
    /** Percent complete (0-100) */
    PercentComplete: number;
    /** Elapsed time in ms since pipeline start */
    ElapsedMs: number;
    /** Records that failed template rendering, if any. Populated at 'complete' stage. */
    Errors?: { RecordID: string; Message: string }[];
}

export type VectorizeEntityResponse = {
    success: boolean;
    status: string;
    errorMessage: string;
}

export type EmbeddingData = {
    ID: number;
    Vector: number[];
    VectorID?: string;
    EntityData: Record<string, unknown>;
    __mj_recordID: string | number;
    __mj_compositeKey?: string;
    /** Plain object representation of the entity document */
    EntityDocument?: Record<string, unknown>;
    TemplateContent?: string;
    VectorIndexID?: string;
};

export type VectorEmeddingData = {
    embedding: BaseEmbeddings;
    vectorDB: VectorDBBase,
    vectorDBClassKey: string,
    vectorDBAPIKey: string,
    embeddingDriverClass: string,
    embeddingAPIKey: string
};

/**
 * @deprecated Worker contexts are no longer used since worker_threads were replaced
 * with main-thread async processing. Kept for backward compatibility.
 */
export type AnnotateWorkerContext = {
    executionId: number;
    entity: BaseEntity;
    entityDocument: Record<string, unknown>;
    template: MJTemplateEntityExtended;
    templateContent: MJTemplateContentEntity;
    embeddingDriverClass: string;
    embeddingAPIKey: string;
    delayTimeMS: number;
  };

/**
 * @deprecated Worker contexts are no longer used since worker_threads were replaced
 * with main-thread async processing. Kept for backward compatibility.
 */
export type ArchiveWorkerContext = {
    executionId: number;
    entity: BaseEntity;
    entityDocument: MJEntityDocumentEntity;
    vectorDBClassKey: string;
    vectorDBAPIKey: string;
    templateContent: MJTemplateContentEntity;
    embeddings: EmbedTextsResult;
    delayTimeMS: number;
  };
  
  export type TemplateParamData = {
    ParamName: string;
    Data: unknown[];
  };