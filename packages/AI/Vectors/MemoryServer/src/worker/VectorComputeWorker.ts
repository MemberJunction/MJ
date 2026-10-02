/**
 * @fileoverview Worker-thread entry point for {@link VectorWorkerPool}: loads
 * the native backend if asked, then answers each request with
 * {@link HandleWorkerRequest}. All the work lives in `VectorWorkerHandler`,
 * which is tested in-process; this file is only the thread wiring.
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import { parentPort, workerData } from 'node:worker_threads';
import { NativeVectorBackend } from '../NativeVectorBackend';
import { HandleWorkerRequest } from './VectorWorkerHandler';
import type { VectorWorkerData, WorkerRequest } from './VectorWorkerProtocol';

const settings = workerData as VectorWorkerData | undefined;
if (settings?.LoadNative) {
  NativeVectorBackend.Instance.Load();
}

parentPort?.on('message', (request: WorkerRequest) => {
  const { Response, Transfer } = HandleWorkerRequest(request);
  parentPort!.postMessage(Response, Transfer);
});
