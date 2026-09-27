import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn(), Metadata: class {}, RunView: class {}, UserInfo: class {}, BaseEntity: class {} }));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { Users: [] } } }));
vi.mock('@memberjunction/work-queue-engine', () => ({ BaseWorkHandler: class {}, WorkQueueEngine: { Instance: {} } }));
// The queue package's entry pulls in its AI Action drivers and, through them, the whole AI engine graph. The seam
// is what this test exercises, so only that module is loaded for real; the rest of the package is stubbed.
vi.mock('@memberjunction/queue', async () => {
    const seam = await import('@memberjunction/queue/dist/generic/LegacyQueueRouter.js');
    return { ...seam, QueueBase: class {}, TaskBase: class {}, QueueManager: class {} };
});

import { LegacyQueueRouterRegistry } from '@memberjunction/queue';
import { RegisterLegacyQueueBridge, WorkQueueLegacyRouter } from '../index';

describe('importing the bridge', () => {
    it('registers the work-queue router with the queue package seam, once', () => {
        const router = LegacyQueueRouterRegistry.Instance.Router;
        expect(router).toBeInstanceOf(WorkQueueLegacyRouter);

        RegisterLegacyQueueBridge();
        expect(LegacyQueueRouterRegistry.Instance.Router).toBe(router);
    });

    it('re-registers after the seam was cleared', () => {
        LegacyQueueRouterRegistry.Instance.Clear();
        RegisterLegacyQueueBridge();
        expect(LegacyQueueRouterRegistry.Instance.Router).toBeInstanceOf(WorkQueueLegacyRouter);
    });
});
