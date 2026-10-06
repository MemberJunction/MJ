import type { UserInfo } from '@memberjunction/core';
import type {
    MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity,
    WorkQueueBindingIssueRow, WorkQueueDeadLetterRow, WorkQueueDiscardDeliveryInput, WorkQueueDiscardDeliveryOutput,
    WorkQueueGetBacklogInput, WorkQueueGetBacklogOutput,
    WorkQueueGetSubscriptionStatsInput, WorkQueueGetSubscriptionStatsOutput, WorkQueueListDeadLettersInput,
    WorkQueueListDeadLettersOutput, WorkQueueListPartitionsInput, WorkQueueListPartitionsOutput, WorkQueuePartitionStateRow,
    WorkQueueReplayDeadLetterInput, WorkQueueReplayDeadLetterOutput,
    WorkQueueSubscriptionStatsRow, WorkQueueValidateBindingsInput, WorkQueueValidateBindingsOutput,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { NULL_WORK_LOGGER, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type {
    BindingValidationIssue, DeadLetterRecord, ITransportDriver, ITransportOperator, OperatorResult, PartitionCondition,
    PartitionStateRecord, SubscriptionBinding, SubscriptionStats, TopicBinding, WorkLogger,
} from '@memberjunction/work-queue-core';

/** The part of WorkQueueEngine the operator needs. WorkQueueEngine satisfies it structurally. */
export interface WorkQueueOperatorEngine {
    readonly Transports: MJWorkQueueTransportEntity[];
    readonly Topics: MJWorkQueueTopicEntity[];
    readonly Subscriptions: MJWorkQueueSubscriptionEntity[];
    GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined;
    BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding;
    BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding;
    GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator>;
    GetDriver(transportID: string): Promise<ITransportDriver>;
    /** Autoscaler metric (03 §11): claimable pending + in flight, each capped at 1000. */
    GetBacklog(subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number; Capped: boolean }>;
    ValidateTopology(): Promise<BindingValidationIssue[]>;
}

export const OPERATOR_DEFAULT_PAGE_SIZE = 50;
export const OPERATOR_MAX_PAGE_SIZE = 500;
/** `reason` / `note` end up in ResolutionNote nvarchar(1000) (03 §6.5). */
export const OPERATOR_MAX_NOTE_LENGTH = 1000;
export const OPERATOR_MAX_CURSOR_LENGTH = 500;
export const OPERATOR_MAX_NAME_LENGTH = 200;
/** What a caller sees when one subscription's stats cannot be read; the real error is logged server-side. */
export const STATS_UNAVAILABLE_MESSAGE = 'Stats are unavailable for this subscription';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTITION_CONDITIONS: readonly PartitionCondition[] = ['Idle', 'InFlight', 'Blocked'];

/**
 * Validates operator input and maps between the transport contract (03 §5.2) and the Remote Operation I/O types
 * (03 §8). Every validation failure throws before any transport call.
 */
export class WorkQueueOperatorService {
    constructor(private readonly engine: WorkQueueOperatorEngine, private readonly log: Pick<WorkLogger, 'Error'> = NULL_WORK_LOGGER) {}

    public async GetSubscriptionStats(input: WorkQueueGetSubscriptionStatsInput): Promise<WorkQueueGetSubscriptionStatsOutput> {
        RequireInput(input);
        const name = OptionalText(input.subscriptionName, 'subscriptionName', OPERATOR_MAX_NAME_LENGTH);
        if (name) {
            return { subscriptions: [ToStatsRow(await this.stats(this.requireSubscription(name)))], failures: [] };
        }
        const output: WorkQueueGetSubscriptionStatsOutput = { subscriptions: [], failures: [] };
        for (const subscription of [...this.engine.Subscriptions].sort(ByName)) {
            try {
                output.subscriptions.push(ToStatsRow(await this.stats(subscription)));
            } catch (error) {
                // Raw driver text (SQL, ARNs, credential hints) stays in the server log; the caller gets a fixed message.
                this.log.Error(`Reading stats for subscription '${subscription.Name}' failed`, error instanceof Error ? error : new Error(String(error)));
                output.failures.push({ subscriptionName: subscription.Name, error: STATS_UNAVAILABLE_MESSAGE });
            }
        }
        return output;
    }

    public async ListDeadLetters(input: WorkQueueListDeadLettersInput): Promise<WorkQueueListDeadLettersOutput> {
        const subscription = this.subscriptionOf(input);
        const pageSize = RequirePageSize(input.pageSize);
        const cursor = OptionalText(input.cursor, 'cursor', OPERATOR_MAX_CURSOR_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const page = await operator.ListDeadLetters(this.binding(subscription), cursor, pageSize);
        return page
            ? { supported: true, items: page.Items.map(ToDeadLetterRow), nextCursor: page.NextCursor }
            : { supported: false, items: [], nextCursor: null };
    }

    public async ListPartitions(input: WorkQueueListPartitionsInput): Promise<WorkQueueListPartitionsOutput> {
        const subscription = this.subscriptionOf(input);
        const condition = RequireCondition(input.condition);
        const pageSize = RequirePageSize(input.pageSize);
        const cursor = OptionalText(input.cursor, 'cursor', OPERATOR_MAX_CURSOR_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const page = await operator.ListPartitions(this.binding(subscription), condition, cursor, pageSize);
        return page
            ? { supported: true, items: page.Items.map(ToPartitionRow), nextCursor: page.NextCursor }
            : { supported: false, items: [], nextCursor: null };
    }

    public async ReplayDeadLetter(input: WorkQueueReplayDeadLetterInput, user: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        const subscription = this.subscriptionOf(input);
        const deliveryID = RequireUUID(input.deliveryID, 'deliveryID');
        const note = OptionalText(input.note, 'note', OPERATOR_MAX_NOTE_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const result = await operator.Replay(this.binding(subscription), deliveryID, user.ID, note);
        return { supported: result.Supported, replayed: Changed(result) };
    }

    /**
     * Pending or dead-lettered → Discarded now. In flight → cancelled (03 §7): both flags come back true, the handler
     * is aborted within one heartbeat interval, and the row becomes Discarded when it acknowledges.
     */
    public async DiscardDelivery(input: WorkQueueDiscardDeliveryInput, user: UserInfo): Promise<WorkQueueDiscardDeliveryOutput> {
        const subscription = this.subscriptionOf(input);
        const deliveryID = RequireUUID(input.deliveryID, 'deliveryID');
        const reason = RequireText(input.reason, 'reason', OPERATOR_MAX_NOTE_LENGTH);
        const operator = await this.engine.GetOperator(subscription);
        const result = await operator.Discard(this.binding(subscription), deliveryID, reason, user.ID);
        return { supported: result.Supported, discarded: Changed(result), cancelRequested: CancelRequested(result) };
    }

    /**
     * The autoscaler metric. Both numbers matter: schedulers subtract running executions from the metric, so a
     * claimable-only count scales to zero while work is still in flight and starves the queue (02 §4.4a).
     */
    public async GetBacklog(input: WorkQueueGetBacklogInput): Promise<WorkQueueGetBacklogOutput> {
        const subscription = this.subscriptionOf(input);
        const backlog = await this.engine.GetBacklog(subscription.Name);
        return { supported: backlog.Supported, claimable: backlog.Claimable, inFlight: backlog.InFlight, total: backlog.Total, capped: backlog.Capped };
    }

    public async ValidateBindings(input: WorkQueueValidateBindingsInput): Promise<WorkQueueValidateBindingsOutput> {
        RequireInput(input);
        const transportName = OptionalText(input.transportName, 'transportName', OPERATOR_MAX_NAME_LENGTH);
        if (!transportName) {
            return { issues: (await this.engine.ValidateTopology()).map(ToIssueRow) };
        }
        const transport = this.engine.Transports.find(t => t.Name.trim().toLowerCase() === transportName.toLowerCase());
        if (!transport) {
            throw new WorkQueueConfigurationError(`Unknown work queue transport '${transportName}'`);
        }
        const driver = await this.engine.GetDriver(transport.ID);
        const issues: BindingValidationIssue[] = [];
        for (const topic of this.engine.Topics.filter(t => UUIDsEqual(t.TransportID, transport.ID)).sort(ByName)) {
            const subscriptions = this.engine.Subscriptions.filter(s => UUIDsEqual(s.TopicID, topic.ID)).sort(ByName).map(s => this.binding(s));
            issues.push(...(await driver.ValidateBindings(this.engine.BuildTopicBinding(topic), subscriptions)));
        }
        return { issues: issues.map(ToIssueRow) };
    }

    private async stats(subscription: MJWorkQueueSubscriptionEntity): Promise<SubscriptionStats> {
        const operator = await this.engine.GetOperator(subscription);
        return operator.GetStats(this.binding(subscription));
    }

    private binding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding {
        return this.engine.BuildSubscriptionBinding(subscription);
    }

    /** Validates the input object and its subscriptionName, then resolves the subscription. */
    private subscriptionOf(input: { subscriptionName: string }): MJWorkQueueSubscriptionEntity {
        RequireInput(input);
        return this.requireSubscription(RequireText(input.subscriptionName, 'subscriptionName', OPERATOR_MAX_NAME_LENGTH));
    }

    private requireSubscription(name: string): MJWorkQueueSubscriptionEntity {
        const subscription = this.engine.GetSubscriptionByName(name);
        if (!subscription) {
            throw new WorkQueueConfigurationError(`Unknown work queue subscription '${name}'`);
        }
        return subscription;
    }
}

function ToStatsRow(stats: SubscriptionStats): WorkQueueSubscriptionStatsRow {
    return {
        SubscriptionName: stats.SubscriptionName, Pending: stats.Pending, InFlight: stats.InFlight, DeadLettered: stats.DeadLettered,
        BlockedKeys: stats.BlockedKeys, OldestPendingAgeSeconds: stats.OldestPendingAgeSeconds,
        CompletedLastHour: stats.CompletedLastHour, AsOf: stats.AsOf,
    };
}

function ToDeadLetterRow(record: DeadLetterRecord): WorkQueueDeadLetterRow {
    const message = record.Message;
    return {
        DeliveryID: record.DeliveryID, PartitionKey: record.PartitionKey, Attempts: record.Attempts, Reason: record.Reason,
        LastError: record.LastError, DeadLetteredAt: record.DeadLetteredAt, BlocksKey: record.BlocksKey,
        Message: {
            MessageID: message.MessageID, Topic: message.Topic, PartitionKey: message.PartitionKey,
            Attributes: { ...message.Attributes },
            PayloadJSON: message.Payload === undefined ? null : JSON.stringify(message.Payload),
            PayloadRef: message.PayloadRef ? { ...message.PayloadRef } : undefined,
            CorrelationID: message.CorrelationID, PublishedAt: message.PublishedAt,
        },
    };
}

function ToPartitionRow(record: PartitionStateRecord): WorkQueuePartitionStateRow {
    return {
        PartitionKey: record.PartitionKey, Condition: record.Condition, HeadDeliveryID: record.HeadDeliveryID,
        WaitingItems: record.WaitingItems,
    };
}

function ToIssueRow(issue: BindingValidationIssue): WorkQueueBindingIssueRow {
    return { Severity: issue.Severity, Subject: issue.Subject, Message: issue.Message };
}

function Changed(result: OperatorResult): boolean {
    return result.Supported ? result.Changed : false;
}

/** True when the operator asked a running handler to stop (CancelRequestedAt set) instead of settling the row (03 §7). */
function CancelRequested(result: OperatorResult): boolean {
    return result.Supported ? result.CancelRequested === true : false;
}

/** A null or non-object input is a validation error (03 §8), never a TypeError from a property read. */
function RequireInput(input: unknown): void {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new WorkQueueConfigurationError('input must be an object');
    }
}

function OptionalText(value: unknown, field: string, maxLength: number): string | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }
    const text = value.trim();
    if (text.length > maxLength) {
        throw new WorkQueueConfigurationError(`${field} must be at most ${maxLength} characters`);
    }
    return text;
}

function RequireText(value: unknown, field: string, maxLength: number): string {
    const text = OptionalText(value, field, maxLength);
    if (text === null) {
        throw new WorkQueueConfigurationError(`${field} is required`);
    }
    return text;
}

function RequireUUID(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
        throw new WorkQueueConfigurationError(`${field} must be a UUID`);
    }
    return value.trim();
}

function RequirePageSize(value: unknown): number {
    if (value === undefined || value === null) {
        return OPERATOR_DEFAULT_PAGE_SIZE;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > OPERATOR_MAX_PAGE_SIZE) {
        throw new WorkQueueConfigurationError(`pageSize must be an integer between 1 and ${OPERATOR_MAX_PAGE_SIZE}`);
    }
    return value;
}

function RequireCondition(value: unknown): PartitionCondition | null {
    const text = OptionalText(value, 'condition', OPERATOR_MAX_NAME_LENGTH);
    if (text === null) {
        return null;
    }
    const condition = PARTITION_CONDITIONS.find(c => c === text);
    if (!condition) {
        throw new WorkQueueConfigurationError(`condition must be one of ${PARTITION_CONDITIONS.join(', ')}`);
    }
    return condition;
}

function ByName(a: { Name: string }, b: { Name: string }): number {
    return a.Name.localeCompare(b.Name);
}
