/**
 * Worker Pool Manager
 *
 * Manages a pool of worker processes for executing code with fault isolation.
 * Each worker runs in a separate OS process, so a catastrophic failure in one
 * worker (e.g., V8 OOM crash) doesn't affect the main application or other workers.
 *
 * Features:
 * - Process-level isolation for fault tolerance
 * - Automatic worker restart on crashes
 * - Request queuing when all workers are busy
 * - Health monitoring and circuit breaker pattern
 * - Bidirectional bridge: sandbox code can call host-registered handlers
 *   via `__bridgeCall(name, args)`; the host routes the call, executes the
 *   handler, and sends the response back. See worker.ts for the sandbox-side
 *   wiring.
 */

import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
    BridgeHandlerMap,
    CodeExecutionParams,
    CodeExecutionResult
} from './types';
import { LogError, LogStatus } from '@memberjunction/core';

interface PendingRequest {
    requestId: string;
    params: CodeExecutionParams;
    /** Bridge handlers scoped to this execution only (never sent over IPC). */
    bridgeHandlers?: BridgeHandlerMap;
    resolve: (result: CodeExecutionResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    /**
     * Listener we register on `params.abortSignal` so we can remove it again
     * when the request settles. Kept here to make cleanup easy.
     */
    abortListener?: () => void;
    /** Tracks whether we already sent an `abort` IPC message for this request. */
    aborted?: boolean;
}

interface Worker {
    process: ChildProcess;
    id: number;
    busy: boolean;
    currentRequest: PendingRequest | null;
    crashCount: number;
    lastCrashTime: number;
}

/**
 * Configuration options for worker pool
 */
export interface WorkerPoolOptions {
    /** Number of worker processes to maintain (default: 2) */
    poolSize?: number;
    /** Maximum crashes per worker before marking unhealthy (default: 3) */
    maxCrashesPerWorker?: number;
    /** Time window in ms for crash counting (default: 60000 = 1 minute) */
    crashTimeWindow?: number;
    /** Maximum queue size before rejecting requests (default: 100) */
    maxQueueSize?: number;
}

/**
 * Manages a pool of worker processes for code execution
 */
export class WorkerPool {
    private workers: Worker[] = [];
    private requestQueue: PendingRequest[] = [];
    private nextRequestId = 0;
    private poolSize: number;
    private maxCrashesPerWorker: number;
    private crashTimeWindow: number;
    private maxQueueSize: number;
    private isShuttingDown = false;

    constructor(options: WorkerPoolOptions = {}) {
        this.poolSize = options.poolSize || 2;
        this.maxCrashesPerWorker = options.maxCrashesPerWorker || 3;
        this.crashTimeWindow = options.crashTimeWindow || 60000; // 1 minute
        this.maxQueueSize = options.maxQueueSize || 100;
    }

    /**
     * Initialize the worker pool
     */
    async initialize(): Promise<void> {
        LogStatus('Initializing code execution worker pool with ' + this.poolSize + ' workers');

        for (let i = 0; i < this.poolSize; i++) {
            await this.createWorker(i);
        }
    }

    /**
     * Create a new worker process
     */
    private async createWorker(id: number): Promise<void> {
        const workerPath = path.join(__dirname, 'worker.js'); // Use .js because worker.ts is compiled
        const childProcess = fork(workerPath, [], {
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'] // Inherit stdout/stderr for debugging
        });

        const worker: Worker = {
            process: childProcess,
            id,
            busy: false,
            currentRequest: null,
            crashCount: 0,
            lastCrashTime: 0
        };

        this.workers[id] = worker;

        // Wait for ready message
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Worker ${id} failed to start within 5 seconds`));
            }, 5000);

            childProcess.once('message', (msg: any) => {
                if (msg.type === 'ready') {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            childProcess.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        // Set up message handler for responses
        childProcess.on('message', (message: any) => {
            this.handleWorkerMessage(worker, message);
        });

        // Set up crash handler
        childProcess.on('exit', (code, signal) => {
            this.handleWorkerCrash(worker, code, signal);
        });

        LogStatus(`Worker ${id} initialized and ready`);
    }

    /**
     * Handle messages from worker process.
     *
     * Types:
     *  - `ready` — initial startup / post-restart signal, ignored here.
     *  - `result` / `error` — the terminal outcome of the current execute() call.
     *  - `bridge-call` — a host-service request from inside the sandbox; we
     *    look up the registered handler and send back `bridge-response`.
     *    Critically, `bridge-call` does NOT end the request; the worker is
     *    still executing until it sends `result`/`error`.
     */
    private handleWorkerMessage(worker: Worker, message: any): void {
        if (message.type === 'ready') {
            // Worker is ready (initial startup or after restart)
            return;
        }

        if (message.type === 'bridge-call') {
            // Dispatch to the registered handler for this execution.
            void this.handleBridgeCall(worker, message);
            return;
        }

        if (!worker.currentRequest) {
            LogError(new Error(`Worker ${worker.id} sent message but has no current request`));
            return;
        }

        // If the worker included a requestId, make sure it matches — this
        // catches stale messages from aborted executions. Legacy test
        // harnesses (and very old workers) don't include a requestId; in
        // that case fall through and treat the message as belonging to the
        // current request.
        if (message.requestId && message.requestId !== worker.currentRequest.requestId) {
            return;
        }

        const request = worker.currentRequest;

        if (message.type === 'result' || message.type === 'error') {
            this.settleRequest(worker, request, message);
        }
    }

    /**
     * Finalize a request once the worker reports `result` or `error`.
     * Clears timeouts, detaches abort listeners, frees the worker, and
     * drains the queue.
     */
    private settleRequest(
        worker: Worker,
        request: PendingRequest,
        message: { type: 'result' | 'error'; result?: CodeExecutionResult; error?: string }
    ): void {
        clearTimeout(request.timeout);
        this.detachAbortListener(request);

        if (message.type === 'result') {
            request.resolve(message.result!);
        } else {
            request.reject(new Error(message.error ?? 'Worker returned error'));
        }

        worker.busy = false;
        worker.currentRequest = null;
        this.processQueue();
    }

    /**
     * Route a `bridge-call` from the worker to the registered host handler,
     * execute it, and send `bridge-response` back. All error paths here
     * produce a response with `error` populated so the sandbox's
     * `await __bridgeCall(...)` rejects cleanly rather than hanging.
     */
    private async handleBridgeCall(
        worker: Worker,
        message: {
            type: 'bridge-call';
            requestId: string;
            callId: string;
            functionName: string;
            args: unknown;
        }
    ): Promise<void> {
        const sendResponse = (payload: { result?: unknown; error?: string }) => {
            try {
                worker.process.send({
                    type: 'bridge-response',
                    requestId: message.requestId,
                    callId: message.callId,
                    ...payload
                });
            } catch (err) {
                LogError(
                    new Error(
                        `Failed to send bridge-response to worker ${worker.id}: ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    )
                );
            }
        };

        if (!worker.currentRequest || worker.currentRequest.requestId !== message.requestId) {
            sendResponse({ error: 'No active execution for this bridge call.' });
            return;
        }

        const handlers = worker.currentRequest.bridgeHandlers;
        if (!handlers) {
            sendResponse({
                error:
                    `Runtime action tried to call '${message.functionName}' but no bridge ` +
                    'handlers were registered for this execution.'
            });
            return;
        }

        const handler = handlers[message.functionName];
        if (!handler) {
            sendResponse({
                error:
                    `Bridge handler '${message.functionName}' is not registered. ` +
                    `Available: ${Object.keys(handlers).join(', ') || '(none)'}.`
            });
            return;
        }

        try {
            const result = await handler(message.args);
            sendResponse({ result });
        } catch (err) {
            sendResponse({ error: err instanceof Error ? err.message : String(err) });
        }
    }

    /**
     * Handle worker process crash
     */
    private handleWorkerCrash(worker: Worker, code: number | null, signal: string | null): void {
        const now = Date.now();

        // Update crash tracking
        if (now - worker.lastCrashTime > this.crashTimeWindow) {
            // Outside time window, reset count
            worker.crashCount = 1;
        } else {
            worker.crashCount++;
        }
        worker.lastCrashTime = now;

        LogError(new Error(
            `Worker ${worker.id} crashed (code: ${code}, signal: ${signal}). ` +
            `Crash count: ${worker.crashCount}/${this.maxCrashesPerWorker}`
        ));

        // Reject current request if any
        if (worker.currentRequest) {
            clearTimeout(worker.currentRequest.timeout);
            this.detachAbortListener(worker.currentRequest);
            worker.currentRequest.reject(new Error(
                'Worker process crashed during code execution. This may indicate a severe error in the code.'
            ));
            worker.currentRequest = null;
        }

        // Check if worker should be restarted
        if (worker.crashCount >= this.maxCrashesPerWorker) {
            LogError(new Error(
                `Worker ${worker.id} has crashed ${worker.crashCount} times within ${this.crashTimeWindow}ms. ` +
                'Not restarting to prevent crash loop. Code execution capacity reduced.'
            ));
            // Remove from pool
            this.workers[worker.id] = null as any;
            return;
        }

        // Restart worker if not shutting down
        if (!this.isShuttingDown) {
            LogStatus(`Restarting worker ${worker.id}...`);
            this.createWorker(worker.id).catch(error => {
                LogError(new Error(`Failed to restart worker ${worker.id}: ${error.message}`));
            });
        }
    }

    /**
     * Execute code in an available worker
     */
    async execute(params: CodeExecutionParams): Promise<CodeExecutionResult> {
        if (this.isShuttingDown) {
            return {
                success: false,
                error: 'Worker pool is shutting down',
                errorType: 'RUNTIME_ERROR'
            };
        }

        // Check if queue is full
        if (this.requestQueue.length >= this.maxQueueSize) {
            return {
                success: false,
                error: `Request queue is full (${this.maxQueueSize} pending requests). Please try again later.`,
                errorType: 'RUNTIME_ERROR'
            };
        }

        const requestId = `req-${this.nextRequestId++}`;

        return new Promise<CodeExecutionResult>((resolve, reject) => {
            // Create timeout for entire request (includes queue time + execution)
            const totalTimeout = ((params.timeoutSeconds || 30) + 5) * 1000; // Add 5s buffer for overhead

            const request: PendingRequest = {
                requestId,
                params,
                bridgeHandlers: params.bridgeHandlers,
                resolve,
                reject,
                // placeholder — reassigned below once we have the request ref
                timeout: null as unknown as NodeJS.Timeout
            };

            request.timeout = setTimeout(() => {
                // If the worker is still processing, tell it to abort its
                // in-flight bridge calls first — the sandbox's await will
                // reject cleanly. Then reject on our side.
                this.abortRequest(request, 'Request timed out waiting for worker availability');
            }, totalTimeout);

            // Mirror any caller-supplied AbortSignal into the same abort path.
            if (params.abortSignal) {
                const listener = () => {
                    this.abortRequest(
                        request,
                        typeof params.abortSignal!.reason === 'string'
                            ? params.abortSignal!.reason
                            : 'Caller aborted'
                    );
                };
                request.abortListener = listener;
                if (params.abortSignal.aborted) {
                    // Fire immediately if caller aborted before we even queued.
                    setImmediate(listener);
                } else {
                    params.abortSignal.addEventListener('abort', listener, { once: true });
                }
            }

            // Add to queue
            this.requestQueue.push(request);

            // Try to process immediately
            this.processQueue();
        });
    }

    /**
     * Abort an in-flight or queued request.
     *
     * If the request is still queued, removes it and resolves with a TIMEOUT
     * result (no worker ever picked it up). If a worker is actively running
     * it, sends an `abort` IPC message so the worker rejects its pending
     * bridge calls cleanly, then resolves with a TIMEOUT result. The worker
     * will still send its eventual `result` / `error` message when the
     * sandbox unwinds; `handleWorkerMessage` drops it because
     * `worker.currentRequest` is already cleared.
     */
    private abortRequest(request: PendingRequest, reason: string): void {
        if (request.aborted) return;
        request.aborted = true;

        // Remove from queue if still waiting.
        const queueIndex = this.requestQueue.findIndex(r => r.requestId === request.requestId);
        if (queueIndex >= 0) {
            this.requestQueue.splice(queueIndex, 1);
        }

        // If a worker is actively running this request, tell it to abort
        // pending bridge calls. We do NOT kill the worker — the sandbox
        // script will unwind naturally once its awaits reject.
        const activeWorker = this.workers.find(
            w => w && w.currentRequest && w.currentRequest.requestId === request.requestId
        );
        if (activeWorker && activeWorker.process.connected) {
            try {
                activeWorker.process.send({
                    type: 'abort',
                    requestId: request.requestId,
                    reason
                });
            } catch (err) {
                LogError(
                    new Error(
                        `Failed to send abort to worker ${activeWorker.id}: ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    )
                );
            }
            // Decouple the request from the worker so the eventual
            // result/error message is ignored by handleWorkerMessage. Leave
            // worker.busy=true so we don't queue fresh work onto a worker
            // that's still winding down; it'll flip back when the stale
            // result arrives (and the `requestId !== worker.currentRequest`
            // guard in handleWorkerMessage catches it).
            activeWorker.currentRequest = null;
            // Allow the worker to accept fresh work as soon as it's ready;
            // the pool will swing back around on the next settle from the
            // stale message because we won't match the requestId.
            activeWorker.busy = false;
        }

        clearTimeout(request.timeout);
        this.detachAbortListener(request);

        request.resolve({
            success: false,
            error: reason,
            errorType: 'TIMEOUT'
        });

        this.processQueue();
    }

    private detachAbortListener(request: PendingRequest): void {
        if (request.params.abortSignal && request.abortListener) {
            request.params.abortSignal.removeEventListener('abort', request.abortListener);
            request.abortListener = undefined;
        }
    }

    /**
     * Process queued requests by assigning them to available workers
     */
    private processQueue(): void {
        if (this.requestQueue.length === 0) {
            return;
        }

        // Find an available worker
        const worker = this.workers.find(w => w && !w.busy);
        if (!worker) {
            return; // All workers busy, wait for one to finish
        }

        // Get next request from queue
        const request = this.requestQueue.shift();
        if (!request) {
            return;
        }

        // Assign request to worker
        worker.busy = true;
        worker.currentRequest = request;

        // Send execution request to worker — strip non-serializable fields
        // (`bridgeHandlers` are functions, `abortSignal` is a live object).
        const ipcParams = { ...request.params } as CodeExecutionParams;
        delete (ipcParams as { bridgeHandlers?: unknown }).bridgeHandlers;
        delete (ipcParams as { abortSignal?: unknown }).abortSignal;

        worker.process.send({
            type: 'execute',
            requestId: request.requestId,
            params: ipcParams
        });

        // Try to process more if queue has items
        if (this.requestQueue.length > 0) {
            setImmediate(() => this.processQueue());
        }
    }

    /**
     * Get pool statistics
     */
    getStats(): {
        totalWorkers: number;
        activeWorkers: number;
        busyWorkers: number;
        queueLength: number;
    } {
        const activeWorkers = this.workers.filter(w => w !== null).length;
        const busyWorkers = this.workers.filter(w => w && w.busy).length;

        return {
            totalWorkers: this.poolSize,
            activeWorkers,
            busyWorkers,
            queueLength: this.requestQueue.length
        };
    }

    /**
     * Shutdown the worker pool gracefully
     */
    async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        LogStatus('Shutting down code execution worker pool...');

        // Reject all queued requests
        for (const request of this.requestQueue) {
            clearTimeout(request.timeout);
            this.detachAbortListener(request);
            request.resolve({
                success: false,
                error: 'Worker pool is shutting down',
                errorType: 'RUNTIME_ERROR'
            });
        }
        this.requestQueue = [];

        // Kill all workers
        const killPromises = this.workers
            .filter(w => w !== null)
            .map(worker => {
                return new Promise<void>((resolve) => {
                    if (worker.process.killed) {
                        resolve();
                        return;
                    }

                    worker.process.once('exit', () => resolve());
                    worker.process.kill('SIGTERM');

                    // Force kill after 5 seconds
                    setTimeout(() => {
                        if (!worker.process.killed) {
                            worker.process.kill('SIGKILL');
                        }
                        resolve();
                    }, 5000);
                });
            });

        await Promise.all(killPromises);
        LogStatus('Worker pool shutdown complete');
    }
}
