/**
 * @fileoverview The encode worker: the `new Worker(...)` target of {@link VideoEncodeWorkerHost}. Answers each request with
 * {@link HandleVideoEncodeRequest}, one at a time, in order. Like `media-worker-bootstrap.ts`, it has an import-time side
 * effect and is NOT exported from the package index.
 *
 * Imports only Node built-ins and the handler (which imports only the pixel module and `jpeg-js`), so the worker starts
 * without loading any `@memberjunction/*` package or `@livekit/rtc-node`.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { isMainThread, parentPort } from 'node:worker_threads';
import { HandleVideoEncodeRequest } from './video-encode-handler';
import { RgbaScratch } from './video-frame-pixels';
import type { VideoEncodeReply, VideoEncodeRequest } from './video-encode-protocol';

if (isMainThread || !parentPort) {
    throw new Error('video-encode-worker must be started as a worker_threads.Worker, not imported');
}

const port = parentPort;
const scratch = new RgbaScratch();
port.on('message', (request: VideoEncodeRequest) => {
    const { Reply, Transfer } = HandleVideoEncodeRequest(request, scratch);
    port.postMessage(Reply, Transfer);
});
const ready: VideoEncodeReply = { Kind: 'ready' };
port.postMessage(ready);
