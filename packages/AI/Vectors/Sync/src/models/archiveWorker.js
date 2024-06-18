const { parentPort, threadId, workerData } = require('node:worker_threads');
const { writeFileSync } = require('node:fs');

/**
 * @typedef {import('./entityVectorSync').ArchiveWorkerContext} ArchiveWorkerContext
 * @typedef {import('./BatchWorker').WorkerData<ArchiveWorkerContext>} WorkerData
 */

async function main() {
  const startTime = Date.now();
  console.log('\t##### Archiver started #####', { threadId, now: Date.now() % 10_000 });

  /**
   * @type WorkerData
   */
  const { batch, context } = workerData;
  await sleep(Math.random() * 1300 + 600); // simulate an API call to storage service
  writeFileSync(`log_${context.executionId}_${threadId}.log`, batch.map((row) => JSON.stringify(row)).join('\n'));
  // context.entity.EntityInfo.Name;
  // context.entityDocument.ID

  const runTime = Date.now() - startTime;
  console.log('\t##### Archiver finished #####', { threadId, now: Date.now() % 100_000, runTime });
  parentPort.postMessage(workerData);
}

main();
