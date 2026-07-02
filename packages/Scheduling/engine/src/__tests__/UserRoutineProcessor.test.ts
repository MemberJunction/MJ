/**
 * Unit tests for the User Routines dispatcher's pure logic (UserRoutineProcessor):
 * due-evaluation (activation-window edges + NextRunAt tolerance), claim/next-run
 * computation (cron with the StartAt floor), OnChange result hashing, the
 * notify-condition matrix, recipient ordering, and the bounded-concurrency pool.
 *
 * Everything here is deterministic and runs against the REAL implementations —
 * no mocks, no database.
 */
import { describe, it, expect } from 'vitest';
import {
    ComputeRoutineNextRunAt,
    ComputeResultHash,
    EvaluateNotifyCondition,
    IsRoutineDue,
    IsRoutineWithinActivationWindow,
    RoutineNeedsSeeding,
    BuildDueRoutineFilter,
    SortRecipientsBySequence,
    RunWithBoundedConcurrency,
    ROUTINE_DUE_TOLERANCE_MS,
    UserRoutineScheduleFields,
} from '../UserRoutineProcessor';

const NOW = new Date('2026-01-15T12:00:00.000Z');
const HOURLY = '0 0 * * * *'; // top of every hour (6-field cron)

function fields(overrides: Partial<UserRoutineScheduleFields> = {}): UserRoutineScheduleFields {
    return {
        Status: 'Active',
        CronExpression: HOURLY,
        Timezone: 'UTC',
        StartAt: null,
        EndAt: null,
        NextRunAt: new Date(NOW.getTime() - 60_000),
        ...overrides,
    };
}

describe('ComputeRoutineNextRunAt', () => {
    it('returns the first cron occurrence strictly after fromDate', () => {
        const next = ComputeRoutineNextRunAt(HOURLY, 'UTC', new Date('2026-01-15T12:30:00.000Z'));
        expect(next.toISOString()).toBe('2026-01-15T13:00:00.000Z');
    });

    it('an occurrence exactly at fromDate is skipped (strictly after)', () => {
        const next = ComputeRoutineNextRunAt(HOURLY, 'UTC', new Date('2026-01-15T13:00:00.000Z'));
        expect(next.toISOString()).toBe('2026-01-15T14:00:00.000Z');
    });

    it('floors at a future StartAt — the next run is the first occurrence after the window opens', () => {
        const startAt = new Date('2026-02-01T00:00:00.000Z');
        const next = ComputeRoutineNextRunAt(HOURLY, 'UTC', NOW, startAt);
        expect(next.toISOString()).toBe('2026-02-01T01:00:00.000Z');
    });

    it('ignores a StartAt in the past', () => {
        const startAt = new Date('2025-01-01T00:00:00.000Z');
        const next = ComputeRoutineNextRunAt(HOURLY, 'UTC', new Date('2026-01-15T12:30:00.000Z'), startAt);
        expect(next.toISOString()).toBe('2026-01-15T13:00:00.000Z');
    });

    it('honors the timezone when computing occurrences', () => {
        // Daily at 09:00 America/Chicago (CST = UTC-6 in January) from noon UTC → 15:00 UTC same day.
        const next = ComputeRoutineNextRunAt('0 0 9 * * *', 'America/Chicago', NOW);
        expect(next.toISOString()).toBe('2026-01-15T15:00:00.000Z');
    });

    it('throws on an invalid cron expression', () => {
        expect(() => ComputeRoutineNextRunAt('not a cron', 'UTC', NOW)).toThrow();
    });
});

describe('IsRoutineWithinActivationWindow', () => {
    it('is within when StartAt/EndAt are null', () => {
        expect(IsRoutineWithinActivationWindow({ StartAt: null, EndAt: null }, NOW)).toBe(true);
    });

    it('StartAt exactly at now is eligible (StartAt <= now)', () => {
        expect(IsRoutineWithinActivationWindow({ StartAt: new Date(NOW), EndAt: null }, NOW)).toBe(true);
    });

    it('StartAt 1ms in the future is NOT eligible', () => {
        expect(IsRoutineWithinActivationWindow({ StartAt: new Date(NOW.getTime() + 1), EndAt: null }, NOW)).toBe(false);
    });

    it('EndAt exactly at now is NOT eligible (EndAt must be strictly after now)', () => {
        expect(IsRoutineWithinActivationWindow({ StartAt: null, EndAt: new Date(NOW) }, NOW)).toBe(false);
    });

    it('EndAt 1ms in the future is still eligible', () => {
        expect(IsRoutineWithinActivationWindow({ StartAt: null, EndAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
    });
});

describe('IsRoutineDue', () => {
    it('is due when Active, inside the window, and NextRunAt has passed', () => {
        expect(IsRoutineDue(fields(), NOW)).toBe(true);
    });

    it('is due when NextRunAt is within the 1s tolerance ahead of now', () => {
        expect(IsRoutineDue(fields({ NextRunAt: new Date(NOW.getTime() + ROUTINE_DUE_TOLERANCE_MS - 1) }), NOW)).toBe(true);
    });

    it('is NOT due when NextRunAt is beyond the tolerance', () => {
        expect(IsRoutineDue(fields({ NextRunAt: new Date(NOW.getTime() + ROUTINE_DUE_TOLERANCE_MS + 500) }), NOW)).toBe(false);
    });

    it('is NOT due when Status is Paused or Disabled', () => {
        expect(IsRoutineDue(fields({ Status: 'Paused' }), NOW)).toBe(false);
        expect(IsRoutineDue(fields({ Status: 'Disabled' }), NOW)).toBe(false);
    });

    it('is NOT due when NextRunAt is null (seeding candidate, never due)', () => {
        expect(IsRoutineDue(fields({ NextRunAt: null }), NOW)).toBe(false);
    });

    it('is NOT due before StartAt or at/after EndAt', () => {
        expect(IsRoutineDue(fields({ StartAt: new Date(NOW.getTime() + 60_000) }), NOW)).toBe(false);
        expect(IsRoutineDue(fields({ EndAt: new Date(NOW) }), NOW)).toBe(false);
    });
});

describe('RoutineNeedsSeeding', () => {
    it('needs seeding when Active, inside the window, and NextRunAt is null', () => {
        expect(RoutineNeedsSeeding(fields({ NextRunAt: null }), NOW)).toBe(true);
    });

    it('does NOT need seeding when NextRunAt is already set', () => {
        expect(RoutineNeedsSeeding(fields(), NOW)).toBe(false);
    });

    it('does NOT need seeding when Paused or outside the activation window', () => {
        expect(RoutineNeedsSeeding(fields({ NextRunAt: null, Status: 'Paused' }), NOW)).toBe(false);
        expect(RoutineNeedsSeeding(fields({ NextRunAt: null, StartAt: new Date(NOW.getTime() + 1000) }), NOW)).toBe(false);
    });
});

describe('BuildDueRoutineFilter', () => {
    it('narrows to Active routines inside their window that are due or unseeded', () => {
        const filter = BuildDueRoutineFilter(NOW.toISOString());
        expect(filter).toContain(`Status='Active'`);
        expect(filter).toContain(`(StartAt IS NULL OR StartAt <= '${NOW.toISOString()}')`);
        expect(filter).toContain(`(EndAt IS NULL OR EndAt > '${NOW.toISOString()}')`);
        expect(filter).toContain(`(NextRunAt IS NULL OR NextRunAt <= '${NOW.toISOString()}')`);
    });
});

describe('ComputeResultHash', () => {
    it('is deterministic and produces a 64-char hex SHA-256 digest', () => {
        const a = ComputeResultHash('hello world');
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(ComputeResultHash('hello world')).toBe(a);
    });

    it('normalizes whitespace so cosmetic formatting is not a "change"', () => {
        expect(ComputeResultHash('  hello   world \n')).toBe(ComputeResultHash('hello world'));
    });

    it('different content yields different hashes', () => {
        expect(ComputeResultHash('alpha')).not.toBe(ComputeResultHash('beta'));
    });

    it('strips embedded ISO timestamps so per-run execution metadata is not a "change"', () => {
        const runA = '{"result":42,"evaluatedAt":"2026-01-15T12:00:00.123Z"}';
        const runB = '{"result":42,"evaluatedAt":"2026-01-15T13:05:09.456Z"}';
        expect(ComputeResultHash(runA)).toBe(ComputeResultHash(runB));
        // ...but a genuine content change still registers.
        const runC = '{"result":43,"evaluatedAt":"2026-01-15T13:05:09.456Z"}';
        expect(ComputeResultHash(runC)).not.toBe(ComputeResultHash(runA));
    });

    it('null and undefined hash identically to the empty string', () => {
        expect(ComputeResultHash(null)).toBe(ComputeResultHash(''));
        expect(ComputeResultHash(undefined)).toBe(ComputeResultHash(''));
    });
});

describe('EvaluateNotifyCondition — the notify matrix', () => {
    const HASH_A = ComputeResultHash('a');
    const HASH_B = ComputeResultHash('b');

    it('never notifies for non-terminal run statuses, regardless of condition', () => {
        for (const condition of ['Always', 'OnSuccess', 'OnFailure', 'OnChange'] as const) {
            expect(EvaluateNotifyCondition(condition, 'Running', HASH_A, HASH_B)).toBe(false);
            expect(EvaluateNotifyCondition(condition, 'Skipped', HASH_A, HASH_B)).toBe(false);
        }
    });

    it('Always notifies on both Success and Failed', () => {
        expect(EvaluateNotifyCondition('Always', 'Success', HASH_A, HASH_A)).toBe(true);
        expect(EvaluateNotifyCondition('Always', 'Failed', HASH_A, HASH_A)).toBe(true);
    });

    it('OnSuccess notifies only on Success', () => {
        expect(EvaluateNotifyCondition('OnSuccess', 'Success', HASH_A, HASH_A)).toBe(true);
        expect(EvaluateNotifyCondition('OnSuccess', 'Failed', HASH_A, HASH_A)).toBe(false);
    });

    it('OnFailure notifies only on Failed', () => {
        expect(EvaluateNotifyCondition('OnFailure', 'Failed', HASH_A, HASH_A)).toBe(true);
        expect(EvaluateNotifyCondition('OnFailure', 'Success', HASH_A, HASH_A)).toBe(false);
    });

    it('OnChange notifies when the hash differs from the prior hash', () => {
        expect(EvaluateNotifyCondition('OnChange', 'Success', HASH_A, HASH_B)).toBe(true);
        expect(EvaluateNotifyCondition('OnChange', 'Success', HASH_A, HASH_A)).toBe(false);
    });

    it('OnChange treats a null prior hash (first run) as changed', () => {
        expect(EvaluateNotifyCondition('OnChange', 'Success', HASH_A, null)).toBe(true);
    });

    it('OnChange with a null current hash never notifies', () => {
        expect(EvaluateNotifyCondition('OnChange', 'Success', null, HASH_A)).toBe(false);
    });
});

describe('SortRecipientsBySequence', () => {
    it('orders ascending by Sequence and does not mutate the input', () => {
        const input = [
            { ID: 'c', Sequence: 30 },
            { ID: 'a', Sequence: 10 },
            { ID: 'b', Sequence: 20 },
        ];
        const sorted = SortRecipientsBySequence(input);
        expect(sorted.map(r => r.ID)).toEqual(['a', 'b', 'c']);
        expect(input.map(r => r.ID)).toEqual(['c', 'a', 'b']); // untouched
    });

    it('preserves input order for equal Sequence values (stable)', () => {
        const input = [
            { ID: 'first', Sequence: 0 },
            { ID: 'second', Sequence: 0 },
            { ID: 'third', Sequence: 0 },
        ];
        expect(SortRecipientsBySequence(input).map(r => r.ID)).toEqual(['first', 'second', 'third']);
    });
});

describe('RunWithBoundedConcurrency', () => {
    it('returns results in input order', async () => {
        const results = await RunWithBoundedConcurrency([3, 1, 2], 2, async (n) => {
            await new Promise(r => setTimeout(r, n * 5));
            return n * 10;
        });
        expect(results).toEqual([30, 10, 20]);
    });

    it('never exceeds the concurrency limit', async () => {
        let inFlight = 0;
        let peak = 0;
        await RunWithBoundedConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise(r => setTimeout(r, 5));
            inFlight--;
        });
        expect(peak).toBeLessThanOrEqual(3);
        expect(peak).toBeGreaterThan(1); // it did actually parallelize
    });

    it('handles an empty item list and a limit larger than the list', async () => {
        expect(await RunWithBoundedConcurrency([], 3, async () => 1)).toEqual([]);
        expect(await RunWithBoundedConcurrency([1, 2], 50, async (n) => n)).toEqual([1, 2]);
    });

    it('clamps a nonsensical limit to 1 instead of stalling', async () => {
        const results = await RunWithBoundedConcurrency([1, 2, 3], 0, async (n) => n + 1);
        expect(results).toEqual([2, 3, 4]);
    });
});
