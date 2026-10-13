/**
 * @fileoverview Answers one web-content worker call. All the worker's logic lives here so it can
 * be tested in-process; `WebContentWorker.ts` is only the thread wiring.
 *
 * @module @memberjunction/core-actions
 */

import type { WorkerAnswer } from '@memberjunction/worker-host';
import { TransformHtml, TransformPdf } from '../web-content-transforms';
import type { WebContentResult, WebContentWorkerCall } from './WebContentWorkerProtocol';

/** Runs one call. Throws when conversion fails; the worker turns that into a failed response. */
export async function HandleWebContentRequest(call: WebContentWorkerCall): Promise<WorkerAnswer<WebContentResult>> {
  switch (call.Kind) {
    case 'html':
      return { Result: TransformHtml(call.Html, call.Options) };
    case 'pdf':
      return { Result: await TransformPdf(call.Data, call.Options) };
    default:
      throw new Error(`Unknown web-content worker call: ${(call as { Kind: string }).Kind}`);
  }
}
