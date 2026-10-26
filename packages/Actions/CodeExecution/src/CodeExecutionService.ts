/**
 * Code Execution Service
 *
 * Provides secure, sandboxed execution of JavaScript code using isolated-vm
 * running in separate worker processes for fault isolation.
 *
 * This service enables AI agents and workflows to generate and run code safely
 * without compromising system security or stability.
 *
 * Security Model (Multi-Layer Defense):
 * 1. Process Isolation - Workers run in separate processes (protects against V8 crashes)
 * 2. V8 Isolates - Code runs in isolated V8 contexts (protects against sandbox escapes)
 * 3. Module Blocking - Dangerous Node.js modules are blocked (fs, http, child_process, etc.)
 * 4. Resource Limits - Enforced timeout and memory limits (prevents DoS)
 * 5. Library Allowlist - Only pre-vetted libraries available (prevents supply chain attacks)
 *
 * @module @memberjunction/code-execution
 */

import { CodeExecutionParams, CodeExecutionResult } from './types';
import { WorkerPool, WorkerPoolOptions } from './WorkerPool';
import { PythonRunner } from './PythonRunner';

/**
 * Service for executing JavaScript and Python code in a secure sandbox
 *
 * This service manages a pool of worker processes that execute code with full isolation.
 * If a worker crashes due to catastrophic errors, it's automatically restarted without
 * affecting the main application or other workers.
 */
export class CodeExecutionService {
    private workerPool: WorkerPool;
    private pythonRunner: PythonRunner;
    private initialized: boolean = false;
    /**
     * Create a new CodeExecutionService
     *
     * @param options - Worker pool configuration options
     */
    constructor(options: WorkerPoolOptions = {}) {
        this.workerPool = new WorkerPool(options);
        this.pythonRunner = new PythonRunner();
    }

    /**
     * Initialize the service and worker pool
     *
     * This must be called before executing any code. It starts the worker processes
     * and waits for them to be ready.
     */
    async Initialize(): Promise<void> {
        if (!this.initialized) {
            await this.workerPool.initialize();
            this.initialized = true;
        }
    }

    /** @deprecated Use {@link Initialize}. */
    async initialize(): Promise<void> {
        return this.Initialize();
    }

    /**
     * Execute JavaScript or Python code in a sandboxed environment
     *
     * The code runs in a worker process with full isolation. If the worker crashes
     * due to catastrophic errors, it will be automatically restarted without affecting
     * this call or the main application.
     *
     * @param params - Execution parameters (code, language, input data, files, limits)
     * @returns Execution result with output, logs, files, or error
     */
    async Execute(params: CodeExecutionParams): Promise<CodeExecutionResult> {
        // Auto-initialize if not already done
        if (!this.initialized) {
            await this.Initialize();
        }

        // Validate parameters
        if (!params.code || typeof params.code !== 'string') {
            return {
                success: false,
                error: 'Code parameter is required and must be a string',
                errorType: 'RUNTIME_ERROR'
            };
        }

        if (params.language === 'python') {
            return this.pythonRunner.Execute(params);
        }

        if (params.language !== 'javascript') {
            return {
                success: false,
                error: `Unsupported language: ${params.language}. Supported languages are 'javascript' and 'python'.`,
                errorType: 'RUNTIME_ERROR'
            };
        }

        // Execute in worker pool
        return this.workerPool.execute(params);
    }

    /** @deprecated Use {@link Execute}. */
    async execute(params: CodeExecutionParams): Promise<CodeExecutionResult> {
        return this.Execute(params);
    }

    /**
     * Get worker pool statistics
     *
     * @returns Pool statistics including worker count and queue length
     */
    GetStats() {
        return this.workerPool.getStats();
    }

    /** @deprecated Use {@link GetStats}. */
    getStats() {
        return this.GetStats();
    }

    /**
     * Shutdown the service and all worker processes
     *
     * This should be called during application shutdown to gracefully terminate
     * all workers and reject any pending requests.
     */
    async Shutdown(): Promise<void> {
        if (this.initialized) {
            await this.workerPool.shutdown();
            this.initialized = false;
        }
    }

    /** @deprecated Use {@link Shutdown}. */
    async shutdown(): Promise<void> {
        return this.Shutdown();
    }
}
