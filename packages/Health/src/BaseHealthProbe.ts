import type { DatabaseProviderBase } from '@memberjunction/core';
import { LogError } from '@memberjunction/core';
import type { HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, ProbeExecutionMode } from './types';

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
   * @param context The probe context; `context.DatabaseProvider` supplies the transaction scope.
   * @param fn The synthetic work to run. Receives the same `DatabaseProviderBase` the scope was
   *           opened on — there is no separate "isolated" provider instance, isolation comes
   *           entirely from the unconditional rollback.
   * @returns Whatever `fn` returns.
   * @throws Re-throws whatever `fn` throws, after rolling the scope back.
   */
  protected async WithRolledBackTransaction<T>(context: HealthProbeContext, fn: (txProvider: DatabaseProviderBase) => Promise<T>): Promise<T> {
    const provider = context.DatabaseProvider;
    const scope = await provider.BeginEntityTransaction();
    try {
      return await fn(provider);
    } finally {
      try {
        await scope.Rollback();
      } catch (rollbackError) {
        LogError(
          `BaseHealthProbe.WithRolledBackTransaction (${this.ProbeKey}): rollback failed after the ` +
            `probe's synthetic work finished. Rollback failure: ` +
            `${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
    }
  }
}
