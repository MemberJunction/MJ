import { parentPort, workerData } from 'node:worker_threads';
import type { WorkerData } from '../BatchWorker';
import { ArchiveWorkerContext } from '../../generic/vectorSync.types';

export function PostMessagePostUpsert(): void {
    //just pass the data back to the main thread
  const { batch, context } = workerData as WorkerData<ArchiveWorkerContext>;
  parentPort.postMessage({ ...workerData, ...batch });
}

PostMessagePostUpsert();
