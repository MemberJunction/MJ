/**
 * @module @memberjunction/ai-vectors-memory-server
 * @description Server-side acceleration for `@memberjunction/ai-vectors-memory`:
 * a worker-thread pool over shared memory and an optional native (usearch)
 * backend, plugged in through the ClassFactory. Import this package (or call
 * {@link LoadVectorMemoryServer}) once in a server process; every
 * `SimpleVectorService` there then uses it.
 */

import { LoadWorkerPoolVectorAccelerator } from './WorkerPoolVectorAccelerator';

export * from './VectorAccelerationSettings';
export * from './NativeVectorBackend';
export * from './VectorWorkerPool';
export * from './WorkerPoolVectorAccelerator';

/**
 * Ensures the server accelerator is registered. Call once from server
 * bootstrap code so bundlers cannot tree-shake the registration away.
 */
export function LoadVectorMemoryServer(): void {
  LoadWorkerPoolVectorAccelerator();
}
