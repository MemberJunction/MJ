/**
 * `RunRoutineNow` — a manual run of a routine that leaves its schedule alone.
 *
 * The sweep path claims a routine first (advancing NextRunAt, or nulling it for a one-shot) and
 * only then runs it, so "Wake Now" implemented as "set NextRunAt to now" spends a one-shot: the
 * reminder a user wanted tomorrow at 10 fires today and is then Disabled. A manual run must not
 * go through the claim at all, and must not be skipped by the wake gate the user is trying to
 * bypass; the post-run bookkeeping then sees NextRunAt still set and keeps the routine Active.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    Metadata: vi.fn().mockImplementation(() => ({ GetEntityObject: vi.fn(), Provider: {} })),
}));
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } } }));

import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';

type Driver = UserRoutineDispatcherDriver & {
    createRunRow(routine: unknown, user: unknown): Promise<unknown>;
    runAndRecord(routine: unknown, run: unknown, context: unknown): Promise<unknown>;
    updateRoutineAfterRun(routine: unknown, run: unknown): Promise<void>;
    claimRoutine(routine: unknown, now: Date): Promise<boolean>;
    wakeGateEvaluator: { Evaluate: ReturnType<typeof vi.fn> };
    logError(...args: unknown[]): void;
    log(...args: unknown[]): void;
};

const SYSTEM = { ID: 'SYS', Type: 'Owner' };
const TOMORROW = new Date('2026-10-30T15:00:00Z');

function makeOneShot(overrides: Record<string, unknown> = {}) {
    const saves: Array<{ Status: unknown; NextRunAt: unknown }> = [];
    const routine: Record<string, unknown> = {
        ID: 'R-1', Name: 'Chief of Staff — Wake (reminder-call-amith)', UserID: 'OWNER',
        RoutineType: 'AgentWake', ScheduleMode: 'OneShot', CronExpression: null,
        Status: 'Active', NextRunAt: TOMORROW, LastRunAt: null, LastRunStatus: null, LastResultHash: null,
        WakeConfiguration: '{"workstreamKey":"reminder-call-amith","wakeGate":{"skipIfUnchanged":true}}',
        WakeConfigurationObject: null,
        Save: async () => { saves.push({ Status: routine.Status, NextRunAt: routine.NextRunAt }); return true; },
        ...overrides,
    };
    return { routine, saves };
}

function makeRun() {
    return {
        ID: 'RUN-1', Status: 'Success', StartedAt: new Date(), CompletedAt: new Date(), ResultHash: 'h',
        GetFieldByName: () => ({ OldValue: 'Success' }),
        Save: async () => true,
    };
}

describe('UserRoutineDispatcherDriver.RunRoutineNow', () => {
    let driver: Driver;

    beforeEach(() => {
        driver = new UserRoutineDispatcherDriver() as Driver;
        driver.logError = vi.fn();
        driver.log = vi.fn();
        driver.claimRoutine = vi.fn(async () => true);
        driver.wakeGateEvaluator = { Evaluate: vi.fn(async () => ({ shouldWake: false, decidedByTier: 'Tier0', reason: 'unchanged' })) };
    });

    it('runs the routine without claiming it, so a one-shot keeps its scheduled time and stays Active', async () => {
        const { routine, saves } = makeOneShot();
        const run = makeRun();
        driver.createRunRow = vi.fn(async () => run);
        driver.runAndRecord = vi.fn(async (r, runRow) => {
            await driver.updateRoutineAfterRun(r, runRow);
            return { RoutineID: 'R-1', RunStatus: 'Success', Notified: false };
        });

        const summary = await driver.RunRoutineNow(routine as never, SYSTEM as never);

        expect(summary.RunStatus).toBe('Success');
        expect(driver.claimRoutine).not.toHaveBeenCalled();
        expect(routine.NextRunAt, 'the scheduled time survives the manual run').toBe(TOMORROW);
        expect(routine.Status, 'a one-shot with a future wake is not spent by running it early').toBe('Active');
        expect(saves.every((s) => s.NextRunAt === TOMORROW)).toBe(true);
    });

    it('bypasses the wake gate: the person asked for the run, so "nothing changed" is not a reason to skip', async () => {
        const { routine } = makeOneShot();
        driver.createRunRow = vi.fn(async () => makeRun());
        driver.runAndRecord = vi.fn(async () => ({ RoutineID: 'R-1', RunStatus: 'Success', Notified: false }));

        const summary = await driver.RunRoutineNow(routine as never, SYSTEM as never);

        expect(driver.wakeGateEvaluator.Evaluate).not.toHaveBeenCalled();
        expect(summary.RunStatus).toBe('Success');
        expect(driver.createRunRow).toHaveBeenCalledWith(routine, SYSTEM);
    });

    it('the sweep path still honours the wake gate (only the manual path bypasses it)', async () => {
        const { routine } = makeOneShot();
        const exec = driver as unknown as { executeRoutine(r: unknown, c: unknown): Promise<{ RunStatus: string }> };

        const summary = await exec.executeRoutine(routine, { ContextUser: SYSTEM });

        expect(driver.wakeGateEvaluator.Evaluate).toHaveBeenCalledTimes(1);
        expect(summary.RunStatus).toBe('Skipped');
    });

    it('a spent one-shot run by hand stays spent: no scheduled time is invented for it', async () => {
        const { routine } = makeOneShot({ Status: 'Disabled', NextRunAt: null, LastRunAt: new Date('2026-10-29T15:34:05Z') });
        const run = makeRun();
        driver.createRunRow = vi.fn(async () => run);
        driver.runAndRecord = vi.fn(async (r, runRow) => {
            await driver.updateRoutineAfterRun(r, runRow);
            return { RoutineID: 'R-1', RunStatus: 'Success', Notified: false };
        });

        await driver.RunRoutineNow(routine as never, SYSTEM as never);

        expect(routine.NextRunAt).toBeNull();
        expect(routine.Status).toBe('Disabled');
    });
});
