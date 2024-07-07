import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { ArchiveWorkerContext } from '../entityVectorSync';
import type { WorkerData } from '../BatchWorker';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { batch, context } = workerData as WorkerData<ArchiveWorkerContext>;
  const startTime = Date.now();
  console.log('\t##### Annotator started #####', { threadId, now: Date.now() % 10_000, elapsed: Date.now() - context.executionId });

  console.log(`Annotating ${batch.length} records`);
  await sleep(Math.random() * 1100 + 100); // simulate an API call to embedding service
  const processedBatch = batch.map((row) => {
    return { ...row, salutation: '--------- Hello ---------' };
  });

  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Annotator finished #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  parentPort.postMessage({ ...workerData, batch: processedBatch });
}

main();
