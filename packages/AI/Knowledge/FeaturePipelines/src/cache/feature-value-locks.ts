/**
 * @fileoverview The open-row locks of the Feature Value write path (PR 5 §5.2.1, D5-28, D5-40; PR 4's `PublishLocks`
 * pattern): two stored Queries (`metadata/queries/.predictive-studio-feature-value-locks.json`), each a single
 * `SELECT … WITH (UPDLOCK, HOLDLOCK, NOWAIT)` whose `WHERE` repeats its filtered index's predicate, run through
 * `RunQuery` on the caller's provider inside the caller's transaction — the Pipeline lock first, then the Human lock.
 *
 * A stored query cannot carry `SET LOCK_TIMEOUT`, so a held lock fails at once (SQL Server error 1222) and the wait
 * happens here. `RunQuery` does not throw on it: it returns `Success: false` with the driver's text (the error number
 * is not exposed), so every `Success: false` result is "not acquired yet" — never an empty set, which would read as "no
 * open row" and let two writers open two rows — and is retried with backoff until the deadline, when
 * `FeatureValueLockTimeoutError` is thrown and the record fails with nothing written. An error `RunQuery` throws (a
 * lost connection) is not a lock conflict and is rethrown at once.
 * @module @memberjunction/feature-pipelines
 */
import { RunQuery, type IMetadataProvider, type IRunQueryProvider, type UserInfo } from '@memberjunction/core';

/** The clock the lock wait reads and sleeps on; tests pass one that advances without waiting. */
export interface FeatureValueLockClock {
    /** Milliseconds since an arbitrary origin. */
    Now(): number;
    /** Resolves after `ms` milliseconds. */
    Sleep(ms: number): Promise<void>;
}

/** The system clock. */
export const FEATURE_VALUE_LOCK_SYSTEM_CLOCK: FeatureValueLockClock = {
    Now: () => Date.now(),
    Sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** The two stored lock Queries and the category path they live under. */
export const FEATURE_VALUE_LOCK_QUERIES = {
    CategoryPath: '/MJ/Predictive Studio/',
    LockOpenPipeline: 'Predictive Studio: Lock Open Pipeline Feature Values',
    LockOpenHuman: 'Predictive Studio: Lock Open Human Feature Values',
} as const;

/** One locked open row, as the lock Queries return it. */
export type FeatureValueLockRow = Record<string, string | number | null>;

/** The lock of a record's open values was not acquired before the deadline: the record fails, nothing is written. */
export class FeatureValueLockTimeoutError extends Error {
    constructor(
        public readonly QueryName: string,
        public readonly Attempts: number,
        public readonly LastError: string,
    ) {
        super(`FeatureValueLocks: '${QueryName}' was not acquired within ${FeatureValueLocks.LOCK_WAIT_MS} ms (${Attempts} attempts): ${LastError}`);
        this.name = 'FeatureValueLockTimeoutError';
    }
}

/** The provider cannot run saved queries, so the open rows cannot be locked. */
export class FeatureValueLockUnsupportedError extends Error {
    constructor(public readonly QueryName: string) {
        super(`FeatureValueLocks: the provider cannot run saved queries, so '${QueryName}' cannot run`);
        this.name = 'FeatureValueLockUnsupportedError';
    }
}

/** Taking the open-row locks with the 30 s retry. */
export class FeatureValueLocks {
    /** How long a lock is waited for before the record fails (mirrors PublishLocks, D4-91). */
    public static readonly LOCK_WAIT_MS = 30_000;
    /** The first retry's backoff; each later one doubles it. */
    public static readonly FIRST_BACKOFF_MS = 250;
    /** The longest backoff between two attempts. */
    public static readonly MAX_BACKOFF_MS = 4_000;

    /** True when a metadata provider can also run saved queries (every MJ database provider can; a test double may not). */
    public static IsRunQueryProvider(provider: IMetadataProvider): provider is IMetadataProvider & IRunQueryProvider {
        return 'RunQuery' in provider && typeof provider.RunQuery === 'function';
    }

    /**
     * Runs a lock Query until it succeeds or {@link LOCK_WAIT_MS} has passed since the first attempt, sleeping
     * {@link FIRST_BACKOFF_MS} doubling to {@link MAX_BACKOFF_MS} between attempts (never past the deadline).
     * @returns the locked open rows
     * @throws FeatureValueLockTimeoutError at the deadline; FeatureValueLockUnsupportedError when the provider cannot
     * run saved queries; whatever `RunQuery` throws
     */
    public static async Acquire(queryName: string, params: Record<string, string | readonly string[]>, provider: IMetadataProvider, contextUser: UserInfo,
        clock: FeatureValueLockClock = FEATURE_VALUE_LOCK_SYSTEM_CLOCK): Promise<readonly FeatureValueLockRow[]> {
        if (!FeatureValueLocks.IsRunQueryProvider(provider)) {
            throw new FeatureValueLockUnsupportedError(queryName);
        }
        const deadline = clock.Now() + FeatureValueLocks.LOCK_WAIT_MS;
        let backoff = FeatureValueLocks.FIRST_BACKOFF_MS;
        for (let attempt = 1; ; attempt++) {
            const result = await new RunQuery(provider).RunQuery({ QueryName: queryName, CategoryPath: FEATURE_VALUE_LOCK_QUERIES.CategoryPath, Parameters: { ...params } }, contextUser);
            if (result.Success) {
                return result.Results;
            }
            const remaining = deadline - clock.Now();
            if (remaining <= 0) {
                throw new FeatureValueLockTimeoutError(queryName, attempt, result.ErrorMessage || 'unknown error');
            }
            await clock.Sleep(Math.min(backoff, remaining));
            backoff = Math.min(backoff * 2, FeatureValueLocks.MAX_BACKOFF_MS);
        }
    }
}
