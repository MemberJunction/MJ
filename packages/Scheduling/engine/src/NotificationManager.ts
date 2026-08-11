/**
 * @fileoverview Notification delivery for scheduled jobs.
 *
 * **Two people have a say in how a job's notification is delivered**, and this class exists to
 * compose them. The person who configured the job chose which channels it may use
 * (`NotifyViaEmail` / `NotifyViaInApp` on the job row); the recipient chose which channels they
 * want (their notification preferences). The delivered set is the intersection — a job cannot add
 * a channel the recipient declined, and a type default cannot add a channel the job never asked
 * for. `NotificationEngine` resolves the recipient's half; the job's half is handed down as
 * `allowedDeliveryChannels`, a ceiling that can only subtract.
 *
 * **Nothing here may throw.** It runs at the tail of job completion, after the run record has been
 * written and the lock released. A notification that fails is an annoyance; a notification that
 * faults the completion path would corrupt run bookkeeping for a job that actually succeeded.
 *
 * @module @memberjunction/scheduling-engine
 */

import { LogError, LogStatus, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJUserNotificationEntity } from '@memberjunction/core-entities';
import { NotificationEngine } from '@memberjunction/notifications';
import { NotificationContent, NotificationChannel } from '@memberjunction/scheduling-base-types';

/**
 * The seeded `MJ: User Notification Types` row scheduled-job notifications are delivered under.
 * Pinned by name rather than ID so an instance that re-seeded metadata still resolves; a rename
 * would silently drop every job notification to the raw fallback, so the integration tier pins it.
 */
export const SCHEDULED_JOB_NOTIFICATION_TYPE = 'Scheduled Job';

/** Everything needed to deliver one job's completion notice. */
export type ScheduledJobNotificationParams = {
    /** Who hears about it — the job's NotifyUser, or its owner. */
    RecipientUserID: string;
    /** Subject/body/priority, formatted by the job's own plugin via `FormatNotification`. */
    Content: NotificationContent;
    /** The channels the JOB asked for. Acts as a ceiling, never an escalation. */
    Channels: NotificationChannel[];
    ContextUser: UserInfo;
    /** Deep-link context, so clicking the notification lands on the job that produced it. */
    ScheduledJobID?: string;
    ScheduledJobRunID?: string;
    /**
     * The provider the job ran under. Threaded rather than resolved globally so a server hosting
     * more than one connection notifies through the same one the job read its data from.
     */
    Provider?: IMetadataProvider;
};

/**
 * Delivers notifications about scheduled job execution.
 */
export class NotificationManager {
    /**
     * Send a notification about a scheduled job completion.
     *
     * Delivery goes through `NotificationEngine`, which honors the recipient's per-type
     * preferences and handles email/SMS templating. When the engine cannot deliver at all — the
     * type is not seeded in this instance, the engine is unavailable — an in-app notification is
     * written directly, but only if the job asked for in-app; falling back onto a channel the job
     * did not request would be worse than not delivering.
     *
     * A recipient who has *opted out* is not a failure and does not trigger the fallback.
     *
     * @returns true when at least one channel actually delivered.
     */
    public static async SendScheduledJobNotification(params: ScheduledJobNotificationParams): Promise<boolean> {
        const { RecipientUserID, Content, Channels, ContextUser } = params;
        if (!RecipientUserID || !Channels?.length) {
            return false;
        }

        const ceiling = this.channelCeiling(Channels);
        const resourceConfiguration = this.buildResourceConfiguration(params);

        try {
            await NotificationEngine.Instance.Config(false, ContextUser, params.Provider);
            const result = await NotificationEngine.Instance.SendNotification({
                userId: RecipientUserID,
                typeNameOrId: SCHEDULED_JOB_NOTIFICATION_TYPE,
                title: Content.Subject,
                message: Content.Body,
                resourceConfiguration,
                templateData: {
                    subject: Content.Subject,
                    body: Content.Body,
                    priority: Content.Priority,
                    scheduledJobId: params.ScheduledJobID ?? '',
                    scheduledJobRunId: params.ScheduledJobRunID ?? '',
                    ...(Content.Metadata ?? {}),
                },
                allowedDeliveryChannels: ceiling,
            }, ContextUser);

            if (result.success) {
                const { inApp, email, sms } = result.deliveryChannels;
                // All-false here means the recipient opted out (or the type disables every
                // channel). That is a decision, not a failure — no fallback.
                return inApp || email || sms;
            }
            LogStatus(
                `[NotificationManager] NotificationEngine could not deliver "${Content.Subject}" ` +
                `(${(result.errors ?? []).join('; ') || 'no detail'})${ceiling.inApp ? ' — writing an in-app notification directly' : ''}`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogStatus(
                `[NotificationManager] NotificationEngine unavailable (${message})` +
                `${ceiling.inApp ? ' — writing an in-app notification directly' : ''}`
            );
        }

        // Only in-app has a fallback: it is a single row this class can write itself. Email and SMS
        // need a configured communication provider, which is exactly what was unavailable above.
        return ceiling.inApp ? this.deliverInAppDirect(params, resourceConfiguration) : false;
    }

    /**
     * Translate the job's channel toggles into a ceiling.
     *
     * A channel the job did not list is explicitly `false` — the ceiling has to be closed, not
     * merely silent, or a type default would deliver on a channel nobody asked for. SMS is always
     * closed: a scheduled job has no way to request it today, so leaving it open would let a type
     * default text someone about a nightly sync.
     */
    private static channelCeiling(channels: NotificationChannel[]): { inApp: boolean; email: boolean; sms: boolean } {
        return {
            inApp: channels.includes('InApp'),
            email: channels.includes('Email'),
            sms: false,
        };
    }

    /** Deep-link context stored on the notification, so it can navigate back to the run. */
    private static buildResourceConfiguration(params: ScheduledJobNotificationParams): Record<string, string> {
        const config: Record<string, string> = { type: 'ScheduledJob' };
        if (params.ScheduledJobID) {
            config.scheduledJobId = params.ScheduledJobID;
        }
        if (params.ScheduledJobRunID) {
            config.scheduledJobRunId = params.ScheduledJobRunID;
        }
        return config;
    }

    /**
     * Write an in-app notification row directly — the minimal, always-available path when the
     * engine is not usable. Deliberately does not set `NotificationTypeID`: the reason we are here
     * is that the type could not be resolved.
     */
    private static async deliverInAppDirect(
        params: ScheduledJobNotificationParams,
        resourceConfiguration: Record<string, string>
    ): Promise<boolean> {
        try {
            const provider = params.Provider ?? Metadata.Provider;
            const notification = await provider.GetEntityObject<MJUserNotificationEntity>(
                'MJ: User Notifications',
                params.ContextUser
            );
            notification.NewRecord();
            notification.UserID = params.RecipientUserID;
            notification.Title = params.Content.Subject;
            notification.Message = params.Content.Body;
            notification.Unread = true;
            notification.ResourceConfiguration = JSON.stringify(resourceConfiguration);

            if (await notification.Save()) {
                return true;
            }
            LogError(
                `[NotificationManager] Direct in-app notification failed for user ${params.RecipientUserID}: ` +
                `${notification.LatestResult?.CompleteMessage ?? 'unknown error'}`
            );
            return false;
        } catch (error) {
            LogError(`[NotificationManager] Direct in-app notification threw for user ${params.RecipientUserID}`, undefined, error);
            return false;
        }
    }
}
