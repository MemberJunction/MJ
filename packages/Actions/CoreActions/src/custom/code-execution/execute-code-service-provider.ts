/**
 * Shared, persistent `CodeExecutionService` for the "Execute Code" action.
 *
 * @module @memberjunction/core-actions
 */

import { CodeExecutionService } from '@memberjunction/code-execution';
import { BaseSingleton, IShutdownable, ShutdownRegistry } from '@memberjunction/global';

/**
 * Owns a single, process-lifetime `CodeExecutionService` (and its underlying forked
 * worker-process pool) shared across every `ExecuteCodeAction` invocation.
 *
 * Prior to this fix, `ExecuteCodeAction.InternalRunAction` called `new CodeExecutionService()`
 * on every action run. `CodeExecutionService.execute()` auto-initializes on first use, which
 * forks `WorkerPool`'s configured number of OS child processes (default 2) — and the action
 * never called `shutdown()`, so those processes (and their open IPC channels) were never
 * reaped. Every "Execute Code" action run leaked two live child processes for the life of the
 * host process. Mirrors the singleton pattern already used by `RuntimeActionExecutor`
 * (`packages/Actions/Runtime/src/RuntimeActionExecutor.ts`) for the same underlying service,
 * which amortizes the isolate cold-start cost across calls instead of paying it (and leaking
 * workers) on every single invocation.
 */
export class ExecuteCodeServiceProvider extends BaseSingleton<ExecuteCodeServiceProvider> implements IShutdownable {
    private _service: CodeExecutionService | null = null;

    protected constructor() {
        super();
        ShutdownRegistry.Instance.Register(this);
    }

    public static get Instance(): ExecuteCodeServiceProvider {
        return super.getInstance<ExecuteCodeServiceProvider>();
    }

    public readonly ShutdownName = 'ExecuteCodeServiceProvider';

    /** Lazy-accessor so the worker pool isn't forked until the first "Execute Code" action call. */
    public GetService(): CodeExecutionService {
        if (!this._service) {
            this._service = new CodeExecutionService();
        }
        return this._service;
    }

    /** Gracefully tears down the worker pool. Idempotent — safe to call more than once. */
    public async Shutdown(): Promise<void> {
        if (this._service) {
            const service = this._service;
            this._service = null;
            await service.shutdown();
        }
    }
}
