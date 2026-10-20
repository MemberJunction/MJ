import { UserInfo } from '@memberjunction/core';
import { Transform } from 'node:stream';
import { Worker } from 'node:worker_threads';

export type TransformCallback = Parameters<Transform['_flush']>[0];
export type WorkerData<TContext = Record<string, unknown>, TRecord = Record<string, unknown>> = {
  batch?: Array<TRecord>;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  context?: TContext;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
};

export type BatchWorkerOptions<TContext = Record<string, unknown>> = {
  /**
   * The number of records to process in a batch
   */
  BatchSize?: number;
  /**
   * The path to the worker file used to launch a worker thread
   */
  WorkerFile?: string;
  /**
   * An abitrary context to pass to the worker thread
   */
  WorkerContext?: TContext;
  /**
   * The maximum number of worker threads to run concurrently
   */
  ConcurrencyLimit?: number;
  /**
   * The user context to pass to the worker thread
   */
  ContextUser?: UserInfo;
  /**
   * The time to delay between api calls
   **/
  DelayTimeMS?: number;
};

/**
 * This class processes records in batches using a worker thread. It expects
 * a worker file that exports a function to process the batch of records.
 * The stream operates in object mode and emits processed records.
 */
export class BatchWorker<TRecord = Record<string, unknown>, TContext = Record<string, unknown>> extends Transform {
  BatchSize = 10;

  /** @deprecated Use {@link BatchSize}. */
  get _batchSize() {
    return this.BatchSize;
  }
  /** @deprecated Use {@link BatchSize}. */
  set _batchSize(value) {
    this.BatchSize = value;
  }
  WorkerFile = './worker.js';

  /** @deprecated Use {@link WorkerFile}. */
  get _workerFile() {
    return this.WorkerFile;
  }
  /** @deprecated Use {@link WorkerFile}. */
  set _workerFile(value) {
    this.WorkerFile = value;
  }
  WorkerContext: TContext | Record<string, never> = {};

  /** @deprecated Use {@link WorkerContext}. */
  get _workerContext(): TContext | Record<string, never> {
    return this.WorkerContext;
  }
  /** @deprecated Use {@link WorkerContext}. */
  set _workerContext(value: TContext | Record<string, never>) {
    this.WorkerContext = value;
  }
  ConcurrencyLimit = 4;

  /** @deprecated Use {@link ConcurrencyLimit}. */
  get _concurrencyLimit() {
    return this.ConcurrencyLimit;
  }
  /** @deprecated Use {@link ConcurrencyLimit}. */
  set _concurrencyLimit(value) {
    this.ConcurrencyLimit = value;
  }
  Running = 0;

  /** @deprecated Use {@link Running}. */
  get _running() {
    return this.Running;
  }
  /** @deprecated Use {@link Running}. */
  set _running(value) {
    this.Running = value;
  }

  Buffer: Array<TRecord> = [];

  /** @deprecated Use {@link Buffer}. */
  get _buffer(): Array<TRecord> {
    return this.Buffer;
  }
  /** @deprecated Use {@link Buffer}. */
  set _buffer(value: Array<TRecord>) {
    this.Buffer = value;
  }

  _queue: Array<() => Promise<void>> = [];

  _contextUser: UserInfo | undefined = undefined;

  /**
   * @param {BatchWorkerOptions} options - Options for the BatchWorker
   */
  constructor(options: BatchWorkerOptions<TContext> = {}) {
    super({ objectMode: true });
    this.BatchSize = options.BatchSize ?? this.BatchSize;
    this.WorkerFile = options.WorkerFile ?? this.WorkerFile;
    this.WorkerContext = options.WorkerContext ?? this.WorkerContext;
    this.ConcurrencyLimit = options.ConcurrencyLimit ?? this.ConcurrencyLimit;
    this._contextUser = options.ContextUser ?? this._contextUser;
  }

  /**
   * Starts the next task in the queue
   */
  Next() {
    if (this._queue.length > 0 && this.Running < this.ConcurrencyLimit) {
      const task = this._queue.shift();
      task && task().then(() => this.Next());
    }
  }

  /** @deprecated Use {@link Next}. */
  _next() {
    return this.Next();
  }

  /**
   * Enqueues a task to be processed
   * @param task - The task to enqueue
   */
  Enqueue(task: () => Promise<void>) {
    this._queue.push(task);
    this.Next();
  }

  /** @deprecated Use {@link Enqueue}. */
  _enqueue(task: () => Promise<void>) {
    return this.Enqueue(task);
  }

  // Node calls this by exact name on the instance. A `@deprecated` stub forwarding to a
  // PascalCase member works, but it makes the deprecated member the load-bearing one.
  async _transform(chunk: TRecord, encoding: BufferEncoding, callback: TransformCallback) {
    this.Buffer.push(chunk);
    if (this.Buffer.length >= this.BatchSize) {
      const batch = this.Buffer.splice(0, this.BatchSize);
      this.Enqueue(() =>
        this.ProcessBatchInWorker(batch)
          .then(() => callback())
          .catch((error) => {
            console.log('Error processing batch:', error);
            callback();
          })
      );
    } else {
      callback();
    }
  }

  /** Node's flush hook — same naming contract as `_transform` above. */
  async _flush(callback: TransformCallback) {
    if (this.Buffer.length > 0) {
      this.Enqueue(() =>
        this.ProcessBatchInWorker(this.Buffer)
          .then(() => callback())
          .catch((error) => {
            console.log('Error flushing:', error);
            callback(error);
          })
      );
    } else {
      callback();
    }
  }

  ProcessBatchInWorker(batch: Array<TRecord>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.Running++;
      const worker = new Worker(this.WorkerFile, { workerData: { batch, context: this.WorkerContext } });
      worker.on('message', ({ batch }: WorkerData<TContext, TRecord>) => {
        // Push batch rows to the stream for reading
        batch.forEach((row) => this.push(row));

        // Decrement _running on successful processing
        this.Running--;
        resolve();
      });
      worker.on('error', (error) => {
        console.log('Error processing batch in worker:', error);
        // Decrement _running and reject on error
        this.Running--;
        reject(error);
      });
    });
  }

  /** @deprecated Use {@link ProcessBatchInWorker}. */
  _processBatchInWorker(batch: Array<TRecord>): Promise<void> {
    return this.ProcessBatchInWorker(batch);
  }
}