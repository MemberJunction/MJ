import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { WorkerData } from '../BatchWorker';
import { TemplateEngineServer } from '@memberjunction/templates';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { TemplateRenderResult } from '@memberjunction/templates-base-types';
import { LogError } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseEmbeddings, EmbedTextsResult } from '@memberjunction/ai';
import { AnnotateWorkerContext, EmbeddingData } from '../../generic/vectorSync.types';
// AI provider loading now handled by @memberjunction/aiengine

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function VectorizeEntity(): Promise<void> {
  const { batch, context } = workerData as WorkerData<AnnotateWorkerContext>;

  if(!batch){
    throw new Error('batch is required for the AnnotationWorker');
  }

  const template: MJTemplateEntityExtended = context.template;
  const templateContent: MJTemplateContentEntity = context.templateContent;
  TemplateEngineServer.Instance.SetupNunjucks();
  const startTime = Date.now();

  const embedding: BaseEmbeddings = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, context.embeddingDriverClass, context.embeddingAPIKey);
  const processedBatch: string[] = [];
  const failedRecords: { RecordID: string; Message: string }[] = [];
  for (const entityData of batch) {
    // No pre-validation — entity records commonly have null fields (e.g. Bio, State)
    // and the Nunjucks templates handle missing data gracefully via {% if Field %} conditionals.
    // Pass SuppressWarnings=true since entity doc vectorization doesn't need warnings for missing fields.
    const result: TemplateRenderResult = await TemplateEngineServer.Instance.RenderTemplate(template, templateContent, entityData, true, true);
    if(result.Success){
      processedBatch.push(result.Output);
    }
    else{
      const recordID = String(entityData.ID ?? entityData.__mj_recordID ?? 'unknown');
      LogError(`Error rendering template for record ${recordID}`, undefined, result.Message);
      failedRecords.push({ RecordID: recordID, Message: result.Message });
    }
  }

  const embeddings: EmbedTextsResult = await embedding.EmbedTexts({ texts: processedBatch, model: null });
  const embeddingBatch: EmbeddingData[] = embeddings.vectors.map((vector: number[], index: number) => {
    return {
      ID: index,
      Vector: vector,
      EntityData: batch[index],
      __mj_recordID: String(batch[index].__mj_recordID),
      __mj_compositeKey: String(batch[index].__mj_compositeKey ?? ''),
      EntityDocument: context.entityDocument,
      VectorID: String(batch[index].VectorID ?? ''),
      VectorIndexID: String(batch[index].VectorIndexID ?? ''),
      TemplateContent: templateContent.TemplateText
    };
  });

  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Generating Vectors: Complete #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  await delay(context.delayTimeMS); //short deplay to avoid getting rate limited by the embedding model's api
  parentPort.postMessage({ ...workerData, batch: embeddingBatch, errors: failedRecords });
}

VectorizeEntity();

