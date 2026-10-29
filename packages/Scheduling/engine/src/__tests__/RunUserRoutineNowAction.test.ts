/**
 * `Run User Routine Now` — the action a "Wake Now" button calls. It loads the routine as the caller,
 * refuses routines the caller does not own (unless they are an Owner-type user), and hands the
 * routine to the dispatcher's manual-run path under the scheduler's system user so the bookkeeping
 * matches a scheduled run. It never sets NextRunAt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class { },
    ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } },
}));
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));

const { pollingUser } = vi.hoisted(() => ({ pollingUser: { value: undefined as unknown } }));
vi.mock('../ScheduledJobEngine', () => ({
    SchedulingEngine: { get Instance() { return { get PollingContextUser() { return pollingUser.value; } }; } },
}));

const { runNow } = vi.hoisted(() => ({ runNow: vi.fn(async () => ({ RoutineID: 'R-1', RunStatus: 'Success', Notified: false })) }));
vi.mock('../drivers/UserRoutineDispatcherDriver', () => ({
    UserRoutineDispatcherDriver: class { RunRoutineNow = runNow; },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    LogError: vi.fn(),
}));

import { RunUserRoutineNowAction } from '../actions/RunUserRoutineNowAction';

const OWNER = { ID: 'AAAAAAAA-0000-0000-0000-00000000000A', Type: 'User' };
const OTHER = { ID: 'BBBBBBBB-0000-0000-0000-00000000000B', Type: 'User' };
const ADMIN = { ID: 'CCCCCCCC-0000-0000-0000-00000000000C', Type: 'Owner' };
const SYSTEM = { ID: 'SYS', Type: 'Owner' };
const TOMORROW = new Date('2026-10-30T15:00:00Z');

interface Harness { action: { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode?: string; Message: string }> }; routine: Record<string, unknown> }

function makeHarness(exists = true): Harness {
    const routine: Record<string, unknown> = {
        ID: 'R-1', Name: 'Chief of Staff — Wake (reminder-call-amith)', UserID: OWNER.ID.toLowerCase(),
        ScheduleMode: 'OneShot', Status: 'Active', NextRunAt: TOMORROW,
        Load: vi.fn(async () => exists),
    };
    const provider = { GetEntityObject: vi.fn(async () => routine) };
    const action = new RunUserRoutineNowAction() as unknown as Harness['action'];
    return { action, routine, ...( { provider } as object ) } as Harness & { provider: typeof provider };
}

function params(user: unknown, routineID: string | null, provider: unknown): RunActionParams {
    return {
        ContextUser: user,
        Provider: provider,
        Params: routineID === null ? [] : [{ Name: 'RoutineID', Type: 'Input', Value: routineID }],
    } as unknown as RunActionParams;
}

describe('RunUserRoutineNowAction', () => {
    beforeEach(() => { runNow.mockClear(); pollingUser.value = SYSTEM; });

    it('runs an owned routine under the scheduler system user and leaves NextRunAt alone', async () => {
        const h = makeHarness() as Harness & { provider: unknown };
        const result = await h.action.InternalRunAction(params(OWNER, 'R-1', h.provider));
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(runNow).toHaveBeenCalledTimes(1);
        expect(runNow.mock.calls[0][0]).toBe(h.routine);
        expect(runNow.mock.calls[0][1]).toBe(SYSTEM);
        expect(h.routine.NextRunAt).toBe(TOMORROW);
        expect(result.Message).toContain('unchanged');
    });

    it('refuses a routine the caller does not own', async () => {
        const h = makeHarness() as Harness & { provider: unknown };
        const result = await h.action.InternalRunAction(params(OTHER, 'R-1', h.provider));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('NOT_OWNER');
        expect(runNow).not.toHaveBeenCalled();
    });

    it('lets an Owner-type user run anyone\'s routine', async () => {
        const h = makeHarness() as Harness & { provider: unknown };
        const result = await h.action.InternalRunAction(params(ADMIN, 'R-1', h.provider));
        expect(result.Success).toBe(true);
        expect(runNow).toHaveBeenCalledTimes(1);
    });

    it('falls back to the caller as bookkeeping user when no engine is polling in this process', async () => {
        pollingUser.value = undefined;
        const h = makeHarness() as Harness & { provider: unknown };
        await h.action.InternalRunAction(params(OWNER, 'R-1', h.provider));
        expect(runNow.mock.calls[0][1]).toBe(OWNER);
    });

    it('returns ROUTINE_NOT_FOUND instead of throwing when the caller cannot read the routine', async () => {
        const h = makeHarness() as Harness & { provider: unknown };
        (h.routine.Load as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('User: X does not have read permissions on MJ: User Routines'));
        const result = await h.action.InternalRunAction(params(OTHER, 'R-1', h.provider));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('ROUTINE_NOT_FOUND');
        expect(runNow).not.toHaveBeenCalled();
    });

    it('reports a missing RoutineID and an unknown routine without starting anything', async () => {
        const h = makeHarness(false) as Harness & { provider: unknown };
        const missing = await h.action.InternalRunAction(params(OWNER, null, h.provider));
        expect(missing.ResultCode).toBe('MISSING_PARAMETER');
        const unknown = await h.action.InternalRunAction(params(OWNER, 'nope', h.provider));
        expect(unknown.ResultCode).toBe('ROUTINE_NOT_FOUND');
        expect(runNow).not.toHaveBeenCalled();
    });
});
