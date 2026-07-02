/**
 * Unit tests for `MJUserRoutineEntityServer` — the server-side UserRoutine gate:
 *   - Validate(): rejects invalid cron expressions, cron/timezone combos that cannot compute
 *     a next occurrence, and a TargetType without a TargetID; enforces the ownership defense
 *     (non-Owner-type users may only save routines they own, compared against the PRE-save owner).
 *   - Save(): defaults UserID to the context user on first save; recomputes NextRunAt when the
 *     schedule inputs changed or NextRunAt was never computed — but ALWAYS respects an
 *     explicitly-set (dirty) NextRunAt (the dispatcher's claim path).
 *
 * The heavy generated base (`MJUserRoutineEntity`) is mocked to a settable stub with
 * configurable per-field Dirty/OldValue state; `@memberjunction/scheduling-engine` is mocked
 * with lightweight fakes that emulate the cron helper CONTRACT (sentinel 'BAD CRON' /
 * 'Bad/Zone' inputs fail) — real cron behavior is covered by the scheduling-engine package's
 * own UserRoutineProcessor tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/global';

// Neutralize the class-factory registration decorator; keep UUIDsEqual real.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual };
});

// Contract-level fakes for the cron helper — sentinel inputs fail, everything else computes
// a deterministic next occurrence that respects the StartAt floor.
vi.mock('@memberjunction/scheduling-engine', () => ({
    CronExpressionHelper: {
        ValidateExpression: (expr: string): ValidationResult => {
            const r = new ValidationResult();
            if (expr === 'BAD CRON' || !expr) {
                r.Success = false;
                r.Errors.push({
                    Source: 'CronExpression',
                    Message: 'Invalid cron expression',
                    Value: expr,
                    Type: 'Failure',
                } as ValidationResult['Errors'][number]);
            } else {
                r.Success = true;
            }
            return r;
        },
    },
    ComputeRoutineNextRunAt: (expr: string, tz: string, from: Date, startAt?: Date | null): Date => {
        if (expr === 'BAD CRON') throw new Error('Invalid cron expression');
        if (tz === 'Bad/Zone') throw new Error('Invalid timezone');
        const base = startAt != null && startAt.getTime() > from.getTime() ? startAt : from;
        return new Date(base.getTime() + 3_600_000); // "next hour" — deterministic stand-in
    },
}));

interface FieldState {
    Dirty?: boolean;
    OldValue?: unknown;
}

// Settable base standing in for the generated `MJUserRoutineEntity`, with configurable
// per-field Dirty/OldValue state so the subclass's GetFieldByName-driven logic is testable.
vi.mock('@memberjunction/core-entities', () => {
    class MockMJUserRoutineEntity {
        public UserID: string | null = null;
        public CronExpression = '0 0 * * * *';
        public Timezone = 'UTC';
        public StartAt: Date | null = null;
        public EndAt: Date | null = null;
        public TargetType: string | null = 'Action';
        public TargetID: string | null = 'AAAAAAAA-0000-0000-0000-000000000001';
        public NextRunAt: Date | null = null;
        public IsSaved = false;
        public ContextCurrentUser: { ID: string; Type: string | null } | null = null;
        public SuperSaveCalled = false;
        private fieldState: Record<string, FieldState> = {};
        public SetFieldState(name: string, state: FieldState): void {
            this.fieldState[name] = state;
        }
        public GetFieldByName(name: string): FieldState {
            return this.fieldState[name] ?? { Dirty: false, OldValue: null };
        }
        public Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }
        public async Save(): Promise<boolean> {
            this.SuperSaveCalled = true;
            return true;
        }
    }
    return { MJUserRoutineEntity: MockMJUserRoutineEntity };
});

import { MJUserRoutineEntityServer } from '../custom/MJUserRoutineEntityServer.server';

/** The mock base's extra test hooks, layered over the subclass's typed surface. */
interface MockHooks {
    IsSaved: boolean;
    ContextCurrentUser: { ID: string; Type: string | null } | null;
    SuperSaveCalled: boolean;
    TargetID: string | null;
    SetFieldState(name: string, state: FieldState): void;
}

function makeEntity(): MJUserRoutineEntityServer & MockHooks {
    return new MJUserRoutineEntityServer() as MJUserRoutineEntityServer & MockHooks;
}

describe('MJUserRoutineEntityServer.Validate', () => {
    it('rejects an invalid cron expression', () => {
        const e = makeEntity();
        e.CronExpression = 'BAD CRON';
        const result = e.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(err => err.Source === 'CronExpression')).toBe(true);
    });

    it('rejects a valid cron with a timezone that cannot compute a next occurrence', () => {
        const e = makeEntity();
        e.Timezone = 'Bad/Zone';
        const result = e.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(err => err.Source === 'CronExpression' && err.Message.includes('Bad/Zone'))).toBe(true);
    });

    it('rejects a TargetType without a TargetID', () => {
        const e = makeEntity();
        e.TargetID = null;
        const result = e.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(err => err.Source === 'TargetID')).toBe(true);
    });

    it('passes for a valid schedule + target', () => {
        const e = makeEntity();
        expect(e.Validate().Success).toBe(true);
    });

    describe('ownership defense', () => {
        it('blocks a non-Owner-type user from saving a routine they do not own', () => {
            const e = makeEntity();
            e.UserID = 'AAAAAAAA-0000-0000-0000-00000000000A'; // someone else's routine
            e.ContextCurrentUser = { ID: 'BBBBBBBB-0000-0000-0000-00000000000B', Type: 'User' };
            const result = e.Validate();
            expect(result.Success).toBe(false);
            expect(result.Errors.some(err => err.Source === 'UserID')).toBe(true);
        });

        it('compares against the PRE-save owner — reassigning UserID cannot bypass the gate', () => {
            const e = makeEntity();
            e.UserID = 'BBBBBBBB-0000-0000-0000-00000000000B'; // attacker sets themselves as owner
            e.SetFieldState('UserID', { Dirty: true, OldValue: 'AAAAAAAA-0000-0000-0000-00000000000A' });
            e.ContextCurrentUser = { ID: 'BBBBBBBB-0000-0000-0000-00000000000B', Type: 'User' };
            const result = e.Validate();
            expect(result.Success).toBe(false);
            expect(result.Errors.some(err => err.Source === 'UserID')).toBe(true);
        });

        it('allows the owner to save their own routine (case-insensitive UUID comparison)', () => {
            const e = makeEntity();
            e.UserID = 'aaaaaaaa-0000-0000-0000-00000000000a';
            e.ContextCurrentUser = { ID: 'AAAAAAAA-0000-0000-0000-00000000000A', Type: 'User' };
            expect(e.Validate().Success).toBe(true);
        });

        it('exempts Owner-type users (admins + the scheduler system user)', () => {
            const e = makeEntity();
            e.UserID = 'AAAAAAAA-0000-0000-0000-00000000000A';
            e.ContextCurrentUser = { ID: 'BBBBBBBB-0000-0000-0000-00000000000B', Type: 'Owner' };
            expect(e.Validate().Success).toBe(true);
        });

        it('skips the gate when there is no context user (system path)', () => {
            const e = makeEntity();
            e.UserID = 'AAAAAAAA-0000-0000-0000-00000000000A';
            e.ContextCurrentUser = null;
            expect(e.Validate().Success).toBe(true);
        });
    });
});

describe('MJUserRoutineEntityServer.Save', () => {
    it('defaults UserID to the context user on first save when unset', async () => {
        const e = makeEntity();
        e.IsSaved = false;
        e.ContextCurrentUser = { ID: 'CCCCCCCC-0000-0000-0000-00000000000C', Type: 'User' };
        await e.Save();
        expect(e.UserID).toBe('CCCCCCCC-0000-0000-0000-00000000000C');
        expect(e.SuperSaveCalled).toBe(true);
    });

    it('computes NextRunAt when it was never set', async () => {
        const e = makeEntity();
        e.NextRunAt = null;
        const before = Date.now();
        await e.Save();
        expect(e.NextRunAt).not.toBeNull();
        expect(e.NextRunAt!.getTime()).toBeGreaterThan(before);
    });

    it('recomputes NextRunAt when a schedule field is dirty', async () => {
        const e = makeEntity();
        const stale = new Date('2020-01-01T00:00:00.000Z');
        e.NextRunAt = stale;
        e.SetFieldState('CronExpression', { Dirty: true, OldValue: '0 0 0 * * *' });
        await e.Save();
        expect(e.NextRunAt!.getTime()).not.toBe(stale.getTime());
    });

    it('respects the StartAt floor when recomputing', async () => {
        const e = makeEntity();
        e.NextRunAt = null;
        e.StartAt = new Date(Date.now() + 7 * 24 * 3_600_000); // window opens in a week
        await e.Save();
        expect(e.NextRunAt!.getTime()).toBeGreaterThanOrEqual(e.StartAt.getTime());
    });

    it('NEVER overrides an explicitly-set (dirty) NextRunAt — the dispatcher claim path', async () => {
        const e = makeEntity();
        const explicit = new Date('2020-01-01T00:00:00.000Z');
        e.NextRunAt = explicit;
        e.SetFieldState('NextRunAt', { Dirty: true, OldValue: null });
        e.SetFieldState('CronExpression', { Dirty: true, OldValue: 'x' }); // even with the schedule dirty
        await e.Save();
        expect(e.NextRunAt!.getTime()).toBe(explicit.getTime());
    });

    it('leaves NextRunAt untouched when nothing schedule-related changed', async () => {
        const e = makeEntity();
        const existing = new Date('2030-06-01T00:00:00.000Z');
        e.NextRunAt = existing;
        await e.Save();
        expect(e.NextRunAt!.getTime()).toBe(existing.getTime());
    });

    it('leaves NextRunAt null (and still saves) when the cron helper throws — Validate() owns the rejection', async () => {
        const e = makeEntity();
        e.CronExpression = 'BAD CRON';
        e.NextRunAt = null;
        await e.Save();
        expect(e.NextRunAt).toBeNull();
        expect(e.SuperSaveCalled).toBe(true);
    });
});
