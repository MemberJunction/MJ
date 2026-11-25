import type {
    DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord,
    SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig } from '../config';
import { REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { SerializeEnvelope, SessionIdFor } from '../envelope';
import type { ServiceBusAdminGateway } from '../gateway/ServiceBusAdminGateway';
import type { ServiceBusGateway } from '../gateway/ServiceBusGateway';
import {
    DEAD_LETTER_RECEIVE_WAIT_MS,
    DEAD_LETTER_SCAN_LIMIT,
    DeadLetterIdOf,
    ToDeadLetterRecord,
    ToScannedDeadLetter,
    type ScannedDeadLetter,
} from './deadLetterScan';

export const REPLAY_NOTE_ATTRIBUTE = 'mj_replay_note';
export const REPLAYED_BY_ATTRIBUTE = 'mj_replayed_by';

export class AzureTransportOperator implements ITransportOperator {
    private readonly now: () => number;

    constructor(
        private readonly gateway: ServiceBusGateway,
        private readonly admin: ServiceBusAdminGateway,
        options: { Now?: () => number } = {},
    ) {
        this.now = options.Now ?? Date.now;
    }

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const runtime = await this.admin.GetSubscriptionRuntimeProperties(config.ServiceBusTopicName, config.SubscriptionName);
        if (runtime === null) {
            throw new Error(`Azure Service Bus subscription ${config.ServiceBusTopicName}/${config.SubscriptionName} does not exist`);
        }
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: runtime.ActiveMessageCount,
            InFlight: 0,
            DeadLettered: runtime.DeadLetterMessageCount,
            BlockedKeys: null,
            OldestPendingAgeSeconds: null,
            CompletedLastHour: null,
            AsOf: new Date(this.now()).toISOString(),
        };
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, _cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const limit = Math.min(Math.max(1, Math.floor(pageSize)), DEAD_LETTER_SCAN_LIMIT);
        const peeked = await this.gateway.PeekDeadLetters(config.ServiceBusTopicName, config.SubscriptionName, limit);
        return {
            Items: peeked.map(ToScannedDeadLetter).map(ToDeadLetterRecord),
            NextCursor: null,
        };
    }

    public async ListPartitions(
        _subscription: SubscriptionBinding,
        _condition: PartitionCondition | null,
        _cursor: string | null,
        _pageSize: number,
    ): Promise<Page<PartitionStateRecord> | null> {
        return null;
    }

    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const { Items, Match } = await this.findDeadLetter(config.ServiceBusTopicName, config.SubscriptionName, deliveryID);
        let settledToken: string | undefined;
        try {
            if (Match === null || Match.Envelope === null) {
                return { Supported: true, Changed: false };
            }
            const envelope = Match.Envelope;
            await this.gateway.Send(config.ServiceBusTopicName, {
                MessageId: envelope.MessageID,
                Body: SerializeEnvelope(envelope),
                ContentType: 'application/json',
                ApplicationProperties: {
                    ...envelope.Attributes,
                    [REPLAY_ATTRIBUTE]: '1',
                    ...(note ? { [REPLAY_NOTE_ATTRIBUTE]: note.slice(0, 500) } : {}),
                    ...(actorUserID ? { [REPLAYED_BY_ATTRIBUTE]: actorUserID } : {}),
                },
                ...(config.RequiresSession ? { SessionId: SessionIdFor(envelope) } : {}),
                ...(envelope.CorrelationID ? { CorrelationId: envelope.CorrelationID } : {}),
            });
            await this.gateway.CompleteDeadLetter(config.ServiceBusTopicName, config.SubscriptionName, Match.Raw.LockToken);
            settledToken = Match.Raw.LockToken;
            return { Supported: true, Changed: true };
        } finally {
            await this.restoreNonMatched(config.ServiceBusTopicName, config.SubscriptionName, Items, settledToken);
        }
    }

    public async Discard(subscription: SubscriptionBinding, deliveryID: string, _reason: string, _actorUserID: string | null): Promise<OperatorResult> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const { Items, Match } = await this.findDeadLetter(config.ServiceBusTopicName, config.SubscriptionName, deliveryID);
        let settledToken: string | undefined;
        try {
            if (Match === null) {
                return { Supported: false };
            }
            await this.gateway.CompleteDeadLetter(config.ServiceBusTopicName, config.SubscriptionName, Match.Raw.LockToken);
            settledToken = Match.Raw.LockToken;
            return { Supported: true, Changed: true };
        } finally {
            await this.restoreNonMatched(config.ServiceBusTopicName, config.SubscriptionName, Items, settledToken);
        }
    }

    private async findDeadLetter(
        topicName: string,
        subscriptionName: string,
        deliveryID: string,
    ): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
        const received = await this.gateway.ReceiveDeadLetters(
            topicName,
            subscriptionName,
            DEAD_LETTER_SCAN_LIMIT,
            DEAD_LETTER_RECEIVE_WAIT_MS,
        );
        const items = received.map(ToScannedDeadLetter);
        const match = items.find((item) => DeadLetterIdOf(item) === deliveryID) ?? null;
        return { Items: items, Match: match };
    }

    private async restoreNonMatched(
        topicName: string,
        subscriptionName: string,
        items: ScannedDeadLetter[],
        settledToken: string | undefined,
    ): Promise<void> {
        for (const item of items) {
            if (item.Raw.LockToken !== settledToken) {
                await this.gateway.AbandonDeadLetter(topicName, subscriptionName, item.Raw.LockToken);
            }
        }
    }
}
