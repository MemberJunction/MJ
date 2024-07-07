const { parentPort, threadId, workerData } = require('node:worker_threads');
const { resolve } = require('node:path');
const { writeFileSync } = require('node:fs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {import('../entityVectorSync').ArchiveWorkerContext} ArchiveWorkerContext
 * @typedef {import('../BatchWorker').WorkerData<ArchiveWorkerContext>} WorkerData
 */

async function main() {
  /**
   * @type WorkerData
   */
  const { batch, context } = workerData;
  const startTime = Date.now();
  console.log('\t##### Archiver started #####', { threadId, now: Date.now() % 10_000, elapsed: Date.now() - context.executionId });
  const filename = resolve(__dirname, `archived_${context.executionId}_${threadId}.log`);
  console.log(`Archiving ${batch.length} records to ${filename}`);
  await sleep(Math.random() * 1300 + 600); // simulate an API call to storage service
  writeFileSync(filename, batch.map((row) => JSON.stringify(row)).join('\n'));
  // context.entity.EntityInfo.Name;
  // context.entityDocument.ID

  const runTime = Date.now() - startTime;
  const elapsed = Date.now() - context.executionId;
  console.log('\t##### Archiver finished #####', { threadId, now: Date.now() % 100_000, runTime, elapsed });
  parentPort.postMessage(workerData);
}

main();
