/**
 * @module registry/publish-locks
 *
 * The publish locks (D-020, D4-91): the pipeline row, then the model row, each taken by a stored Query (`metadata/queries/`,
 * `Predictive Studio: Lock Pipeline For Publish` and `… Lock Model For Publish`) through `RunQuery` on the caller's
 * provider, inside the caller's transaction. The queries are single `WITH (UPDLOCK, HOLDLOCK, NOWAIT)` statements (a
 * stored query cannot carry `SET LOCK_TIMEOUT`), so a held lock fails at once and the wait happens here: the query is
 * retried with backoff (250 ms, doubling, capped at 4 s) until 30 s have passed, then the attempt is refused
 * `publish-in-progress` (transient).
 *
 * **How a lock conflict reaches this code (established against SQL Server, Task M3.2).** The NOWAIT query's error 1222
 * ("Lock request time out period exceeded") does not throw out of `RunQuery`: `GenericDatabaseProvider.InternalRunQuery`
 * catches it, logs it and returns `Success: false` with the driver's text in `ErrorMessage`; the result carries no error
 * number, and the transaction stays usable (the next query in it succeeded). So the number cannot be read here, and the
 * message is not parsed (D4-91): every failed result of a lock query is treated as "not acquired yet" and retried. The
 * trade-off: a lock query that fails for another reason is also retried until the 30 s deadline and then reported as
 * `publish-in-progress`, transient, so a retry reports it again rather than a different error. An error `RunQuery`
 * throws (a lost connection) is not a lock conflict and is rethrown at once.
 */
import { RunQuery, type IMetadataProvider, type IRunQueryProvider, type RunQueryResult } from '@memberjunction/core';

import type { RegistryContext } from './registry-context';

/** The clock the lock wait reads and sleeps on; tests pass a fake that advances without waiting. */
export interface GateClock {
  /** Milliseconds since an arbitrary origin. */
  Now(): number;
  /** Resolves after `ms` milliseconds. */
  Sleep(ms: number): Promise<void>;
}

/** The system clock. */
export const SYSTEM_CLOCK: GateClock = {
  Now: () => Date.now(),
  Sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** The stored Query names and the category path they live under (M3.1). */
export const PUBLISH_LOCK_QUERIES = {
  CategoryPath: '/MJ/Predictive Studio/',
  LockPipeline: 'Predictive Studio: Lock Pipeline For Publish',
  LockModel: 'Predictive Studio: Lock Model For Publish',
  NextModelVersion: 'Predictive Studio: Next Model Version',
} as const;

/** Thrown when a registry read needs `RunQuery` and the provider cannot run saved queries. */
export class RunQueryUnsupportedError extends Error {
  constructor(public readonly QueryName: string) {
    super(`Predictive Studio registry: the provider cannot run saved queries, so '${QueryName}' cannot run`);
    this.name = 'RunQueryUnsupportedError';
  }
}

/** A lock taken, or the wait that ran out. */
export type LockAttempt =
  | { readonly Acquired: true; readonly Rows: readonly Record<string, string | number | null>[] }
  | { readonly Acquired: false; readonly Attempts: number; readonly LastError: string };

/** Running the registry's stored Queries, and taking the publish locks with the 30 s retry. */
export class PublishLocks {
  /** How long a lock is waited for before the attempt is refused (D4-91). */
  public static readonly LOCK_WAIT_MS = 30_000;
  /** The first retry's backoff; each later one doubles it. */
  public static readonly FIRST_BACKOFF_MS = 250;
  /** The longest backoff between two attempts. */
  public static readonly MAX_BACKOFF_MS = 4_000;

  /** True when a metadata provider can also run saved queries (every MJ provider can; a test double may not). */
  public static IsRunQueryProvider(provider: IMetadataProvider): provider is IMetadataProvider & IRunQueryProvider {
    return 'RunQuery' in provider && typeof provider.RunQuery === 'function';
  }

  /**
   * Runs one stored Query by name on `ctx.Provider` as `ctx.ContextUser`, with its parameters by name.
   *
   * @throws RunQueryUnsupportedError when the provider cannot run saved queries
   */
  public static async RunStored(queryName: string, parameters: Readonly<Record<string, string>>, ctx: RegistryContext): Promise<RunQueryResult> {
    const provider = ctx.Provider;
    if (!PublishLocks.IsRunQueryProvider(provider)) throw new RunQueryUnsupportedError(queryName);
    return new RunQuery(provider).RunQuery({ QueryName: queryName, CategoryPath: PUBLISH_LOCK_QUERIES.CategoryPath, Parameters: { ...parameters } }, ctx.ContextUser);
  }

  /**
   * Runs a lock Query until it succeeds or {@link LOCK_WAIT_MS} has passed since the first attempt, sleeping
   * {@link FIRST_BACKOFF_MS} doubling to {@link MAX_BACKOFF_MS} between attempts (never past the deadline). Every failed
   * result is a lock not yet acquired (see the module comment for why the error number cannot be read).
   *
   * @throws whatever `RunQuery` throws (a connection error is not a lock conflict)
   */
  public static async Acquire(queryName: string, parameters: Readonly<Record<string, string>>, ctx: RegistryContext, clock: GateClock): Promise<LockAttempt> {
    const deadline = clock.Now() + PublishLocks.LOCK_WAIT_MS;
    let backoff = PublishLocks.FIRST_BACKOFF_MS;
    for (let attempt = 1; ; attempt++) {
      const result = await PublishLocks.RunStored(queryName, parameters, ctx);
      if (result.Success) return { Acquired: true, Rows: result.Results };
      const remaining = deadline - clock.Now();
      if (remaining <= 0) return { Acquired: false, Attempts: attempt, LastError: result.ErrorMessage || 'unknown error' };
      await clock.Sleep(Math.min(backoff, remaining));
      backoff = Math.min(backoff * 2, PublishLocks.MAX_BACKOFF_MS);
    }
  }
}
