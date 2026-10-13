/**
 * @fileoverview Messages between {@link WebContentWorkerHost} and the web-content worker thread.
 *
 * @module @memberjunction/core-actions
 */

import type { HtmlTransformOptions, PdfTransformOptions } from '../web-content-transforms';

/** Convert an HTML page. */
export interface HtmlTransformRequest {
  ID: number;
  Kind: 'html';
  Html: string;
  Options: HtmlTransformOptions;
}

/** Extract a PDF. `Data` is transferred to the worker, not copied. */
export interface PdfTransformRequest {
  ID: number;
  Kind: 'pdf';
  Data: Uint8Array;
  Options: PdfTransformOptions;
}

export type WebContentWorkerRequest = HtmlTransformRequest | PdfTransformRequest;

export interface WebContentWorkerSuccess {
  ID: number;
  Ok: true;
  Result: Record<string, unknown>;
}

export interface WebContentWorkerFailure {
  ID: number;
  Ok: false;
  Error: string;
}

export type WebContentWorkerResponse = WebContentWorkerSuccess | WebContentWorkerFailure;
