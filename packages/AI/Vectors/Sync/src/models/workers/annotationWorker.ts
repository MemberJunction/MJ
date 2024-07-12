import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { ArchiveWorkerContext } from '../entityVectorSync';
import type { WorkerData } from '../BatchWorker';
import { TemplateEntityExtended, TemplateRenderResult } from '@memberjunction/templates-base-types';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityDocumentEntity } from '@memberjunction/core-entities';
import { LogError } from '@memberjunction/core';

async function VectorizeEntity(): Promise<void> {
  const { batch, context } = workerData as WorkerData<ArchiveWorkerContext>;
  const startTime = Date.now();
  console.log('\t##### Annotator started #####', { threadId, now: Date.now() % 10_000, elapsed: Date.now() - context.executionId });
  console.log(`Annotating ${batch.length} records`);

  const entityDocument: EntityDocumentEntity = context.entityDocument;
  const template: TemplateEntityExtended | undefined = TemplateEngineServer.Instance.Templates.find((t: TemplateEntityExtended) => t.ID === entityDocument.TemplateID);
  if(!template){
    throw new Error(`Template not found with ID ${entityDocument.TemplateID}`);
  }

  if(template.Content.length === 0){
    throw new Error(`Template ${template.ID} does not have an associated Template Content record`);
  }

  if(template.Content.length > 1){
    throw new Error('Templates used by Entity Documents should only have one associated Template Content record.');
  }

  const processedBatch: string[] = [];
  for (const entityData of batch) { 
    let result: TemplateRenderResult = await TemplateEngineServer.Instance.RenderTemplate(template, template.Content[0], entityData);
    if(result.Success){
      processedBatch.push(result.Output);
    }
    else{
      LogError(`Error rendering template for record ${entityData.ID}`, undefined, result.Message);
    }
  }

  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Annotator finished #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  parentPort.postMessage({ ...workerData, batch: processedBatch });
}

VectorizeEntity();

