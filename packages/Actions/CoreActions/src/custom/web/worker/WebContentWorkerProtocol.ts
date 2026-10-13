/**
 * @fileoverview The calls {@link WebContentWorkerHost} sends to the web-content worker thread. The
 * request/response envelope around them comes from `@memberjunction/worker-host`.
 *
 * @module @memberjunction/core-actions
 */

import type { HtmlTransformOptions, PdfTransformOptions } from '../web-content-transforms';

/** Convert an HTML page. */
export interface HtmlTransformCall {
  Kind: 'html';
  Html: string;
  Options: HtmlTransformOptions;
}

/** Extract a PDF. `Data` is transferred to the worker, not copied. */
export interface PdfTransformCall {
  Kind: 'pdf';
  Data: Uint8Array;
  Options: PdfTransformOptions;
}

export type WebContentWorkerCall = HtmlTransformCall | PdfTransformCall;

/** The converted page, as `WebPageContentAction` returns it. */
export type WebContentResult = Record<string, unknown>;
