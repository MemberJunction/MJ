const { parentPort, threadId, workerData } = require('node:worker_threads');

/**
 * @typedef {import('./BatchWorker.js').WorkerData<Record<string, unknown>, { executionId: string }>} WorkerData
 */

async function main() {
  const startTime = Date.now();
  console.log('\t##### Annotator started #####', { threadId, now: Date.now() % 10_000 });

  /**
   * @type WorkerData
   */
  const { batch } = workerData;

  const processedBatch = batch.map((row) => {
    return { ...row, salutation: 'Hello' };
  });

  const runTime = Date.now() - startTime;
  console.log('\t##### Annotator finished #####', { threadId, now: Date.now() % 100_000, runTime });
  parentPort.postMessage({ ...workerData, batch: processedBatch });
}

main();
