import { Embeddings, EmbedTextsResult } from "@memberjunction/ai";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { BaseEntity } from "@memberjunction/core";
import { TemplateContentEntity, EntityDocumentEntity } from "@memberjunction/core-entities";
import { TemplateEntityExtended } from "@memberjunction/templates-base-types";

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
     * The number of records to be vectorized and inserted
     * into the vector database at a time
     */
    batchCount?: number;
    options?: any;
    dataHandlerClassName?: string;
}

export type VectorizeEntityResponse = {
    success: boolean;
    status: string;
    errorMessage: string;
}

export type EmbeddingData = {
    ID: number;
    Vector: number[];
    VectorID?: unknown;
    EntityData: Record<string, any>;
    __mj_recordID: unknown;
    __mj_compositeKey?: unknown;
    //this is a plain object of the entity document
    EntityDocument?: Record<string, unknown>;
    TemplateContent?: string;
    VectorIndexID?: unknown;
};

export type VectorEmeddingData = { 
    embedding: Embeddings; 
    vectorDB: VectorDBBase, 
    vectorDBClassKey: string, 
    vectorDBAPIKey: string, 
    embeddingDriverClass: string, 
    embeddingAPIKey: string 
};

export type AnnotateWorkerContext = {
    executionId: number;
    entity: BaseEntity;
    entityDocument: Record<string, unknown>;
    template: TemplateEntityExtended;
    templateContent: TemplateContentEntity;
    embeddingDriverClass: string;
    embeddingAPIKey: string;
    delayTimeMS: number;
  };
  
  export type ArchiveWorkerContext = {
    executionId: number;
    entity: BaseEntity;
    entityDocument: EntityDocumentEntity;
    vectorDBClassKey: string;
    vectorDBAPIKey: string;
    templateContent: TemplateContentEntity;
    embeddings: EmbedTextsResult;
    delayTimeMS: number;
  };
  
  export type TemplateParamData = {
    ParamName: string;
    Data: unknown[];
  };