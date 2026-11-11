import type { DatabaseProviderBase } from '@memberjunction/core';
import { LogError } from '@memberjunction/core';
import type { HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, ProbeExecutionMode } from './types';

/**
 * Thrown by {@link BaseHealthProbe.WithRolledBackTransaction} when the mandatory rollback itself
 * fails — regardless of whether the probe's synthetic work (`fn`) succeeded or failed. A rollback
 * failure is strictly worse than a probe failure: it means the "unconditionally rolled back"
 * guarantee did not hold, so the synthetic write may have been left behind (or a lock held) in a
 * production instance. Swallowing it behind a log line would let a probe report `GREEN` while that
 * side effect sits uncommitted/orphaned, so it is surfaced by throwing instead.
 */
export class HealthProbeRollbackError extends Error {
  /** The probe that was executing when the rollback failed. */
  public readonly ProbeKey: string;

  /** The error the rollback itself threw. */
  public readonly RollbackError: Error;

  /**
   * The error `fn` threw, if any. When set, the rollback failure compounds an already-failing
   * probe; when absent, `fn` had succeeded and the rollback failure is the *only* reason this
   * probe run is unsafe to treat as clean.
   */
  public readonly FnError?: Error;

  constructor(probeKey: string, rollbackError: Error, fnError?: Error) {
    const fnSuffix = fnError ? ` (the probe's synthetic work had also thrown: ${fnError.message})` : '';
    super(`BaseHealthProbe.WithRolledBackTransaction (${probeKey}): rollback failed — ${rollbackError.message}${fnSuffix}`);
    this.name = 'HealthProbeRollbackError';
    this.ProbeKey = probeKey;
    this.RollbackError = rollbackError;
    this.FnError = fnError;
  }
}

/**
 * Base class for every MJ Core, Open App, server-extension, and connector health probe.
 *
 * Subclasses register via `@RegisterClass(BaseHealthProbe, '<ProbeKey>')` so `MJHealthEngine`
 * discovers them automatically through the ClassFactory — no central registry to keep in sync.
 *
 * If `Evaluate()` throws or exceeds `HealthProbeContext.TimeoutMs`, `MJHealthEngine` catches it and
 * emits a `RED` evaluation for every signal this probe declares, with the exception attached. A
 * misbehaving probe therefore can never block or poison the evaluation of any other probe.
 */
export abstract class BaseHealthProbe {
  /** Unique probe key matching the `@RegisterClass` key. */
  public abstract get ProbeKey(): string;

  /** Owning Open App name (e.g. `'mj-bizapps-collaboration'`), or `'__mj'` for MJ Core. */
  public abstract get OwnerApp(): string;

  /** Execution mode: `'passive'` runs on every poll; `'live-test'` runs on install/upgrade/scheduled verification. */
  public abstract get Mode(): ProbeExecutionMode;

  /** Signals emitted by this probe. */
  public abstract get SignalDefinitions(): readonly HealthSignalDefinition[];

  /**
   * Executes the probe and returns evaluations for its declared signals.
   *
   * Implementations should not themselves catch-and-swallow every exception — let unexpected
   * failures propagate so `MJHealthEngine` can apply its uniform RED-with-diagnostic fallback.
   */
  public abstract Evaluate(context: HealthProbeContext): Promise<HealthSignalEvaluation[]>;

  /**
   * Runs `fn` inside an isolated, provider-arbitrated transaction scope and **unconditionally
   * rolls it back** — whether `fn` succeeds, returns a falsy result, or throws. This is the only
   * sanctioned way for a `'live-test'` probe to exercise real writes (create a synthetic record,
   * evaluate a permission function, verify RLS visibility) without leaving side effects in a
   * production instance.
   *
   * The transaction scope comes from `DatabaseProviderBase.BeginEntityTransaction()`, so it joins
   * an already-open ambient transaction as a savepoint when one exists, and opens a real
   * transaction otherwise — exactly like any other MJ entity-transaction caller. Unlike
   * `RunInEntityTransaction`, this helper NEVER commits.
   *
   * A rollback failure is always surfaced — as a thrown {@link HealthProbeRollbackError} — rather
   * than merely logged. If `fn` had already thrown and the rollback fails, {@link HealthProbeRollbackError}
   * is still thrown with {@link HealthProbeRollbackError.FnError} populated, surfacing the critical
   * un-rolled-back transaction state while preserving the original error from `fn`.
   *
   * @param context The probe context; `context.DatabaseProvider` supplies the transaction scope.
   * @param fn The synthetic work to run. Receives the same `DatabaseProviderBase` the scope was
   *           opened on — there is no separate "isolated" provider instance, isolation comes
   *           entirely from the unconditional rollback.
   * @returns Whatever `fn` returns.
   * @throws Whatever `fn` throws when `fn` fails and rollback succeeds. When the rollback itself
   *         fails (regardless of whether `fn` succeeded or failed), throws {@link HealthProbeRollbackError}.
   */
  protected async WithRolledBackTransaction<T>(context: HealthProbeContext, fn: (txProvider: DatabaseProviderBase) => Promise<T>): Promise<T> {
    const provider = context.DatabaseProvider;
    const scope = await provider.BeginEntityTransaction();

    let fnFailed = false;
    let fnError: Error | undefined;
    let result: T | undefined;
    try {
      result = await fn(provider);
    } catch (err) {
      fnFailed = true;
      fnError = err instanceof Error ? err : new Error(String(err));
    }

    try {
      await scope.Rollback();
    } catch (rollbackErr) {
      const normalizedRollbackErr = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
      LogError(
        `BaseHealthProbe.WithRolledBackTransaction (${this.ProbeKey}): rollback failed after the ` +
          `probe's synthetic work ${fnFailed ? 'threw' : 'finished'}. Rollback failure: ` +
          `${normalizedRollbackErr.message}`,
      );
      throw new HealthProbeRollbackError(this.ProbeKey, normalizedRollbackErr, fnError);
    }

    if (fnFailed) {
      throw fnError;
    }
    return result as T;
  }
}
