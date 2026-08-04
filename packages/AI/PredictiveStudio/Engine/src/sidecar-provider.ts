/**
 * Shared, persistent `MLSidecar` for every "Train Model" / "Score Record Set"
 * invocation.
 *
 * @module @memberjunction/predictive-studio
 */

import { MLSidecar, type MLSidecarOptions } from '@memberjunction/predictive-studio-sidecar';
import { BaseSingleton, IShutdownable, ShutdownRegistry } from '@memberjunction/global';

/**
 * Owns a single, process-lifetime `MLSidecar` (and its underlying managed Python
 * child process, in managed mode) shared across every `MJSidecarTrainer` /
 * `MJSidecarPredictor` instance.
 *
 * Prior to this fix, `MJSidecarTrainer`/`MJSidecarPredictor` (`training/seams.ts`,
 * `scoring/seams.ts`) defaulted their constructor parameter to `new MLSidecar()`,
 * and every production call site (`train-model.action.ts`, `run-experiment.deps.ts`,
 * `score-record-set.runner.ts`, `operations/delegation.ts`) constructed a fresh
 * trainer/predictor per action run with no injected sidecar. `MLSidecar.start()`
 * spawns a Python child process in managed mode, but nothing ever called `.stop()`
 * on it — every "Train Model" / "Score Record Set" run leaked a live Python
 * subprocess (its own FastAPI server plus xgboost/lightgbm/scikit-learn process
 * memory) for the life of the host process. Mirrors the singleton pattern already
 * used by `ExecuteCodeServiceProvider`
 * (`packages/Actions/CoreActions/src/custom/code-execution/execute-code-service-provider.ts`)
 * for the identical bug shape (per-call subprocess leak), which also amortizes the
 * Python interpreter + ML-library cold start across calls instead of paying it (and
 * leaking a process) on every single invocation.
 */
export class MLSidecarProvider extends BaseSingleton<MLSidecarProvider> implements IShutdownable {
    private _sidecar: MLSidecar | null = null;

    protected constructor() {
        super();
        ShutdownRegistry.Instance.Register(this);
    }

    public static get Instance(): MLSidecarProvider {
        return super.getInstance<MLSidecarProvider>();
    }

    public readonly ShutdownName = 'MLSidecarProvider';

    /**
     * Lazy-accessor so the Python process isn't spawned until the first train/predict
     * call. `options` only take effect on the FIRST call that creates the sidecar —
     * subsequent calls return the already-constructed shared instance regardless of
     * the options passed, since there is one sidecar for the process's lifetime.
     */
    public GetSidecar(options?: MLSidecarOptions): MLSidecar {
        if (!this._sidecar) {
            this._sidecar = new MLSidecar(options);
        }
        return this._sidecar;
    }

    /** Gracefully stops the managed Python process. Idempotent — safe to call more than once. */
    public async Shutdown(): Promise<void> {
        if (this._sidecar) {
            const sidecar = this._sidecar;
            this._sidecar = null;
            await sidecar.stop();
        }
    }
}
