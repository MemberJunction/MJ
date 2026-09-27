import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import type { ILegacyQueueRouter } from '@memberjunction/queue';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { BuildLegacyQueueTaskPayload, type LegacyQueueTaskPayload } from './LegacyQueueTaskPayload';
import { LegacyQueueTopicName, LegacyQueueTypeSlug } from './LegacyQueueTopicName';

/**
 * Publishes a legacy queue task to its `mjqueue.<queue type>` work-queue topic when that topic is Active and has a
 * delivering subscription. Anything short of an accepted publish returns false, leaving the task to the
 * in-process queue.
 */
export class WorkQueueLegacyRouter implements ILegacyQueueRouter {
    public async TryRoute(queueTypeName: string, data: unknown, options: unknown, contextUser: UserInfo): Promise<boolean> {
        const topicName = this.TopicNameFor(queueTypeName);
        if (!topicName || !(await this.MetadataLoaded(contextUser))) {
            return false;
        }
        const topic = WorkQueueEngine.Instance.GetTopicByName(topicName);
        if (!topic || topic.Status !== 'Active') {
            return false;
        }
        if (!this.HasDeliveringSubscription(topic.ID)) {
            LogStatus(`[QueueManager] Work queue topic '${topicName}' is Active but no subscription on it is Active or Paused; running '${queueTypeName}' in-process`);
            return false;
        }
        const payload = BuildLegacyQueueTaskPayload(queueTypeName, data, options, contextUser?.ID ?? null);
        if (!payload) {
            LogError(`[QueueManager] '${queueTypeName}' task data is not plain JSON and cannot be routed to '${topicName}'; running in-process`);
            return false;
        }
        return this.Publish(topicName, queueTypeName, payload, contextUser);
    }

    private TopicNameFor(queueTypeName: string): string | null {
        try {
            return LegacyQueueTopicName(queueTypeName);
        } catch (error) {
            LogError(`[QueueManager] ${describeError(error)}; running in-process`);
            return null;
        }
    }

    private async MetadataLoaded(contextUser: UserInfo): Promise<boolean> {
        try {
            await WorkQueueEngine.Instance.Config(false, contextUser);
            return true;
        } catch (error) {
            LogStatus(`[QueueManager] Work queue metadata is unavailable (${describeError(error)}); using the in-process queue`);
            return false;
        }
    }

    private HasDeliveringSubscription(topicID: string): boolean {
        return WorkQueueEngine.Instance.SubscriptionsForTopic(topicID)
            .some((s) => s.Status === 'Active' || s.Status === 'Paused');
    }

    private async Publish(topicName: string, queueTypeName: string, payload: LegacyQueueTaskPayload, contextUser: UserInfo): Promise<boolean> {
        try {
            const [result] = await WorkQueueEngine.Instance.PublishAs(
                topicName,
                [{ Payload: payload, Attributes: { queueType: LegacyQueueTypeSlug(queueTypeName) } }],
                { ContextUser: contextUser },
            );
            if (result && (result.Status === 'Accepted' || result.Status === 'Duplicate')) {
                return true;
            }
            LogError(`[QueueManager] Work queue topic '${topicName}' rejected a '${queueTypeName}' task (${result?.Error?.Code ?? 'no result'}: ${result?.Error?.Message ?? ''}); running in-process`);
            return false;
        } catch (error) {
            // The Database transport commits message and deliveries in one transaction, so a thrown publish was
            // not accepted and running the task in-process cannot run it twice.
            LogError(`[QueueManager] Publishing a '${queueTypeName}' task to '${topicName}' failed (${describeError(error)}); running in-process`);
            return false;
        }
    }
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
