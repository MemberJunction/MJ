/**
 * Tests for `NotificationManager` — delivering a scheduled job's completion notice.
 *
 * The behavior worth defending is the **composition of two people's choices**. The job's
 * `NotifyViaEmail`/`NotifyViaInApp` toggles say which channels it may use; the recipient's
 * preferences say which channels they want. Delivery is the intersection, and the two mistakes
 * that matter are opposite: escalating past a recipient's opt-out, and delivering on a channel
 * the job never asked for. Both are checked here.
 *
 * The second contract is that **nothing throws**. This runs after a job's run record is written,
 * so a delivery problem must never fault the bookkeeping of a job that actually succeeded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendNotificationParams } from '@memberjunction/notifications';

const sendNotification = vi.fn();
const config = vi.fn();

vi.mock('@memberjunction/notifications', () => ({
    NotificationEngine: {
        get Instance() {
            return { Config: config, SendNotification: sendNotification };
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

import { NotificationManager, SCHEDULED_JOB_NOTIFICATION_TYPE, type ScheduledJobNotificationParams } from '../NotificationManager';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { NotificationChannel } from '@memberjunction/scheduling-base-types';

/** A savable in-app notification row, and a provider that hands it out. */
function notificationProvider(saves = true) {
    const row = {
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(saves),
        LatestResult: { CompleteMessage: 'disk on fire' },
        UserID: '', Title: '', Message: '', Unread: false, ResourceConfiguration: '',
    };
    const provider = { GetEntityObject: vi.fn().mockResolvedValue(row) } as unknown as IMetadataProvider;
    return { provider, row };
}

const params = (over: Partial<ScheduledJobNotificationParams> = {}): ScheduledJobNotificationParams => ({
    RecipientUserID: 'user-1',
    Content: { Subject: 'Nightly sync completed', Body: '412 records synced.', Priority: 'Normal' },
    Channels: ['InApp'] as NotificationChannel[],
    ContextUser: { ID: 'user-1' } as UserInfo,
    ScheduledJobID: 'job-1',
    ScheduledJobRunID: 'run-1',
    ...over,
});

/** The engine delivered on exactly these channels. */
const delivered = (over: Partial<{ inApp: boolean; email: boolean; sms: boolean }> = {}) => ({
    success: true,
    deliveryChannels: { inApp: true, email: false, sms: false, ...over },
});

const sentParams = (): SendNotificationParams => sendNotification.mock.calls[0][0];

describe('NotificationManager.SendScheduledJobNotification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.mockResolvedValue(undefined);
        sendNotification.mockResolvedValue(delivered());
    });

    it('delivers through NotificationEngine under the seeded type', async () => {
        const ok = await NotificationManager.SendScheduledJobNotification(params());

        expect(ok).toBe(true);
        expect(sentParams().typeNameOrId).toBe(SCHEDULED_JOB_NOTIFICATION_TYPE);
        expect(sentParams().title).toBe('Nightly sync completed');
        expect(sentParams().message).toBe('412 records synced.');
    });

    it('carries the job and run IDs so the notification can navigate back to what produced it', async () => {
        await NotificationManager.SendScheduledJobNotification(params());
        expect(sentParams().resourceConfiguration).toEqual({
            type: 'ScheduledJob', scheduledJobId: 'job-1', scheduledJobRunId: 'run-1',
        });
    });

    it('threads the job\'s provider into the engine rather than letting it resolve globally', async () => {
        const { provider } = notificationProvider();
        await NotificationManager.SendScheduledJobNotification(params({ Provider: provider }));
        expect(config).toHaveBeenCalledWith(false, expect.anything(), provider);
    });
});

describe('the job\'s channel toggles are a ceiling, never an escalation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.mockResolvedValue(undefined);
        sendNotification.mockResolvedValue(delivered());
    });

    it('closes every channel the job did NOT ask for', async () => {
        // Not merely silent — closed. A silent channel would let the notification TYPE's default
        // deliver an email for a job whose author explicitly left email off.
        await NotificationManager.SendScheduledJobNotification(params({ Channels: ['InApp'] }));
        expect(sentParams().allowedDeliveryChannels).toEqual({ inApp: true, email: false, sms: false });
    });

    it('opens both when the job asked for both', async () => {
        await NotificationManager.SendScheduledJobNotification(params({ Channels: ['Email', 'InApp'] }));
        expect(sentParams().allowedDeliveryChannels).toEqual({ inApp: true, email: true, sms: false });
    });

    it('always closes SMS — a job has no way to ask for it', async () => {
        // Leaving it open would let a type default text someone about a nightly sync.
        await NotificationManager.SendScheduledJobNotification(params({ Channels: ['Email', 'InApp'] }));
        expect(sentParams().allowedDeliveryChannels?.sms).toBe(false);
    });

    it('does NOT use forceDeliveryChannels — that would override the recipient\'s opt-out', async () => {
        await NotificationManager.SendScheduledJobNotification(params());
        expect(sentParams().forceDeliveryChannels).toBeUndefined();
    });
});

describe('an opted-out recipient is a decision, not a failure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.mockResolvedValue(undefined);
    });

    it('reports nothing delivered without writing anything itself', async () => {
        sendNotification.mockResolvedValue(delivered({ inApp: false }));
        const { provider, row } = notificationProvider();

        const ok = await NotificationManager.SendScheduledJobNotification(params({ Provider: provider }));

        expect(ok).toBe(false);
        // The direct fallback exists for an unusable engine, not for a recipient who said no.
        expect(row.Save).not.toHaveBeenCalled();
    });

    it('reports delivered when any single channel got through', async () => {
        sendNotification.mockResolvedValue(delivered({ inApp: false, email: true }));
        expect(await NotificationManager.SendScheduledJobNotification(params({ Channels: ['Email'] }))).toBe(true);
    });
});

describe('fallback when the engine cannot deliver at all', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.mockResolvedValue(undefined);
    });

    it('writes the in-app row directly when the engine throws', async () => {
        // e.g. the notification type is not seeded in this instance.
        sendNotification.mockRejectedValue(new Error('type not found'));
        const { provider, row } = notificationProvider();

        const ok = await NotificationManager.SendScheduledJobNotification(params({ Provider: provider }));

        expect(ok).toBe(true);
        expect(row.Save).toHaveBeenCalled();
        expect(row.UserID).toBe('user-1');
        expect(row.Title).toBe('Nightly sync completed');
        expect(row.Unread).toBe(true);
    });

    it('writes it directly when the engine reports failure', async () => {
        sendNotification.mockResolvedValue({ success: false, deliveryChannels: { inApp: false, email: false, sms: false }, errors: ['boom'] });
        const { provider, row } = notificationProvider();

        expect(await NotificationManager.SendScheduledJobNotification(params({ Provider: provider }))).toBe(true);
        expect(row.Save).toHaveBeenCalled();
    });

    it('does NOT fall back to in-app for a job that only asked for email', async () => {
        // Falling back onto a channel the author did not request is worse than not delivering.
        sendNotification.mockRejectedValue(new Error('engine down'));
        const { provider, row } = notificationProvider();

        const ok = await NotificationManager.SendScheduledJobNotification(
            params({ Channels: ['Email'], Provider: provider })
        );

        expect(ok).toBe(false);
        expect(row.Save).not.toHaveBeenCalled();
    });

    it('writes through the job\'s provider, not the process default', async () => {
        sendNotification.mockRejectedValue(new Error('engine down'));
        const { provider } = notificationProvider();

        await NotificationManager.SendScheduledJobNotification(params({ Provider: provider }));

        expect(provider.GetEntityObject).toHaveBeenCalledWith('MJ: User Notifications', expect.anything());
    });
});

describe('it never throws — job completion runs after this', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.mockResolvedValue(undefined);
        sendNotification.mockResolvedValue(delivered());
    });

    it('returns false rather than throwing when the direct write fails', async () => {
        sendNotification.mockRejectedValue(new Error('engine down'));
        const { provider } = notificationProvider(false);
        await expect(NotificationManager.SendScheduledJobNotification(params({ Provider: provider }))).resolves.toBe(false);
    });

    it('returns false rather than throwing when the direct write itself throws', async () => {
        sendNotification.mockRejectedValue(new Error('engine down'));
        const provider = { GetEntityObject: vi.fn().mockRejectedValue(new Error('no such entity')) } as unknown as IMetadataProvider;
        await expect(NotificationManager.SendScheduledJobNotification(params({ Provider: provider }))).resolves.toBe(false);
    });

    it('does nothing for a job with no recipient', async () => {
        expect(await NotificationManager.SendScheduledJobNotification(params({ RecipientUserID: '' }))).toBe(false);
        expect(sendNotification).not.toHaveBeenCalled();
    });

    it('does nothing for a job with no channels enabled', async () => {
        expect(await NotificationManager.SendScheduledJobNotification(params({ Channels: [] }))).toBe(false);
        expect(sendNotification).not.toHaveBeenCalled();
    });
});
