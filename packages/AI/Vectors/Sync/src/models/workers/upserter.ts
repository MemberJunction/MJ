import { parentPort, workerData } from 'node:worker_threads';
import type { ArchiveWorkerContext } from '../entityVectorSync'
import type { WorkerData } from '../BatchWorker';

function UpsertVectorRecords(): void {
    //just pass the data back to the main thread
  const { batch, context } = workerData as WorkerData<ArchiveWorkerContext>;
  parentPort.postMessage({ ...workerData, ...batch });
}

UpsertVectorRecords();
