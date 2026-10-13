/**
 * @fileoverview Worker-thread entry point for {@link WebContentWorkerHost}: answers each request
 * with {@link HandleWebContentRequest}, so jsdom, turndown and pdf-parse never block the event loop
 * that serves requests (MJ #5510).
 *
 * @module @memberjunction/core-actions
 */

import { parentPort } from 'node:worker_threads';
import { HandleWebContentRequest } from './WebContentWorkerHandler';
import type { WebContentWorkerRequest } from './WebContentWorkerProtocol';

parentPort?.on('message', (request: WebContentWorkerRequest) => {
  void HandleWebContentRequest(request).then((response) => parentPort!.postMessage(response));
});
