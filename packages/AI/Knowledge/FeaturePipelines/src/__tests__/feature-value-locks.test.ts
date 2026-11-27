/**
 * PR 5 milestone B1 — attack 15 (lock timeout and order), the `FeatureValueLocks` half: a held lock is waited for with
 * backoff, a `Success: false` result is "not acquired" and never an empty set, the deadline throws the typed
 * `FeatureValueLockTimeoutError`, and an error `RunQuery` throws is rethrown at once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, RunQueryParams, UserInfo } from '@memberjunction/core';
import {
    FEATURE_VALUE_LOCK_QUERIES,
    FeatureValueLockTimeoutError,
    FeatureValueLocks,
    type FeatureValueLockClock,
} from '../cache/feature-value-locks';

type QueryResult = { Success: boolean; Results: Record<string, string | number | null>[]; ErrorMessage: string };

const { script, calls } = vi.hoisted(() => ({
    /** The results the next RunQuery calls return, in order; an Error is thrown instead of returned. */
    script: [] as Array<QueryResult | Error>,
    calls: [] as RunQueryParams[],
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class ScriptedRunQuery {
        public async RunQuery(params: RunQueryParams): Promise<QueryResult> {
            calls.push(params);
            const next = script.shift();
            if (next instanceof Error) throw next;
            return next ?? { Success: true, Results: [], ErrorMessage: '' };
        }
    }
    return { ...actual, RunQuery: ScriptedRunQuery };
});

/** A clock that advances by each sleep without waiting, recording the sleeps. */
class FakeClock implements FeatureValueLockClock {
    public Time = 0;
    public Sleeps: number[] = [];
    public Now(): number { return this.Time; }
    public async Sleep(ms: number): Promise<void> {
        this.Sleeps.push(ms);
        this.Time += ms;
    }
}

const user = { ID: 'user-1' } as Partial<UserInfo> as UserInfo;
const provider = { RunQuery: vi.fn() } as Partial<IMetadataProvider> as IMetadataProvider;
const params = { RecordProcessID: 'rp-1', EntityID: 'ent-1', RecordID: 'r1', FeatureNames: ['JobTitleLevel'] };
const held: QueryResult = { Success: false, Results: [], ErrorMessage: 'Lock request time out period exceeded.' };

describe('FeatureValueLocks (attack 15)', () => {
    beforeEach(() => {
        script.length = 0;
        calls.length = 0;
    });

    it('its constants mirror PublishLocks: 250 ms doubling to 4 s, 30 s deadline', () => {
        expect([FeatureValueLocks.FIRST_BACKOFF_MS, FeatureValueLocks.MAX_BACKOFF_MS, FeatureValueLocks.LOCK_WAIT_MS]).toEqual([250, 4_000, 30_000]);
    });

    it('returns the locked rows on the first success, passing the identity parameters by name', async () => {
        script.push({ Success: true, Results: [{ ID: 'fv-1', FeatureName: 'JobTitleLevel', PipelineVersion: 1 }], ErrorMessage: '' });
        const rows = await FeatureValueLocks.Acquire(FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, params, provider, user, new FakeClock());
        expect(rows).toEqual([{ ID: 'fv-1', FeatureName: 'JobTitleLevel', PipelineVersion: 1 }]);
        expect(calls[0]).toMatchObject({ QueryName: FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, CategoryPath: FEATURE_VALUE_LOCK_QUERIES.CategoryPath, Parameters: params });
    });

    it('a Success: false result is "not acquired": retried, never an empty set', async () => {
        script.push(held, { Success: true, Results: [{ ID: 'fv-1', FeatureName: 'JobTitleLevel', PipelineVersion: 1 }], ErrorMessage: '' });
        const clock = new FakeClock();
        const rows = await FeatureValueLocks.Acquire(FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, params, provider, user, clock);
        expect(rows).toHaveLength(1);
        expect(calls).toHaveLength(2);
        expect(clock.Sleeps).toEqual([250]);
    });

    it('backs off 250, 500, 1000, 2000, 4000, 4000… and throws FeatureValueLockTimeoutError at 30 s', async () => {
        for (let i = 0; i < 100; i++) script.push(held);
        const clock = new FakeClock();
        const attempt = FeatureValueLocks.Acquire(FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman, params, provider, user, clock);
        await expect(attempt).rejects.toBeInstanceOf(FeatureValueLockTimeoutError);
        await attempt.catch((e: FeatureValueLockTimeoutError) => {
            expect(e.QueryName).toBe(FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman);
            expect(e.Attempts).toBe(calls.length);
            expect(e.LastError).toBe(held.ErrorMessage);
        });
        expect(clock.Sleeps.slice(0, 6)).toEqual([250, 500, 1000, 2000, 4000, 4000]);
        expect(clock.Sleeps.reduce((a, b) => a + b, 0)).toBe(30_000);
    });

    it('rethrows an error RunQuery throws (a lost connection is not a lock conflict)', async () => {
        script.push(new Error('connection lost'));
        await expect(FeatureValueLocks.Acquire(FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, params, provider, user, new FakeClock())).rejects.toThrow('connection lost');
        expect(calls).toHaveLength(1);
    });

    it('names the two stored Queries the migration\'s filtered indexes serve', () => {
        expect(FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline).toBe('Predictive Studio: Lock Open Pipeline Feature Values');
        expect(FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman).toBe('Predictive Studio: Lock Open Human Feature Values');
    });
});
