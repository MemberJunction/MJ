import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { WorkerData } from '../BatchWorker';
import { TemplateEntityExtended, TemplateRenderResult } from '@memberjunction/templates-base-types';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateContentEntity } from '@memberjunction/core-entities';
import { LogError, ValidationResult } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { Embeddings, EmbedTextsResult } from '@memberjunction/ai';

import { LoadOpenAILLM } from '@memberjunction/ai-openai';
import { LoadMistralEmbedding } from '@memberjunction/ai-mistral';
import { AnnotateWorkerContext, EmbeddingData } from '../../generic/vectorSync.types';

LoadOpenAILLM();
LoadMistralEmbedding();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function VectorizeEntity(): Promise<void> {
  const { batch, context } = workerData as WorkerData<AnnotateWorkerContext>;

  if(!batch){
    throw new Error('batch is required for the AnnotationWorker');
  }

  const template: TemplateEntityExtended = context.template;
  const templateContent: TemplateContentEntity = context.templateContent;
  TemplateEngineServer.Instance.SetupNunjucks();
  const startTime = Date.now();
  //console.log('\t##### Annotator started #####', { threadId, now: Date.now() % 10_000, elapsed: Date.now() - context.executionId });

  const embedding: Embeddings = MJGlobal.Instance.ClassFactory.CreateInstance<Embeddings>(Embeddings, context.embeddingDriverClass, context.embeddingAPIKey);
  const processedBatch: string[] = [];
  for (const entityData of batch) {
    const validationResult = ValidateTemplateInput(template, entityData);
    if (!validationResult.Success) {
      LogError(`Validation error for record ${entityData.ID}`, undefined, validationResult.Errors.map(e => e.Message).join('\n'));
      continue;
    }

    let result: TemplateRenderResult = await TemplateEngineServer.Instance.RenderTemplate(template, templateContent, entityData, true);
    if(result.Success){
      processedBatch.push(result.Output);
    }
    else{
      LogError(`Error rendering template for record ${entityData.ID}`, undefined, result.Message);
    }
  }

  const embeddings: EmbedTextsResult = await embedding.EmbedTexts({ texts: processedBatch, model: null });
  const embeddingBatch: EmbeddingData[] = embeddings.vectors.map((vector: number[], index: number) => {
    return {
      ID: index,
      Vector: vector,
      EntityData: batch[index],
      __mj_recordID: batch[index].__mj_recordID,
      __mj_compositeKey: batch[index].__mj_compositeKey,
      EntityDocument: context.entityDocument,
      VectorID: batch[index].VectorID,
      VectorIndexID: batch[index].VectorIndexID,
      TemplateContent: templateContent.TemplateText
    };
  });

  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Generating Vectors: Complete #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  await delay(context.delayTimeMS); //short deplay to avoid getting rate limited by the embedding model's api 
  parentPort.postMessage({ ...workerData, batch: embeddingBatch });
}

/**
 * This method is different from the Validate() method which validates the state of the Template itself. This method validates the data object provided meets the requirements for the template's parameter definitions.
 * @param data - the data object to validate against the template's parameter definitions
 */
function ValidateTemplateInput(template: TemplateEntityExtended, data: any): ValidationResult {
  const result = new ValidationResult();
  let params = template.Params;

  if(!params){
    result.Errors.push({
      Source: "",
      Message: "Params property not found on the template.",
      Value: "",
      Type: 'Failure'
    });
  }

  params?.forEach((p) => {
    if (p.IsRequired) {
        if (!data || data[p.Name] === undefined || data[p.Name] === null || 
            (typeof data[p.Name] === 'string' && data[p.Name].toString().trim() === '')){
              result.Errors.push({
                Source: p.Name,
                Message: `Parameter ${p.Name} is required.`,
                Value: data[p.Name],
                Type: 'Failure'
              });
            }
      }
  });

  // now set result's top level success falg based on the existence of ANY failure record within the errors collection
  result.Success = result.Errors.some(e => e.Type === 'Failure') ? false : true;
  return result;
}

VectorizeEntity();

