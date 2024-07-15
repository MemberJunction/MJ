import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { ArchiveWorkerContext } from '../entityVectorSync'
import type { WorkerData } from '../BatchWorker';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { MJGlobal } from '@memberjunction/global';
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';
import { LogError } from '@memberjunction/core';
import { EmbeddingData } from '../../generic/vectorSync.types';

LoadPineconeVectorDB();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function UpsertVectorRecords() {
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
    const recordID = embedding.__mj_recordID;
    //The id breaks down to e.g. "Accounts_7_117"
    embedding.VectorID = `${entityDocument.Entity}_${entityDocument.ID}_${recordID}`; 
    return {
      id: embedding.VectorID.toString(),
      values: embedding.Vector,
    };
  });

  const response: BaseResponse = await vectorDB.createRecords(vectorRecords);
  if (!response.success) {
    LogError('Unable to successfully save records to vector database', undefined, response.message);
  }
  
  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Upserting records to vector database: Complete #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  await delay(250); //short deplay to avoid getting rate limited by the embedding model's api 
  parentPort.postMessage({ ...workerData, ...batch });
}

UpsertVectorRecords();
