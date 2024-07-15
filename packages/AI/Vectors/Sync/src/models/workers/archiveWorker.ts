import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { ArchiveWorkerContext } from '../entityVectorSync'
import type { WorkerData } from '../BatchWorker';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { MJGlobal } from '@memberjunction/global';
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';
import { LogError, LogStatus } from '@memberjunction/core';
import { EntityRecordDocumentEntity } from '@memberjunction/core-entities';

LoadPineconeVectorDB();

type EmbeddingBatch = {
  ID: number;
  Vector: number[];
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function UpsertVectorRecords() {
  const { batch, context } = workerData as WorkerData<ArchiveWorkerContext>;

  const embeddingsBatch: EmbeddingBatch[] = batch as any;
  if(!embeddingsBatch){
    throw new Error('Embeddings are required for the ArchiveWorker');
  }
  
  const entityDocument = context.entityDocument;
  const vectorDB: VectorDBBase = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, context.vectorDBClassKey, context.vectorDBAPIKey);
  
  const startTime = Date.now();
  console.log('\t##### Archiver started #####', { threadId, now: Date.now() % 10_000, elapsed: Date.now() - context.executionId });
  
  const vectorRecords: VectorRecord[] = embeddingsBatch.map((embedding: EmbeddingBatch) => {
    return {
      //The id breaks down to e.g. "Accounts_7_117"
      id: `${entityDocument.Entity}_${entityDocument.ID}_${uuidv4()}`,
      values: embedding.Vector,
    };
  });

  const response: BaseResponse = await vectorDB.createRecords(vectorRecords);
  if (response.success) {
    LogStatus('Successfully created vector records, creating associated Entity Record Documents...');
    /*
    for (const [index, vectorRecord] of vectorRecords.entries()) {
      try {
        let erdEntity: EntityRecordDocumentEntity = await super.Metadata.GetEntityObject('Entity Record Documents');
        erdEntity.NewRecord();
        erdEntity.EntityID = entityDocument.EntityID;
        erdEntity.RecordID = batch[index].PrimaryKey.ToString();
        erdEntity.DocumentText = templates[index];
        erdEntity.VectorID = vectorRecord.id;
        erdEntity.VectorJSON = JSON.stringify(vectorRecord.values);
        erdEntity.VectorIndexID = vectorIndexEntity.ID;
        erdEntity.EntityRecordUpdatedAt = new Date();
        erdEntity.EntityDocumentID = entityDocument.ID;
        let erdEntitySaveResult: boolean = await super.SaveEntity(erdEntity);
        if (!erdEntitySaveResult) {
          LogError('Error saving Entity Record Document Entity');
        }
      } catch (err) {
        LogError('Error saving Entity Record Document Entity');
        LogError(err);
      }
    }
    */
  } 
  else {
    LogError('Unable to successfully save records to vector database', undefined, response.message);
  }
  
  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Archiver finished #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  await delay(250); //short deplay to avoid getting rate limited by the embedding model's api 
  parentPort.postMessage(workerData);
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

UpsertVectorRecords();
