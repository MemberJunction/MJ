import type {
    DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord, SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { ReadAzureSubscriptionConfig, type AzureSubscriptionConfig } from '../config';
import { BuildTargetedCopy } from '../consumer/copies';
import type { ServiceBusAdminGateway } from '../gateway/ServiceBusAdminGateway';
import type { ServiceBusGateway, ServiceBusReceivedEnvelope } from '../gateway/ServiceBusGateway';
import { RUNTIME_PROPERTIES } from '../properties';
import { DeadLetterIdOf, Scan, ToDeadLetterRecord, type ScannedDeadLetter } from './deadLetterRecords';

/** Peek page cap; the cursor (next SequenceNumber) continues past it. */
export const DEAD_LETTER_PEEK_LIMIT = 100;
/** Replay and discard receive from the dead-letter subqueue in batches of this size until they find their target. */
export const DEAD_LETTER_SCAN_BATCH = 50;
/** A scan gives up after this many dead letters without finding the target (a receive is destructive of order, not of messages). */
export const DEAD_LETTER_SCAN_LIMIT = 5_000;

export class AzureTransportOperator implements ITransportOperator {
    private readonly now: () => number;

    constructor(private readonly gateway: ServiceBusGateway, private readonly admin: ServiceBusAdminGateway, options: { Now?: () => number } = {}) {
        this.now = options.Now ?? Date.now;
    }

    /** Service Bus reports active and dead-lettered counts; locked (in-flight) messages are not exposed, so InFlight is 0. */
    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const counts = await this.admin.GetSubscriptionCounts(config.TopicName, config.SubscriptionName);
        if (counts === null) {
            throw new Error(`Service Bus subscription ${config.TopicName}/${config.SubscriptionName} does not exist`);
        }
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: counts.Active,
            InFlight: 0,
            DeadLettered: counts.DeadLettered,
            BlockedKeys: null,
            OldestPendingAgeSeconds: null,
            CompletedLastHour: null,
            AsOf: new Date(this.now()).toISOString(),
        };
    }

    /** Non-destructive peek of the dead-letter subqueue; the cursor is the SequenceNumber to continue from. */
    public async ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const max = Math.min(Math.max(1, pageSize), DEAD_LETTER_PEEK_LIMIT);
        const peeked = await this.gateway.Peek({ TopicName: config.TopicName, SubscriptionName: config.SubscriptionName, DeadLetter: true, FromSequenceNumber: cursor, MaxMessages: max });
        const items = peeked.map(Scan).map(ToDeadLetterRecord);
        const last = peeked[peeked.length - 1];
        const nextCursor = peeked.length === max && last ? (BigInt(last.SequenceNumber) + 1n).toString() : null;
        return { Items: items, NextCursor: nextCursor };
    }

    public async ListPartitions(_subscription: SubscriptionBinding, _condition: PartitionCondition | null, _cursor: string | null, _pageSize: number): Promise<Page<PartitionStateRecord> | null> {
        return null;
    }

    /** Re-sends the dead letter to the topic, targeted at this subscription with attempt 1 and the replay flag, then completes the dead-letter copy. */
    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const match = await this.find(config, deliveryID);
        if (match === null) {
            return { Supported: true, Changed: false };
        }
        if (match.Envelope === null) {
            await this.gateway.Abandon(match.Raw);
            return { Supported: true, Changed: false };
        }
        const extra: Record<string, string> = {
            [RUNTIME_PROPERTIES.Replay]: '1',
            ...(note ? { [RUNTIME_PROPERTIES.ReplayNote]: note.slice(0, 500) } : {}),
            ...(actorUserID ? { [RUNTIME_PROPERTIES.ReplayedBy]: actorUserID } : {}),
        };
        const copy = BuildTargetedCopy(match.Envelope, match.Raw, subscription.Policy.SubscriptionName, 1, `replay:${this.now()}`, extra);
        try {
            await this.gateway.Send(config.TopicName, [copy]);
        } catch (error) {
            await this.gateway.Abandon(match.Raw).catch(() => false);
            throw error;
        }
        await this.gateway.Complete(match.Raw);
        return { Supported: true, Changed: true };
    }

    /** Dead letters only: completes the dead-letter copy. Pending and in-flight deliveries cannot be discarded on this transport. */
    public async Discard(subscription: SubscriptionBinding, deliveryID: string, _reason: string, _actorUserID: string | null): Promise<OperatorResult> {
        const config = ReadAzureSubscriptionConfig(subscription.Config);
        const match = await this.find(config, deliveryID);
        if (match === null) {
            return { Supported: false };
        }
        await this.gateway.Complete(match.Raw);
        return { Supported: true, Changed: true };
    }

    /**
     * Receives (peek-lock) from the dead-letter subqueue until the target is found, abandoning everything else so it
     * stays where it was. Returns the locked match, or null after the scan limit.
     */
    private async find(config: AzureSubscriptionConfig, deliveryID: string): Promise<ScannedDeadLetter | null> {
        let scanned = 0;
        const seen = new Set<string>();
        while (scanned < DEAD_LETTER_SCAN_LIMIT) {
            const batch = await this.gateway.Receive({
                TopicName: config.TopicName, SubscriptionName: config.SubscriptionName, RequiresSession: false, DeadLetter: true,
                MaxMessages: DEAD_LETTER_SCAN_BATCH, WaitMs: 1_000,
            });
            if (batch.length === 0) {
                return null;
            }
            let match: ScannedDeadLetter | null = null;
            const others: ServiceBusReceivedEnvelope[] = [];
            for (const raw of batch) {
                const item = Scan(raw);
                if (match === null && DeadLetterIdOf(item) === deliveryID) {
                    match = item;
                } else {
                    others.push(raw);
                }
            }
            for (const raw of others) {
                await this.gateway.Abandon(raw);
            }
            if (match !== null) {
                return match;
            }
            // A batch made only of messages already seen means the subqueue is cycling through the same locked set.
            const fresh = batch.filter((raw) => !seen.has(raw.SequenceNumber));
            if (fresh.length === 0) {
                return null;
            }
            batch.forEach((raw) => seen.add(raw.SequenceNumber));
            scanned += batch.length;
        }
        return null;
    }
}
