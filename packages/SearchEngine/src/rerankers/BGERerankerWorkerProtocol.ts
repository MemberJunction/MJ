/**
 * @fileoverview Message protocol between {@link BGERerankerWorkerHost} and `BGERerankerWorker`.
 *
 * @module @memberjunction/search-engine
 */

/** Call payloads accepted by the BGE reranker worker thread. */
export type BGEWorkerCall =
    | {
          Kind: 'rerank';
          ModelId: string;
          CacheDir?: string;
          Pairs: Array<[string, string]>;
          BatchSize: number;
      }
    | {
          Kind: 'clear';
      };

/** Request envelope posted to the worker thread. */
export type BGEWorkerRequest<TCall = BGEWorkerCall> = TCall & { ID: number };

/** Successful response envelope returned from the worker thread. */
export interface BGEWorkerSuccess<TResult> {
    ID: number;
    Ok: true;
    Result: TResult;
}

/** Failure response envelope returned from the worker thread. */
export interface BGEWorkerFailure {
    ID: number;
    Ok: false;
    Error: string;
}

export type BGEWorkerResponse<TResult> = BGEWorkerSuccess<TResult> | BGEWorkerFailure;

/** Handler result wrapper returned inside the worker thread. */
export interface BGEWorkerAnswer<TResult> {
    Result: TResult;
}

/** Worker-side request handler signature. */
export type BGEWorkerRequestHandler<TCall = BGEWorkerCall, TResult = number[]> = (
    call: TCall,
) => Promise<BGEWorkerAnswer<TResult>>;
