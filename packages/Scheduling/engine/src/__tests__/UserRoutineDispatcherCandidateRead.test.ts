/**
 * The dispatcher's due-routine read puts the current time in its filter, so a cached read would
 * mint a new, never-read cache entry on every tick (#5260). It must bypass the cache.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } } }));

import { RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';

type Driver = UserRoutineDispatcherDriver & {
    loadCandidateRoutines(contextUser: UserInfo, now: Date): Promise<unknown[]>;
};

const emptyResult: RunViewResult = {
    Success: true, Results: [], TotalRowCount: 0, RowCount: 0, ExecutionTime: 0, UserViewRunID: '', ErrorMessage: '',
};

describe('UserRoutineDispatcherDriver — due-routine read', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('bypasses the cache, since the per-tick timestamp would mint a key per tick', async () => {
        const runView = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(emptyResult);
        const driver = new UserRoutineDispatcherDriver() as Driver;

        await driver.loadCandidateRoutines({ ID: 'SYS' } as UserInfo, new Date('2026-11-02T12:00:00Z'));

        expect(runView).toHaveBeenCalledTimes(1);
        const params = runView.mock.calls[0][0] as RunViewParams;
        expect(params.EntityName).toBe('MJ: User Routines');
        expect(params.ExtraFilter).toContain('2026-11-02T12:00:00');
        expect(params.BypassCache).toBe(true);
    });
});
