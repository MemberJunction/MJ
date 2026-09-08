/**
 * Tests for the bounded action-log purge.
 *
 * A retention job's two ways to be wrong are asymmetric. Keeping too much wastes disk; deleting too
 * much destroys history that nothing can rebuild. So the tests lean hardest on the refusals — no
 * clause when nothing is configured, NULL retention untouched unless someone explicitly asked, and
 * a per-run ceiling that reports having hit it rather than looking finished.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

import {
    ActionLogRetentionScheduledJobDriver,
    BuildRetentionBuckets,
    DEFAULT_MAX_DELETES_PER_RUN,
    type ActionLogRetentionJobConfiguration,
} from '../drivers/ActionLogRetentionScheduledJobDriver';
import type { MJActionExecutionLogEntity, MJScheduledJobEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const USER = { ID: 'user-1' } as UserInfo;

describe('BuildRetentionBuckets', () => {
    it('collapses duplicates — one bucket per distinct lifetime, not per action', () => {
        // The point of bucketing: a hundred actions sharing a 30-day policy must produce ONE
        // indexable range predicate, not a hundred.
        const buckets = BuildRetentionBuckets([30, 30, 30, 7], NOW);
        expect(buckets.map((b) => b.RetentionDays)).toEqual([7, 30]);
    });

    it('computes the cutoff as now minus the lifetime', () => {
        const [bucket] = BuildRetentionBuckets([7], NOW);
        expect(bucket.Cutoff.toISOString()).toBe('2026-08-01T12:00:00.000Z');
    });

    it('drops zero, negative and non-finite lifetimes', () => {
        // A retention of 0 would mean "delete on write", which no UI should be able to express by
        // accident — and NaN reaching a date computation produces an Invalid Date, which SQL Server
        // would receive as a malformed literal.
        expect(BuildRetentionBuckets([0, -5, Number.NaN, Number.POSITIVE_INFINITY, 14], NOW)
            .map((b) => b.RetentionDays)).toEqual([14]);
    });

    it('returns nothing when nothing is configured', () => {
        expect(BuildRetentionBuckets([], NOW)).toEqual([]);
    });
});

/** A driver with its two data reads stubbed, so the filter logic can be exercised offline. */
class TestDriver extends ActionLogRetentionScheduledJobDriver {
    constructor(private readonly retentions: number[]) { super(); }
    protected override async distinctRetentionDays(): Promise<number[]> { return this.retentions; }
    public BuildFilter(config: ActionLogRetentionJobConfiguration): Promise<string | null> {
        return this.buildExpiredFilter(config, USER);
    }
}

describe('buildExpiredFilter', () => {
    it('returns null when no action configures retention and no default is set', async () => {
        // Not an empty string and not a never-matching clause: null lets the caller skip the query
        // entirely, so an instance that has never configured retention pays nothing nightly.
        expect(await new TestDriver([]).BuildFilter({})).toBeNull();
    });

    it('emits one clause per bucket, matched on the row\'s own stamped retention', async () => {
        const filter = await new TestDriver([7, 30]).BuildFilter({});
        expect(filter).toContain('RetentionPeriod = 7');
        expect(filter).toContain('RetentionPeriod = 30');
        expect(filter).toContain(' OR ');
    });

    it('does NOT touch NULL-retention rows unless a default is explicitly configured', async () => {
        // NULL is what the schema calls indefinite. A purge job inventing a lifetime for it would
        // delete history nobody agreed to lose, and there would be nothing left to notice with.
        const withoutDefault = await new TestDriver([30]).BuildFilter({});
        expect(withoutDefault).not.toContain('RetentionPeriod IS NULL');

        const withDefault = await new TestDriver([30]).BuildFilter({ DefaultRetentionDays: 90 });
        expect(withDefault).toContain('RetentionPeriod IS NULL');
    });

    it('ignores a nonsensical default rather than deleting on a zero lifetime', async () => {
        expect(await new TestDriver([]).BuildFilter({ DefaultRetentionDays: 0 })).toBeNull();
        expect(await new TestDriver([]).BuildFilter({ DefaultRetentionDays: -1 })).toBeNull();
    });
});

/** Fake log rows whose Delete() outcome the test controls. */
function logRow(id: string, deletes = true): MJActionExecutionLogEntity {
    return {
        ID: id,
        Delete: async () => deletes,
        LatestResult: deletes ? undefined : { CompleteMessage: 'FK violation' },
    } as unknown as MJActionExecutionLogEntity;
}

/** A driver whose candidate set is fixed, so Execute's accounting can be checked. */
class ExecuteDriver extends ActionLogRetentionScheduledJobDriver {
    constructor(private readonly rows: MJActionExecutionLogEntity[]) { super(); }
    protected override async findExpiredLogs(): Promise<MJActionExecutionLogEntity[]> { return this.rows; }
}

const scheduleWith = (configuration: string | null) =>
    ({ Name: 'Nightly purge', Configuration: configuration } as unknown as MJScheduledJobEntity);

describe('Execute', () => {
    const run = (driver: ActionLogRetentionScheduledJobDriver, configuration: string | null = null) =>
        driver.Execute({ Schedule: scheduleWith(configuration), ContextUser: USER } as never);

    it('counts what it deleted', async () => {
        const result = await run(new ExecuteDriver([logRow('a'), logRow('b')]));
        expect(result.Success).toBe(true);
        expect(result.Details?.['Deleted']).toBe(2);
        expect(result.Details?.['Failed']).toBe(0);
    });

    it('keeps going past a row it could not delete', async () => {
        // One bad row — an FK an extension added, a permission gap — must not strand the rest of the
        // purge behind it every night.
        const result = await run(new ExecuteDriver([logRow('a'), logRow('bad', false), logRow('c')]));
        expect(result.Details?.['Deleted']).toBe(2);
        expect(result.Details?.['Failed']).toBe(1);
    });

    it('says when it stopped at the ceiling rather than because it was finished', async () => {
        // Without this, "Deleted: 2" reads as "all clean" when a backlog remains.
        const rows = [logRow('a'), logRow('b')];
        const result = await run(new ExecuteDriver(rows), JSON.stringify({ MaxDeletesPerRun: 2 }));
        expect(result.Details?.['ReachedCap']).toBe(true);
    });

    it('does not claim to have hit a ceiling it did not reach', async () => {
        const result = await run(new ExecuteDriver([logRow('a')]), JSON.stringify({ MaxDeletesPerRun: 10 }));
        expect(result.Details?.['ReachedCap']).toBe(false);
    });

    it('runs with NO configuration at all', async () => {
        // Every setting here is optional. A job that refused to run because nobody filled in a box
        // would be a retention policy that quietly never applies.
        const result = await run(new ExecuteDriver([logRow('a')]));
        expect(result.Success).toBe(true);
    });

    it('survives malformed configuration JSON by falling back to defaults', async () => {
        const result = await run(new ExecuteDriver([]), '{not json');
        expect(result.Success).toBe(true);
    });
});

describe('ValidateConfiguration', () => {
    const validate = (configuration: string | null) =>
        new ActionLogRetentionScheduledJobDriver().ValidateConfiguration(scheduleWith(configuration));

    it('accepts an absent configuration', () => {
        expect(validate(null).Success).toBe(true);
    });

    it('rejects a non-positive retention', () => {
        const result = validate(JSON.stringify({ DefaultRetentionDays: 0 }));
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toContain('DefaultRetentionDays');
    });

    it('rejects a non-positive cap', () => {
        expect(validate(JSON.stringify({ MaxDeletesPerRun: -1 })).Success).toBe(false);
    });

    it('accepts sensible values', () => {
        expect(validate(JSON.stringify({ DefaultRetentionDays: 90, MaxDeletesPerRun: 1000 })).Success).toBe(true);
    });
});

describe('the per-run ceiling', () => {
    it('has a default, so a first run against a neglected table cannot be unbounded', () => {
        expect(DEFAULT_MAX_DELETES_PER_RUN).toBeGreaterThan(0);
    });
});
