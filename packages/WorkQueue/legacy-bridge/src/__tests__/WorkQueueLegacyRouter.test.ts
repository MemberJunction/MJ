import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const engine = vi.hoisted(() => ({
    Config: vi.fn(async () => undefined),
    GetTopicByName: vi.fn(),
    SubscriptionsForTopic: vi.fn((): { Status: string }[] => []),
    PublishAs: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn() }));
vi.mock('@memberjunction/work-queue-engine', () => ({ WorkQueueEngine: { get Instance() { return engine; } } }));

import { LogError, LogStatus } from '@memberjunction/core';
import { WorkQueueLegacyRouter } from '../WorkQueueLegacyRouter';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const TOPIC_ID = '9061A227-6CC2-4AE0-8E5D-F9963F11A68D';
const router = new WorkQueueLegacyRouter();

function activeTopic(): void {
    engine.GetTopicByName.mockReturnValue({ ID: TOPIC_ID, Name: 'mjqueue.entity-ai-action', Status: 'Active' });
    engine.SubscriptionsForTopic.mockReturnValue([{ Status: 'Active' }]);
}

beforeEach(() => {
    vi.clearAllMocks();
    engine.Config.mockResolvedValue(undefined);
    engine.GetTopicByName.mockReturnValue(undefined);
    engine.SubscriptionsForTopic.mockReturnValue([]);
});

describe('WorkQueueLegacyRouter.TryRoute', () => {
    it('does not route when work-queue metadata cannot be loaded', async () => {
        engine.Config.mockRejectedValue(new Error('Entity MJ: Work Queue Topics not found'));
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(false);
        expect(engine.PublishAs).not.toHaveBeenCalled();
        expect(LogStatus).toHaveBeenCalled();
    });

    it('does not route when no topic exists for the queue type', async () => {
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(false);
        expect(engine.GetTopicByName).toHaveBeenCalledWith('mjqueue.entity-ai-action');
    });

    it('does not route to a disabled topic', async () => {
        engine.GetTopicByName.mockReturnValue({ ID: TOPIC_ID, Status: 'Disabled' });
        engine.SubscriptionsForTopic.mockReturnValue([{ Status: 'Active' }]);
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(false);
    });

    it('does not route when the active topic has no delivering subscription', async () => {
        engine.GetTopicByName.mockReturnValue({ ID: TOPIC_ID, Status: 'Active' });
        engine.SubscriptionsForTopic.mockReturnValue([{ Status: 'Disabled' }]);
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(false);
        expect(engine.SubscriptionsForTopic).toHaveBeenCalledWith(TOPIC_ID);
        expect(engine.PublishAs).not.toHaveBeenCalled();
        expect(LogStatus).toHaveBeenCalled();
    });

    it('treats a Paused subscription as delivering', async () => {
        engine.GetTopicByName.mockReturnValue({ ID: TOPIC_ID, Status: 'Active' });
        engine.SubscriptionsForTopic.mockReturnValue([{ Status: 'Paused' }]);
        engine.PublishAs.mockResolvedValue([{ MessageID: 'm-1', Status: 'Accepted' }]);
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(true);
    });

    it('publishes the payload with the enqueuing user and reports routed when accepted', async () => {
        activeTopic();
        engine.PublishAs.mockResolvedValue([{ MessageID: 'm-1', Status: 'Accepted' }]);

        const routed = await router.TryRoute(' Entity AI Action ', { kind: 'x' }, { priority: 2 }, USER);

        expect(routed).toBe(true);
        expect(engine.PublishAs).toHaveBeenCalledWith(
            'mjqueue.entity-ai-action',
            [{
                Payload: { queueTypeName: ' Entity AI Action ', data: { kind: 'x' }, options: { priority: 2 }, userID: 'user-1' },
                Attributes: { queueType: 'entity-ai-action' },
            }],
            { ContextUser: USER },
        );
    });

    it('treats a duplicate publish as routed', async () => {
        activeTopic();
        engine.PublishAs.mockResolvedValue([{ MessageID: 'm-0', Status: 'Duplicate' }]);
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(true);
    });

    it('falls back when the publish is rejected', async () => {
        activeTopic();
        engine.PublishAs.mockResolvedValue([{ MessageID: 'm-1', Status: 'Rejected', Error: { Code: 'TransportUnavailable', Message: 'down', Retryable: true } }]);
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(false);
        expect(LogError).toHaveBeenCalled();
    });

    it('falls back when the publish throws', async () => {
        activeTopic();
        engine.PublishAs.mockRejectedValue(new Error('deadlock victim'));
        expect(await router.TryRoute('Entity AI Action', {}, null, USER)).toBe(false);
        expect(LogError).toHaveBeenCalled();
    });

    it('does not route data that is not plain JSON', async () => {
        activeTopic();
        class LiveEntity { Save() { return true; } }
        expect(await router.TryRoute('Entity AI Action', { entityRecord: new LiveEntity() }, null, USER)).toBe(false);
        expect(engine.PublishAs).not.toHaveBeenCalled();
        expect(LogError).toHaveBeenCalled();
    });

    it('does not route a queue type whose name has no usable slug', async () => {
        expect(await router.TryRoute('***', {}, null, USER)).toBe(false);
        expect(engine.Config).not.toHaveBeenCalled();
        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('no letters or digits'));
    });
});
