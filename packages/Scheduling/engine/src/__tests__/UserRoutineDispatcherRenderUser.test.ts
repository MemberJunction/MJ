/**
 * The routine notification renders as the routine's user. The template engine is a process-wide
 * singleton, so a render that names no user would act for whoever last configured it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
}));
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } } }));

import { UserInfo } from '@memberjunction/core';
import { TemplateEngineServer } from '@memberjunction/templates';
import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';

afterEach(() => vi.restoreAllMocks());

describe('UserRoutineDispatcherDriver: notification render user', () => {
    it('REGRESSION: renders the notification as the routine user', async () => {
        const routineUser = new UserInfo(null, { ID: 'routine-user', Name: 'Routine User', Email: 'r@test.com', IsActive: true });
        const content = { ID: 'content-1', TemplateText: 'x' };
        const template = { GetHighestPriorityContent: () => content };
        const driver = new UserRoutineDispatcherDriver();
        vi.spyOn(driver as unknown as { resolveNotificationTemplate: () => object }, 'resolveNotificationTemplate').mockReturnValue(template);
        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        const render = vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplate').mockResolvedValue({ Success: true, Output: 'rendered', Message: undefined });
        const routine = { Name: 'R', GetAll: () => ({ Name: 'R' }) };
        const run = { Status: 'Success', ResultSummary: 'done', CompletedAt: new Date(0), GetAll: () => ({ Status: 'Success' }) };

        const renderMessage = (driver as unknown as {
            renderNotificationMessage: (r: object, u: object, c: UserInfo) => Promise<string>;
        }).renderNotificationMessage.bind(driver);
        const output = await renderMessage(routine, run, routineUser);

        expect(output).toBe('rendered');
        expect(render.mock.calls[0][5]).toEqual({ ContextUser: routineUser });
    });
});
