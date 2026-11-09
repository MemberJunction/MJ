import { UUIDsEqual } from '@memberjunction/global';
import { CanonicalEnvelope, MatchesFilter } from '@memberjunction/work-queue-core';
import type { PartitionMode, PublishResult, SubscriptionBinding, WorkMessage } from '@memberjunction/work-queue-core';
import { Duplicate, Rejected } from '../../publish/publishResults';
import type { DeliveryInsertRow, ExistingMessageRow, MessageInsertRow } from '../../sql/rows';
import { ReadSubscriptionIDs } from './bindingIds';
import { MessageFromColumns } from './rowMapping';

export interface PlannedDelivery {
    SubscriptionID: string;
    PartitionMode: PartitionMode;
}

export interface DeliveryPlan {
    Deliveries: PlannedDelivery[];
    /** A keyed message with a matching Ordered subscription: ordinals must commit in key order (03 §7 "Publish order"). */
    NeedsPublishOrderLock: boolean;
}

export function BuildDeliveryPlan(message: WorkMessage, subscriptions: SubscriptionBinding[]): DeliveryPlan {
    const matched = subscriptions.filter(s => MatchesFilter(s.Filter, message.Attributes));
    const deliveries = matched.map(s => ({ SubscriptionID: ReadSubscriptionIDs(s).SubscriptionID, PartitionMode: s.Policy.PartitionMode }));
    return {
        Deliveries: deliveries,
        NeedsPublishOrderLock: message.PartitionKey !== undefined && deliveries.some(d => d.PartitionMode === 'Ordered'),
    };
}

/** Distinct partition keys that need a publish-order lock, in sorted (code-point) order so every publisher locks alike. */
export function PublishOrderKeys(messages: WorkMessage[], subscriptions: SubscriptionBinding[]): string[] {
    const keys = new Set<string>();
    for (const message of messages) {
        if (message.PartitionKey !== undefined && BuildDeliveryPlan(message, subscriptions).NeedsPublishOrderLock) {
            keys.add(message.PartitionKey);
        }
    }
    return [...keys].sort();
}

/** PublishedAt is not part of the row: the database clock supplies it (03 §6.4). */
export function ToMessageInsertRow(message: WorkMessage, topicID: string, userID: string | null): MessageInsertRow {
    return {
        ID: message.MessageID,
        TopicID: topicID,
        PartitionKey: message.PartitionKey ?? null,
        AttributesJSON: JSON.stringify(message.Attributes),
        PayloadJSON: message.Payload === undefined ? null : JSON.stringify(message.Payload),
        PayloadRefJSON: message.PayloadRef === undefined ? null : JSON.stringify(message.PayloadRef),
        CorrelationID: message.CorrelationID ?? null,
        PublishedByUserID: userID,
    };
}

export function ToDeliveryRows(message: WorkMessage, plan: DeliveryPlan, publishOrdinal: number): DeliveryInsertRow[] {
    return plan.Deliveries.map(d => ({
        MessageID: message.MessageID,
        SubscriptionID: d.SubscriptionID,
        PartitionKey: d.PartitionMode === 'None' ? null : message.PartitionKey ?? null,
        OrderKey: publishOrdinal,
    }));
}

/**
 * A message with this MessageID is already stored (03 §2.1, F10 — MessageID is globally unique). Same topic and same
 * canonical envelope → Duplicate; anything else → MessageIDConflict. `existing` is undefined when the conflicting row
 * was not visible to the follow-up read (purged in between): the caller retries.
 */
export function ResolveExistingMessage(existing: ExistingMessageRow | undefined, message: WorkMessage, topicID: string): PublishResult {
    if (!existing) {
        return Rejected(message.MessageID, 'TransportUnavailable', 'The message insert found a conflicting MessageID that is no longer visible; retry', true);
    }
    const stored = MessageFromColumns({
        MessageID: existing.ID, PartitionKey: existing.PartitionKey, Attributes: existing.Attributes, Payload: existing.Payload,
        PayloadRef: existing.PayloadRef, CorrelationID: existing.CorrelationID, PublishedAt: new Date(0),
    }, message.Topic);
    const same = UUIDsEqual(existing.TopicID, topicID) && CanonicalEnvelope(stored) === CanonicalEnvelope(message);
    return same
        ? Duplicate(message.MessageID)
        : Rejected(message.MessageID, 'MessageIDConflict', `MessageID ${message.MessageID} was already published with a different envelope or topic`, false);
}
