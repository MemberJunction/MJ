import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { WorkerData } from '../BatchWorker';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { MJGlobal } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { ArchiveWorkerContext, EmbeddingData } from '../../generic/vectorSync.types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function UpsertVectorRecords() {
  const { batch, context } = workerData as WorkerData<ArchiveWorkerContext>;

  const embeddingsBatch: EmbeddingData[] = batch as any;
  if(!embeddingsBatch){
    throw new Error('Embeddings are required for the ArchiveWorker');
  }
  
  const entityDocument = context.entityDocument;
  const vectorDB: VectorDBBase = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, context.vectorDBClassKey, context.vectorDBAPIKey);
  
  const startTime = Date.now();
  //console.log('\t##### Archiver started #####', { threadId, now: Date.now() % 10_000, elapsed: Date.now() - context.executionId });
  
  const vectorRecords: VectorRecord[] = embeddingsBatch.map((embedding: EmbeddingData) => {
    const guid: string = uuidv4();
    embedding.VectorID = guid; 
    return {
      id: guid,
      values: embedding.Vector,
      metadata: {
        RecordID: embedding.__mj_compositeKey.toString(),
        Entity: entityDocument.Entity,
        TemplateID: context.templateContent.ID,
      }
    };
  });

  const response: BaseResponse = await vectorDB.createRecords(vectorRecords);
  if (!response.success) {
    LogError('Unable to successfully save records to vector database', undefined, response.message);
  }
  
  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Upserting records to vector database: Complete #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  await delay(context.delayTimeMS); //short deplay to avoid getting rate limited by the embedding model's api 
  parentPort.postMessage({ ...workerData, ...batch });
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

UpsertVectorRecords();
