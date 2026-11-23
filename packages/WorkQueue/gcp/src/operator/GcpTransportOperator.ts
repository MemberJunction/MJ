import type {
    DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord,
    SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { ReadGcpSubscriptionConfig } from '../config';
import { DEAD_LETTER_ATTRIBUTES, REPLAY_ATTRIBUTE } from '../consumer/deadLetter';
import { OrderingKeyFor, SerializeEnvelope } from '../envelope';
import type { PubSubAdminGateway } from '../gateway/PubSubAdminGateway';
import type { PubSubGateway } from '../gateway/PubSubGateway';
import {
    DEAD_LETTER_SCAN_LIMIT,
    DeadLetterIdOf,
    DistinctDeadLetters,
    RestoreDeadLetterVisibility,
    ToDeadLetterRecord,
    ToScannedDeadLetter,
    type ScannedDeadLetter,
} from './deadLetterScan';

export const REPLAY_NOTE_ATTRIBUTE = 'mj_replay_note';
export const REPLAYED_BY_ATTRIBUTE = 'mj_replayed_by';

const STRIP_DEAD_LETTER_KEYS = new Set<string>([
    DEAD_LETTER_ATTRIBUTES.Reason,
    DEAD_LETTER_ATTRIBUTES.LastError,
    DEAD_LETTER_ATTRIBUTES.Attempts,
    DEAD_LETTER_ATTRIBUTES.DeadLetteredAt,
    DEAD_LETTER_ATTRIBUTES.SourceSubscription,
    DEAD_LETTER_ATTRIBUTES.SourceMessageId,
]);

function cleanReplayAttributes(source: Record<string, string>): Record<string, string> {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(source)) {
        if (!STRIP_DEAD_LETTER_KEYS.has(k)) {
            cleaned[k] = v;
        }
    }
    return cleaned;
}

export class GcpTransportOperator implements ITransportOperator {
    private readonly now: () => number;

    constructor(
        private readonly gateway: PubSubGateway,
        private readonly admin: PubSubAdminGateway,
        options: { Now?: () => number } = {},
    ) {
        this.now = options.Now ?? Date.now;
    }

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const config = ReadGcpSubscriptionConfig(subscription.Config);
        const stats = await this.admin.GetSubscriptionStats(config.SubscriptionName, config.DeadLetterSubscriptionName);
        if (stats === null) {
            throw new Error(`Google Cloud Pub/Sub subscription ${config.SubscriptionName} does not exist`);
        }
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: stats.UndeliveredMessageCount,
            InFlight: 0,
            DeadLettered: stats.DeadLetterMessageCount,
            BlockedKeys: null,
            OldestPendingAgeSeconds: null,
            CompletedLastHour: null,
            AsOf: new Date(this.now()).toISOString(),
        };
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, _cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        const config = ReadGcpSubscriptionConfig(subscription.Config);
        if (!config.DeadLetterSubscriptionName) {
            return { Items: [], NextCursor: null };
        }
        const limit = Math.min(Math.max(1, Math.floor(pageSize)), DEAD_LETTER_SCAN_LIMIT);
        const pulled = await this.gateway.PullDeadLetters(config.DeadLetterSubscriptionName, limit);
        const items = pulled.map(ToScannedDeadLetter);
        await RestoreDeadLetterVisibility(this.gateway, config.DeadLetterSubscriptionName, items);
        return {
            Items: DistinctDeadLetters(items).map(ToDeadLetterRecord),
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
        const config = ReadGcpSubscriptionConfig(subscription.Config);
        if (!config.DeadLetterSubscriptionName) {
            return { Supported: false };
        }
        const { Items, Match } = await this.findDeadLetter(config.DeadLetterSubscriptionName, deliveryID);
        let ackedToken: string | undefined;
        try {
            if (Match === null || Match.Envelope === null) {
                return { Supported: true, Changed: false };
            }
            const envelope = Match.Envelope;
            await this.gateway.Publish(config.TopicName, {
                MessageId: envelope.MessageID,
                Data: SerializeEnvelope(envelope),
                Attributes: {
                    ...cleanReplayAttributes(envelope.Attributes),
                    [REPLAY_ATTRIBUTE]: '1',
                    ...(note ? { [REPLAY_NOTE_ATTRIBUTE]: note.slice(0, 500) } : {}),
                    ...(actorUserID ? { [REPLAYED_BY_ATTRIBUTE]: actorUserID } : {}),
                },
                ...(config.EnableMessageOrdering ? { OrderingKey: OrderingKeyFor(envelope) } : {}),
            });
            await this.gateway.AcknowledgeDeadLetter(config.DeadLetterSubscriptionName, Match.Raw.AckId);
            ackedToken = Match.Raw.AckId;
            return { Supported: true, Changed: true };
        } finally {
            await RestoreDeadLetterVisibility(this.gateway, config.DeadLetterSubscriptionName, Items, ackedToken);
        }
    }

    public async Discard(subscription: SubscriptionBinding, deliveryID: string, _reason: string, _actorUserID: string | null): Promise<OperatorResult> {
        const config = ReadGcpSubscriptionConfig(subscription.Config);
        if (!config.DeadLetterSubscriptionName) {
            return { Supported: false };
        }
        const { Items, Match } = await this.findDeadLetter(config.DeadLetterSubscriptionName, deliveryID);
        let ackedToken: string | undefined;
        try {
            if (Match === null) {
                return { Supported: false };
            }
            await this.gateway.AcknowledgeDeadLetter(config.DeadLetterSubscriptionName, Match.Raw.AckId);
            ackedToken = Match.Raw.AckId;
            return { Supported: true, Changed: true };
        } finally {
            await RestoreDeadLetterVisibility(this.gateway, config.DeadLetterSubscriptionName, Items, ackedToken);
        }
    }

    private async findDeadLetter(
        dlqSubName: string,
        deliveryID: string,
    ): Promise<{ Items: ScannedDeadLetter[]; Match: ScannedDeadLetter | null }> {
        const pulled = await this.gateway.PullDeadLetters(dlqSubName, DEAD_LETTER_SCAN_LIMIT);
        const items = pulled.map(ToScannedDeadLetter);
        const match = items.find((item) => DeadLetterIdOf(item) === deliveryID) ?? null;
        return { Items: items, Match: match };
    }
}
