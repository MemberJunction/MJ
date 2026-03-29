import { Transform } from 'node:stream';

export type TransformCallback = Parameters<Transform['_flush']>[0];

/**
 * Options for the AsyncBatchTransform
 */
export type AsyncBatchTransformOptions<TRecord, TContext, TResult> = {
  /** Number of records to accumulate before processing a batch. Default: 10 */
  batchSize?: number;
  /** Max concurrent batch processing tasks. Default: 4 */
  concurrencyLimit?: number;
  /** Arbitrary context passed to the processing function */
  context?: TContext;
  /** The async function that processes a batch of records and returns results */
  processBatch: (batch: TRecord[], context: TContext) => Promise<TResult[]>;
};

/**
 * A Transform stream that batches records and processes them asynchronously
 * in the main thread using a concurrency-limited queue.
 *
 * This replaces the worker_threads-based BatchWorker to solve the ClassFactory
 * registration issue: worker threads run in separate V8 isolates and don't
 * share the main thread's class registrations, causing CreateInstance() to
 * return null. Since the bottleneck is I/O (embedding API calls, vector DB
 * upserts), not CPU, worker threads provide no benefit here.
 */
export class AsyncBatchTransform<
  TRecord = Record<string, unknown>,
  TContext = Record<string, unknown>,
  TResult = TRecord
> extends Transform {
  private readonly _batchSize: number;
  private readonly _concurrencyLimit: number;
  private readonly _context: TContext;
  private readonly _processBatch: (batch: TRecord[], context: TContext) => Promise<TResult[]>;

  private _buffer: TRecord[] = [];
  private _queue: Array<() => Promise<void>> = [];
  private _running = 0;
  private _drainResolve: (() => void) | null = null;

  constructor(options: AsyncBatchTransformOptions<TRecord, TContext, TResult>) {
    super({ objectMode: true });
    this._batchSize = options.batchSize ?? 10;
    this._concurrencyLimit = options.concurrencyLimit ?? 4;
    this._context = options.context as TContext;
    this._processBatch = options.processBatch;
  }

  private _next(): void {
    while (this._queue.length > 0 && this._running < this._concurrencyLimit) {
      const task = this._queue.shift();
      if (task) {
        this._running++;
        task().finally(() => {
          this._running--;
          this._next();
          if (this._running === 0 && this._queue.length === 0 && this._drainResolve) {
            this._drainResolve();
            this._drainResolve = null;
          }
        });
      }
    }
  }

  private _enqueue(task: () => Promise<void>): void {
    this._queue.push(task);
    this._next();
  }

  /** Returns a Promise that resolves when all queued tasks have completed */
  private _waitForDrain(): Promise<void> {
    if (this._running === 0 && this._queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._drainResolve = resolve;
    });
  }

  override _transform(chunk: TRecord, _encoding: BufferEncoding, callback: TransformCallback): void {
    this._buffer.push(chunk);
    if (this._buffer.length >= this._batchSize) {
      const batch = this._buffer.splice(0, this._batchSize);
      this._enqueue(() => this._processBatchAsync(batch));
    }
    callback();
  }

  override _flush(callback: TransformCallback): void {
    if (this._buffer.length > 0) {
      const remaining = this._buffer.splice(0);
      this._enqueue(() => this._processBatchAsync(remaining));
    }

    this._waitForDrain().then(() => callback()).catch(callback);
  }

  private async _processBatchAsync(batch: TRecord[]): Promise<void> {
    try {
      const results = await this._processBatch(batch, this._context);
      for (const result of results) {
        this.push(result);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
}
