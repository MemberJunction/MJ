/**
 * The User Routine Dispatcher's notification: counts come only from number-valued run details.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatusEx: vi.fn() };
});
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } } }));

import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';
import { TestContext, TestScheduledJob } from './helpers/scheduling-doubles';

describe('UserRoutineDispatcherDriver notification', () => {
    const context = TestContext(new TestScheduledJob({ Name: 'Dispatcher' }));

    it('reports only the numeric counters and drops values of another type', () => {
        const n = new UserRoutineDispatcherDriver().FormatNotification(context, {
            Success: true,
            Details: { RoutinesEvaluated: 3, RoutinesRun: 2, Succeeded: 1, Failed: '1', RoutinesSeeded: 0, Notified: 1 },
        });
        expect(n.Subject).toBe('User Routine Dispatcher: 2 routine(s) executed');
        expect(n.Body).toContain('(1 succeeded, 0 failed)');
        expect(n.Priority).toBe('Low');
        expect(n.Metadata).toEqual({ RoutinesEvaluated: 3, RoutinesRun: 2, Succeeded: 1, RoutinesSeeded: 0, Notified: 1 });
    });
});
