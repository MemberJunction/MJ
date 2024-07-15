import { UserInfo } from '@memberjunction/core';
import { Transform } from 'node:stream';
import { Worker } from 'node:worker_threads';

export type TransformCallback = Parameters<Transform['_flush']>[0];
export type WorkerData<TContext = Record<string, unknown>, TRecord = Record<string, unknown>> = {
  batch?: Array<TRecord>;
  context?: TContext;
};

export type BatchWorkerOptions<TContext = Record<string, unknown>> = {
  /**
   * The number of records to process in a batch
   */
  batchSize?: number;
  /**
   * The path to the worker file used to launch a worker thread
   */
  workerFile?: string;
  /**
   * An abitrary context to pass to the worker thread
   */
  workerContext?: TContext;
  /**
   * The maximum number of worker threads to run concurrently
   */
  concurrencyLimit?: number;
  /**
   * The user context to pass to the worker thread
   */
  contextUser?: UserInfo;
  /**
   * The time to delay between api calls
   **/
  delayTimeMS?: number;
};

/**
 * This class processes records in batches using a worker thread. It expects
 * a worker file that exports a function to process the batch of records.
 * The stream operates in object mode and emits processed records.
 */
export class BatchWorker<TRecord = Record<string, unknown>, TContext = Record<string, unknown>> extends Transform {
  _batchSize = 10;
  _workerFile = './worker.js';
  _workerContext: TContext | Record<string, never> = {};
  _concurrencyLimit = 4;
  _running = 0;

  _buffer: Array<TRecord> = [];

  _queue: Array<() => Promise<void>> = [];

  _contextUser: UserInfo | undefined = undefined;

  /**
   * @param {BatchWorkerOptions} options - Options for the BatchWorker
   */
  constructor(options: BatchWorkerOptions<TContext> = {}) {
    super({ objectMode: true });
    this._batchSize = options.batchSize ?? this._batchSize;
    this._workerFile = options.workerFile ?? this._workerFile;
    this._workerContext = options.workerContext ?? this._workerContext;
    this._concurrencyLimit = options.concurrencyLimit ?? this._concurrencyLimit;
    this._contextUser = options.contextUser ?? this._contextUser;
  }

  /**
   * Starts the next task in the queue
   */
  _next() {
    if (this._queue.length > 0 && this._running < this._concurrencyLimit) {
      const task = this._queue.shift();
      task && task().then(() => this._next());
    }
  }

  /**
   * Enqueues a task to be processed
   * @param task - The task to enqueue
   */
  _enqueue(task: () => Promise<void>) {
    this._queue.push(task);
    this._next();
  }

  async _transform(chunk: TRecord, encoding: BufferEncoding, callback: TransformCallback) {
    this._buffer.push(chunk);
    if (this._buffer.length >= this._batchSize) {
      const batch = this._buffer.splice(0, this._batchSize);
      this._enqueue(() =>
        this._processBatchInWorker(batch)
          .then(() => callback())
          .catch(callback)
      );
    } else {
      callback();
    }
  }

  async _flush(callback: TransformCallback) {
    if (this._buffer.length > 0) {
      this._enqueue(() => this._processBatchInWorker(this._buffer));
    }

    Promise.all(this._queue)
      .then(() => callback())
      .catch(callback);
  }

  _processBatchInWorker(batch: Array<TRecord>): Promise<void> {
    return new Promise((resolve, reject) => {
      this._running++;
      const worker = new Worker(this._workerFile, { workerData: { batch, context: this._workerContext } });
      worker.on('message', ({ batch }: WorkerData<TContext, TRecord>) => {
        // Push batch rows to the stream for reading
        batch.forEach((row) => this.push(row));

        // Decrement _running on successful processing
        this._running--;
        resolve();
      });
      worker.on('error', (error) => {
        // Decrement _running and reject on error
        this._running--;
        reject(error);
      });
    });
  }
}
