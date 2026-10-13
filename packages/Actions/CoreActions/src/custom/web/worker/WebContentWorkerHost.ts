/**
 * @fileoverview Owns the worker thread that converts fetched HTML and PDFs for
 * {@link WebPageContentAction}.
 *
 * jsdom, turndown and pdf-parse are synchronous. On a real page they held MJAPI's event loop for
 * 1.4s (HTML to Markdown) and 0.7s (one PDF) in a live profile, during which every HTTP request and
 * WebSocket on the process waited (MJ #5510). This host runs them on one long-lived worker thread.
 * The page text goes over as a string and the PDF bytes are transferred; only the (truncated)
 * result comes back. The lifecycle (restart after a crash, fall back to in-process after repeated
 * crashes) comes from {@link WorkerThreadHost}.
 *
 * @module @memberjunction/core-actions
 */

import { fileURLToPath } from 'node:url';
import type { TransferListItem } from 'node:worker_threads';
import { WorkerThreadHost } from '@memberjunction/worker-host';
import type { WebContentResult, WebContentWorkerCall } from './WebContentWorkerProtocol';

/** Set to `true` to convert web content on the calling thread (the pre-worker behavior). */
export const WEB_CONTENT_IN_PROCESS_ENV = 'MJ_WEB_CONTENT_IN_PROCESS';

/** Runs {@link WebContentWorkerCall}s on the web-content worker. */
export class WebContentWorkerHost extends WorkerThreadHost<WebContentWorkerCall, WebContentResult> {
  protected constructor() {
    super({
      Name: 'Web content worker',
      InProcessEnvVar: WEB_CONTENT_IN_PROCESS_ENV,
      ScriptPath: fileURLToPath(new URL('./WebContentWorker.js', import.meta.url)),
      LogPrefix: '[WebPageContent]',
      FallbackDescription: 'Converting web content on the main thread',
    });
  }

  public static get Instance(): WebContentWorkerHost {
    return super.getInstance<WebContentWorkerHost>();
  }

  /** A PDF's bytes move to the worker instead of being copied; the caller's `Data` is unusable afterwards. */
  protected override TransferListFor(call: WebContentWorkerCall): TransferListItem[] {
    return call.Kind === 'pdf' && call.Data.buffer instanceof ArrayBuffer ? [call.Data.buffer] : [];
  }
}
