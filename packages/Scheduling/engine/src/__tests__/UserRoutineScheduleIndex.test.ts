/**
 * #6217: the in-memory routine index the User Routine Dispatcher gates on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loads } = vi.hoisted(() => ({ loads: [] as Array<{ forceRefresh: boolean | undefined }> }));

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class {
        protected async Load(_configs: unknown[], _provider: unknown, forceRefresh?: boolean): Promise<void> {
            loads.push({ forceRefresh });
        }
        protected async HandleIndividualBaseEntityEvent(): Promise<boolean> {
            return true;
        }
        protected async OnExternalCacheChange(): Promise<void> {
            // no-op
        }
        static getInstance<T>(): T {
            return new (this as unknown as new () => T)();
        }
    },
    UserInfo: class {},
    IMetadataProvider: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({ MJUserRoutineEntity: class {} }));

import { UserRoutineScheduleIndex } from '../UserRoutineScheduleIndex';
import type { UserRoutineScheduleFields } from '../UserRoutineProcessor';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

function routine(overrides: Partial<UserRoutineScheduleFields>): UserRoutineScheduleFields {
    return {
        Status: 'Active',
        CronExpression: '0 0 * * * *',
        Timezone: 'UTC',
        StartAt: null,
        EndAt: null,
        NextRunAt: null,
        ScheduleMode: 'Recurring',
        ...overrides,
    };
}

type Internals = { _routines: UserRoutineScheduleFields[] };

describe('UserRoutineScheduleIndex.RoutineDueAtMs', () => {
    const due = (r: UserRoutineScheduleFields) => UserRoutineScheduleIndex.RoutineDueAtMs(r, NOW);

    it('is the routine NextRunAt', () => {
        expect(due(routine({ NextRunAt: at(10) }))).toBe(at(10).getTime());
    });

    it('is now for a routine that needs seeding', () => {
        expect(due(routine({ NextRunAt: null }))).toBe(NOW.getTime());
    });

    it('is the window start for an unseeded routine whose window opens later', () => {
        expect(due(routine({ NextRunAt: null, StartAt: at(30) }))).toBe(at(30).getTime());
    });

    it('is the window start when NextRunAt falls before it', () => {
        expect(due(routine({ NextRunAt: at(5), StartAt: at(20) }))).toBe(at(20).getTime());
    });

    it('is never for an inactive routine or one whose window closes first', () => {
        expect(due(routine({ Status: 'Paused', NextRunAt: at(5) }))).toBeNull();
        expect(due(routine({ NextRunAt: at(5), EndAt: at(5) }))).toBeNull();
        expect(due(routine({ NextRunAt: null, EndAt: at(-1) }))).toBeNull();
    });

    it('reads string dates from a serialized cache payload', () => {
        const fromCache = routine({ NextRunAt: at(10).toISOString() as unknown as Date });
        expect(due(fromCache)).toBe(at(10).getTime());
    });

    it('treats a one-shot routine with no schedule as never needing seeding', () => {
        expect(due(routine({ ScheduleMode: 'OneShot', CronExpression: null, NextRunAt: null }))).toBeNull();
    });
});

describe('UserRoutineScheduleIndex', () => {
    let index: UserRoutineScheduleIndex;
    const user = {} as UserInfo;
    const provider = {} as IMetadataProvider;

    beforeEach(() => {
        loads.length = 0;
        index = UserRoutineScheduleIndex.Instance;
    });

    it('answers the earliest due routine, or null when none is due', async () => {
        await index.Config(false, user, provider);
        (index as unknown as Internals)._routines = [
            routine({ NextRunAt: at(45) }),
            routine({ NextRunAt: at(15) }),
            routine({ Status: 'Disabled', NextRunAt: at(1) }),
        ];
        expect(index.NextDueAt(NOW)?.getTime()).toBe(at(15).getTime());

        (index as unknown as Internals)._routines = [routine({ Status: 'Disabled', NextRunAt: at(1) })];
        expect(index.NextDueAt(NOW)).toBeNull();
    });

    it('loads once, then re-reads only when older than the refresh age', async () => {
        const changes: number[] = [];
        const sub = index.Changed$.subscribe(() => changes.push(1));
        const t0 = Date.now();
        await index.EnsureFresh(user, provider, 60 * 60_000, t0);
        expect(index.IsLoaded).toBe(true);
        expect(loads).toEqual([{ forceRefresh: false }]);

        await index.EnsureFresh(user, provider, 60 * 60_000, t0 + 30 * 60_000);
        expect(loads).toHaveLength(1);

        // a timer waking on the hour re-reads, despite arriving a few ms early
        await index.EnsureFresh(user, provider, 60 * 60_000, t0 + 60 * 60_000 - 50);
        expect(loads).toEqual([{ forceRefresh: false }, { forceRefresh: true }]);
        expect(changes).toHaveLength(2);
        sub.unsubscribe();
    });
});
