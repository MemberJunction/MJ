/**
 * @fileoverview Worker-thread bootstrap. This file is the `new Worker(...)` target and is the ONLY module
 * with an import-time side effect. It is intentionally NOT re-exported from the package index, so
 * importing `@memberjunction/ai-bridge-livekit-native` inside some other worker thread (vitest, tinypool,
 * another MJAPI worker) can never start a media session by accident.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { isMainThread, parentPort } from 'node:worker_threads';
import { RunMediaWorker, type MediaWorkerPort } from './media-worker-session';

if (isMainThread || !parentPort) {
    throw new Error('media-worker-bootstrap must be started as a worker_threads.Worker, not imported on the main thread');
}

const port = parentPort;
const workerPort: MediaWorkerPort = {
    postMessage: (message, transferList) => port.postMessage(message, transferList ? [...transferList] : undefined),
    on: (event, listener) => port.on(event, listener),
};
RunMediaWorker(workerPort);
