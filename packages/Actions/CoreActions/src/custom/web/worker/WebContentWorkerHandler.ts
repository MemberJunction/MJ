/**
 * @fileoverview Answers one web-content worker request. All the worker's logic lives here so it
 * can be tested in-process; `WebContentWorker.ts` is only the thread wiring.
 *
 * @module @memberjunction/core-actions
 */

import { TransformHtml, TransformPdf } from '../web-content-transforms';
import type { WebContentWorkerRequest, WebContentWorkerResponse } from './WebContentWorkerProtocol';

/** Runs one request. Never throws: a failure becomes an `Ok: false` response. */
export async function HandleWebContentRequest(request: WebContentWorkerRequest): Promise<WebContentWorkerResponse> {
  try {
    switch (request.Kind) {
      case 'html':
        return { ID: request.ID, Ok: true, Result: TransformHtml(request.Html, request.Options) };
      case 'pdf':
        return { ID: request.ID, Ok: true, Result: await TransformPdf(request.Data, request.Options) };
      default:
        return { ID: (request as { ID: number }).ID, Ok: false, Error: 'Unknown web-content worker request' };
    }
  } catch (error) {
    return { ID: request.ID, Ok: false, Error: error instanceof Error ? error.message : String(error) };
  }
}
