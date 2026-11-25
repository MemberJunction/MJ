/**
 * @fileoverview Dedicated `worker_threads` entry point for {@link BGERerankerWorkerHost}.
 * Loads `@huggingface/transformers` and executes ONNX cross-encoder inference off the
 * main Node.js event loop.
 *
 * @module @memberjunction/search-engine
 */

import { parentPort, type MessagePort } from 'node:worker_threads';
import { HandleBGERerankerRequest } from './BGERerankerWorkerHandler.js';
import type { BGEWorkerCall, BGEWorkerRequest, BGEWorkerResponse } from './BGERerankerWorkerProtocol.js';

/**
 * Processes one incoming worker request and returns the serialized success/failure envelope.
 * Exported for unit tests.
 */
export async function AnswerBGERerankerRequest(
    request: BGEWorkerRequest<BGEWorkerCall>,
): Promise<BGEWorkerResponse<number[]>> {
    try {
        const answer = await HandleBGERerankerRequest(request);
        return { ID: request.ID, Ok: true, Result: answer.Result };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ID: request.ID, Ok: false, Error: message };
    }
}

/** Attaches the message listener to `port` (defaults to `parentPort` inside a worker thread). */
export function ServeBGERerankerRequests(port: MessagePort | null = parentPort): void {
    port?.on('message', (request: BGEWorkerRequest<BGEWorkerCall>) => {
        void AnswerBGERerankerRequest(request).then((response) => port.postMessage(response));
    });
}

ServeBGERerankerRequests();
