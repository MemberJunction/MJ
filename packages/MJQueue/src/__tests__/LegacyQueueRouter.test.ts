import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class {},
    RunView: class {},
    UserInfo: class {},
    BaseEntity: class {},
}));
vi.mock('@memberjunction/core-entities', () => ({}));

import { LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import { LegacyQueueRouterRegistry, type ILegacyQueueRouter } from '../generic/LegacyQueueRouter';
import { QueueManager } from '../generic/QueueManager';

const USER = { ID: 'user-1' } as unknown as UserInfo;

function router(result: boolean | Error): ILegacyQueueRouter & { TryRoute: ReturnType<typeof vi.fn> } {
    return {
        TryRoute: vi.fn(async () => {
            if (result instanceof Error) {
                throw result;
            }
            return result;
        }),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    LegacyQueueRouterRegistry.Instance.Clear();
});

describe('LegacyQueueRouterRegistry', () => {
    it('does not route when no router is registered', async () => {
        expect(LegacyQueueRouterRegistry.Instance.Router).toBeNull();
        expect(await LegacyQueueRouterRegistry.Instance.TryRoute('AI Action', {}, null, USER)).toBe(false);
    });

    it('forwards the call to the registered router', async () => {
        const accepting = router(true);
        LegacyQueueRouterRegistry.Instance.Register(accepting);

        expect(await LegacyQueueRouterRegistry.Instance.TryRoute('AI Action', { a: 1 }, { priority: 2 }, USER)).toBe(true);
        expect(accepting.TryRoute).toHaveBeenCalledWith('AI Action', { a: 1 }, { priority: 2 }, USER);
    });

    it('reports a declined route', async () => {
        LegacyQueueRouterRegistry.Instance.Register(router(false));
        expect(await LegacyQueueRouterRegistry.Instance.TryRoute('AI Action', {}, null, USER)).toBe(false);
    });

    it('treats a throwing router as not routed and logs it', async () => {
        LegacyQueueRouterRegistry.Instance.Register(router(new Error('engine exploded')));
        expect(await LegacyQueueRouterRegistry.Instance.TryRoute('AI Action', {}, null, USER)).toBe(false);
        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('engine exploded'));
    });

    it('keeps only the most recently registered router', async () => {
        const first = router(true);
        const second = router(false);
        LegacyQueueRouterRegistry.Instance.Register(first);
        LegacyQueueRouterRegistry.Instance.Register(second);

        expect(LegacyQueueRouterRegistry.Instance.Router).toBe(second);
        expect(await LegacyQueueRouterRegistry.Instance.TryRoute('AI Action', {}, null, USER)).toBe(false);
        expect(first.TryRoute).not.toHaveBeenCalled();
        expect(LogStatus).toHaveBeenCalledWith(expect.stringContaining('replaced'));
    });
});

describe('QueueManager.AddTask (static) and the routing seam', () => {
    it('returns undefined for a routed task without loading queue types', async () => {
        LegacyQueueRouterRegistry.Instance.Register(router(true));
        const config = vi.spyOn(QueueManager, 'Config').mockResolvedValue(undefined);

        expect(await QueueManager.AddTask('AI Action', { a: 1 }, null, USER)).toBeUndefined();
        expect(config).not.toHaveBeenCalled();
    });

    it('falls through to the in-process path when the router declines', async () => {
        LegacyQueueRouterRegistry.Instance.Register(router(false));
        vi.spyOn(QueueManager, 'Config').mockResolvedValue(undefined);

        await expect(QueueManager.AddTask('No Such Type', {}, null, USER)).rejects.toThrow('Queue Type No Such Type not found.');
    });

    it('behaves exactly as before when no router is registered', async () => {
        vi.spyOn(QueueManager, 'Config').mockResolvedValue(undefined);
        await expect(QueueManager.AddTask('No Such Type', {}, null, USER)).rejects.toThrow('Queue Type No Such Type not found.');
    });
});

describe('QueueManager.RemoveQueue', () => {
    it('reports false when this process has no queue for the type', () => {
        expect(QueueManager.Instance.RemoveQueue('no-such-type-id')).toBe(false);
    });
});
