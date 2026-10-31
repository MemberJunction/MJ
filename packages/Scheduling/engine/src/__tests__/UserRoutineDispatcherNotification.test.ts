import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendNotificationParams } from '@memberjunction/notifications';

/**
 * The in-app notification a routine run produces must point at where the run's output lives.
 * A wake writes its reply into the routine's own conversation, which the main chat list hides,
 * so a notification that names only the routine and the run leaves the user with nothing to
 * click. It now carries the routine's ConversationID when the routine has one.
 */

const sendNotification = vi.fn();
const config = vi.fn();

vi.mock('@memberjunction/notifications', () => ({
    NotificationEngine: {
        get Instance() {
            return { Config: config, SendNotification: sendNotification };
        },
    },
}));
vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    Metadata: vi.fn().mockImplementation(() => ({ GetEntityObject: vi.fn(), Provider: {} })),
}));
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } } }));

import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';
import type { UserInfo } from '@memberjunction/core';
import type { MJUserRoutineEntity, MJUserRoutineRunEntity } from '@memberjunction/core-entities';

type DeliverInApp = (
    userId: string, title: string, message: string,
    routine: MJUserRoutineEntity, run: MJUserRoutineRunEntity, contextUser: UserInfo
) => Promise<boolean>;

function driver(): UserRoutineDispatcherDriver {
    const d = Object.create(UserRoutineDispatcherDriver.prototype) as UserRoutineDispatcherDriver;
    (d as unknown as Record<string, unknown>)['log'] = vi.fn();
    (d as unknown as Record<string, unknown>)['logError'] = vi.fn();
    return d;
}

const sent = (): SendNotificationParams => sendNotification.mock.calls[0][0];
const user = { ID: 'user-1' } as UserInfo;

describe('UserRoutineDispatcherDriver — the run notification points at the run output', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.mockResolvedValue(undefined);
        sendNotification.mockResolvedValue({ success: true, deliveryChannels: { inApp: true, email: false, sms: false } });
    });

    it('carries the routine conversation so the notification can open the reply', async () => {
        const deliver = (driver() as unknown as Record<string, DeliverInApp>)['deliverInApp'];
        const routine = { ID: 'R1', Name: 'Chief of Staff — Wake (default)', ConversationID: 'C1' } as MJUserRoutineEntity;
        const run = { ID: 'RUN1' } as MJUserRoutineRunEntity;

        await deliver.call(driver(), 'user-1', 'done', 'ok', routine, run, user);

        expect(sent().resourceConfiguration).toEqual({ type: 'UserRoutine', routineId: 'R1', runId: 'RUN1', conversationId: 'C1' });
    });

    it('names only the routine and the run when the routine has no conversation', async () => {
        const deliver = (driver() as unknown as Record<string, DeliverInApp>)['deliverInApp'];
        const routine = { ID: 'R1', Name: 'Nightly', ConversationID: null } as MJUserRoutineEntity;
        const run = { ID: 'RUN1' } as MJUserRoutineRunEntity;

        await deliver.call(driver(), 'user-1', 'done', 'ok', routine, run, user);

        expect(sent().resourceConfiguration).toEqual({ type: 'UserRoutine', routineId: 'R1', runId: 'RUN1' });
    });
});
