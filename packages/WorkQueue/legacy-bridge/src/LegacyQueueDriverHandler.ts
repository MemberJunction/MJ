import type { UserInfo } from '@memberjunction/core';
import type { MJQueueEntity, MJQueueTaskEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { QueueBase, QueueManager, TaskBase, type TaskResult } from '@memberjunction/queue';
import {
    FatalWorkError, Outcome, TransientWorkError, type WorkContext, type WorkMessage, type WorkOutcome,
} from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';
import { IsLegacyQueueTaskPayload, ToTaskOptions, type LegacyQueueTaskPayload } from './LegacyQueueTaskPayload';
import { LEGACY_QUEUE_HANDLER_KEY } from './LegacyQueueTopicName';

/** MJ: Queues.Name is nvarchar(50). */
const QUEUE_NAME_MAX_LENGTH = 50;

/**
 * Work-queue handler for legacy queue types. Runs the routed task through the QueueBase driver registered for its
 * queue type, as the user who enqueued it, so every existing driver becomes durable without changes once its topic
 * is activated. Legacy drivers have no cancellation parameter, so `context.Signal` cannot stop a running driver;
 * the runtime discards the outcome of a cancelled or fenced-out run.
 */
@RegisterClass(BaseWorkHandler, LEGACY_QUEUE_HANDLER_KEY)
export class LegacyQueueDriverHandler extends BaseWorkHandler<LegacyQueueTaskPayload> {
    public async Handle(message: WorkMessage<LegacyQueueTaskPayload>, context: WorkContext): Promise<WorkOutcome> {
        const payload = message.Payload;
        if (!IsLegacyQueueTaskPayload(payload)) {
            throw new FatalWorkError(`Work queue message ${message.MessageID} is not a legacy queue task payload`);
        }
        const user = this.resolveUser(payload.userID ?? null);
        const driver = await this.createDriver(payload.queueTypeName, user);
        const task = await this.createTask(payload, user);
        const result = await driver.ExecuteTask(task, user, this.Provider);
        return this.toOutcome(result, payload.queueTypeName, context);
    }

    private toOutcome(result: TaskResult, queueTypeName: string, context: WorkContext): WorkOutcome {
        if (result.success) {
            return Outcome.Complete();
        }
        const message = result.userMessage || `Queue type '${queueTypeName}' task failed`;
        if (result.failureKind === 'Fatal') {
            throw new FatalWorkError(message);
        }
        if (result.failureKind === 'RecordNotFound' && context.Attempt >= context.MaxAttempts) {
            // Still missing after every retry: the record was deleted, not merely uncommitted. Nothing to act on.
            context.Log.Warn(`Queue type '${queueTypeName}': ${message} Completing without running it (attempt ${context.Attempt} of ${context.MaxAttempts}).`);
            return Outcome.Complete();
        }
        throw new TransientWorkError(message);
    }

    /** The enqueuing user when it can be resolved; otherwise the host's user this handler was bound with. */
    private resolveUser(userID: string | null): UserInfo {
        if (!userID) {
            return this.ContextUser;
        }
        try {
            return UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, userID)) ?? this.ContextUser;
        } catch {
            return this.ContextUser;
        }
    }

    private async createDriver(queueTypeName: string, user: UserInfo): Promise<QueueBase> {
        const factory = MJGlobal.Instance.ClassFactory;
        if (!factory.GetRegistration(QueueBase, queueTypeName)) {
            throw new FatalWorkError(`No QueueBase driver is registered for queue type '${queueTypeName}'`);
        }
        const queueRecord = await this.Provider.GetEntityObject<MJQueueEntity>('MJ: Queues', user);
        queueRecord.NewRecord();
        queueRecord.Name = queueTypeName.slice(0, QUEUE_NAME_MAX_LENGTH);
        const resolution = factory.TryCreateInstance<QueueBase>(
            QueueBase, queueTypeName, queueRecord, await this.queueTypeID(queueTypeName, user), user);
        if (!resolution.Resolved || !resolution.Instance) {
            throw new FatalWorkError(`No QueueBase driver is registered for queue type '${queueTypeName}'`);
        }
        return resolution.Instance;
    }

    private async queueTypeID(queueTypeName: string, user: UserInfo): Promise<string> {
        await QueueManager.Config(user);
        const wanted = queueTypeName.trim().toLowerCase();
        return QueueManager.QueueTypes.find((t) => t.Name.trim().toLowerCase() === wanted)?.ID ?? '';
    }

    private async createTask(payload: LegacyQueueTaskPayload, user: UserInfo): Promise<TaskBase> {
        const taskRecord = await this.Provider.GetEntityObject<MJQueueTaskEntity>('MJ: Queue Tasks', user);
        taskRecord.NewRecord();
        taskRecord.Data = JSON.stringify(payload.data);
        taskRecord.Options = JSON.stringify(payload.options);
        return new TaskBase(taskRecord, payload.data, ToTaskOptions(payload.options));
    }
}
