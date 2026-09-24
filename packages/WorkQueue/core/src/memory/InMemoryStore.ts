import type { WorkMessage } from '../envelope';
import { MatchesFilter } from '../filter';
import type { WorkProgress } from '../handler';
import type { DeadLetterRecord, Page, PartitionCondition, PartitionStateRecord, SubscriptionStats } from '../operator';
import type { DeliveryStatus, SubscriptionPolicy } from '../policy';
import { PublishErrorCodes, RejectedPublishResult } from '../publishing';
import type { PublishResult } from '../publishing';
import type { LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, TopicBinding } from '../transport';
import { CanonicalEnvelope } from '../validation';

export const LEASE_EXPIRED_REASON = 'LeaseExpired';
/** Matches WorkQueueDelivery.ResolutionNote nvarchar(1000). */
export const MAX_RESOLUTION_NOTE_LENGTH = 1000;

export interface DeliveryHandle {
    DeliveryID: string;
    LeaseToken: string;
}

/** Discard of an InFlight delivery asks its holder to stop instead of settling it (spec 03 §7). */
export interface DiscardResult {
    Changed: boolean;
    CancelRequested: boolean;
}

export interface InMemoryDeliverySnapshot {
    DeliveryID: string;
    MessageID: string;
    Status: DeliveryStatus;
    PartitionKey: string | null;
    OrderKey: number;
    AttemptCount: number;
    IsReplay: boolean;
    CancelRequested: boolean;
    ResolutionNote: string | null;
}

interface StoredMessage {
    Message: WorkMessage;
    TopicName: string;
    Canonical: string;
    Ordinal: number;
}

interface StoredDelivery {
    ID: string;
    MessageKey: string;
    SubscriptionName: string;
    Status: DeliveryStatus;
    PartitionKey: string | null;
    /** Always the message's publish ordinal (spec 03 §6.5). */
    OrderKey: number;
    AttemptCount: number;
    IsReplay: boolean;
    CreatedAtMs: number;
    VisibleAtMs: number;
    LeaseToken: string | null;
    LeaseExpiresAtMs: number | null;
    LastHeartbeatAtMs: number | null;
    Progress: WorkProgress | null;
    LastError: string | null;
    DeadLetterReason: string | null;
    DeadLetteredAtMs: number | null;
    CompletedAtMs: number | null;
    CancelRequestedAtMs: number | null;
    ResolvedByUserID: string | null;
    ResolutionNote: string | null;
}

const UNFINISHED: ReadonlySet<DeliveryStatus> = new Set<DeliveryStatus>(['Pending', 'InFlight', 'DeadLettered']);
const ONE_HOUR_MS = 3_600_000;

/**
 * State and rules of the in-memory transport (spec 03 §7). Everything about a partition — single flight,
 * head-of-line, blocking — is derived from the delivery rows. Not thread-safe; single process only.
 */
export class InMemoryStore {
    /** Keyed by lower-cased MessageID alone: a MessageID is globally unique, not per topic (F10). */
    private readonly messages = new Map<string, StoredMessage>();
    private readonly deliveries = new Map<string, StoredDelivery>();
    private readonly bindings = new Map<string, SubscriptionBinding>();
    private ordinal = 0;

    constructor(
        private readonly now: () => number,
        private readonly newId: () => string,
    ) {}

    public RegisterBinding(binding: SubscriptionBinding): void {
        this.bindings.set(binding.Policy.SubscriptionName, binding);
    }

    public Publish(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[]): PublishResult[] {
        subscriptions.forEach((subscription) => this.RegisterBinding(subscription));
        return messages.map((message) => this.publishOne(topic, message, subscriptions));
    }

    public Claim(binding: SubscriptionBinding, max: number): ReceivedDelivery[] {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        this.ExpireLeases(policy.SubscriptionName);
        const now = this.now();
        const claimed: ReceivedDelivery[] = [];
        for (const delivery of this.visiblePending(policy.SubscriptionName, now)) {
            if (claimed.length >= max) {
                break;
            }
            // Leasing marks the key in flight, so a second delivery of the same key fails this check: one receive
            // never returns two deliveries of one key, and an Ordered head is never skipped for a later one.
            if (this.isClaimable(policy, delivery)) {
                claimed.push(this.lease(policy, delivery, now));
            }
        }
        return claimed;
    }

    public ExpireLeases(subscriptionName?: string): number {
        const now = this.now();
        let expired = 0;
        for (const delivery of this.deliveries.values()) {
            const due = delivery.Status === 'InFlight' && delivery.LeaseExpiresAtMs !== null && delivery.LeaseExpiresAtMs < now;
            if (!due || (subscriptionName !== undefined && delivery.SubscriptionName !== subscriptionName)) {
                continue;
            }
            clearLease(delivery);
            expired += 1;
            if (delivery.CancelRequestedAtMs !== null) {
                // The holder never acknowledged (it is dead): a cancelled delivery is discarded, never retried.
                delivery.Status = 'Discarded';
                delivery.CompletedAtMs = now;
                continue;
            }
            delivery.LastError = LEASE_EXPIRED_REASON;
            if (delivery.AttemptCount < this.policyOf(delivery.SubscriptionName).MaxAttempts) {
                delivery.Status = 'Pending';
                delivery.VisibleAtMs = now;
            } else {
                delivery.Status = 'DeadLettered';
                delivery.DeadLetterReason = LEASE_EXPIRED_REASON;
                delivery.DeadLetteredAtMs = now;
            }
        }
        return expired;
    }

    public ExtendLease(handle: DeliveryHandle, leaseSeconds: number, progress?: WorkProgress): LeaseExtension {
        const delivery = this.held(handle);
        if (delivery === null) {
            return this.heldButCancelled(handle) === null ? 'Lost' : 'Cancelled';
        }
        const now = this.now();
        delivery.LeaseExpiresAtMs = now + leaseSeconds * 1000;
        delivery.LastHeartbeatAtMs = now;
        if (progress !== undefined) {
            delivery.Progress = structuredClone(progress);
        }
        return 'Held';
    }

    public Complete(handle: DeliveryHandle): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'Completed';
        delivery.CompletedAtMs = this.now();
        return settled(delivery);
    }

    public Retry(handle: DeliveryHandle, delaySeconds: number, error: string): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'Pending';
        delivery.VisibleAtMs = this.now() + Math.max(0, delaySeconds) * 1000;
        delivery.LastError = error;
        return settled(delivery);
    }

    public DeadLetter(handle: DeliveryHandle, reason: string, error: string | null): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'DeadLettered';
        delivery.DeadLetterReason = reason;
        delivery.DeadLetteredAtMs = this.now();
        delivery.LastError = error;
        return settled(delivery);
    }

    public Release(handle: DeliveryHandle): SettleResult {
        const delivery = this.held(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'Pending';
        delivery.AttemptCount = Math.max(0, delivery.AttemptCount - 1);
        delivery.VisibleAtMs = this.now();
        return settled(delivery);
    }

    /** The one holder write that succeeds after a cancel: token-fenced, InFlight, cancel requested → Discarded now. */
    public AcknowledgeCancel(handle: DeliveryHandle): SettleResult {
        const delivery = this.heldButCancelled(handle);
        if (delivery === null) {
            return lost(handle);
        }
        clearLease(delivery);
        delivery.Status = 'Discarded';
        delivery.CompletedAtMs = this.now();
        return settled(delivery);
    }

    public Stats(binding: SubscriptionBinding): SubscriptionStats {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        const now = this.now();
        const own = this.deliveriesOf(policy.SubscriptionName);
        const pending = own.filter((delivery) => delivery.Status === 'Pending');
        const oldest = pending.reduce<number | null>((min, delivery) => (min === null || delivery.CreatedAtMs < min ? delivery.CreatedAtMs : min), null);
        return {
            SubscriptionName: policy.SubscriptionName,
            Pending: pending.length,
            InFlight: own.filter((delivery) => delivery.Status === 'InFlight').length,
            DeadLettered: own.filter((delivery) => delivery.Status === 'DeadLettered').length,
            BlockedKeys: policy.PartitionMode === 'Ordered' ? this.blockedKeyCount(policy.SubscriptionName) : null,
            OldestPendingAgeSeconds: oldest === null ? null : Math.floor((now - oldest) / 1000),
            CompletedLastHour: own.filter((delivery) => delivery.Status === 'Completed' && (delivery.CompletedAtMs ?? 0) >= now - ONE_HOUR_MS).length,
            AsOf: new Date(now).toISOString(),
        };
    }

    public DeadLetters(binding: SubscriptionBinding, cursor: string | null, pageSize: number): Page<DeadLetterRecord> {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        const records = this.deliveriesOf(policy.SubscriptionName)
            .filter((delivery) => delivery.Status === 'DeadLettered')
            .sort((a, b) => (a.DeadLetteredAtMs ?? 0) - (b.DeadLetteredAtMs ?? 0) || a.OrderKey - b.OrderKey)
            .map((delivery) => this.deadLetterRecord(policy, delivery));
        return paginate(records, cursor, pageSize);
    }

    public Partitions(binding: SubscriptionBinding, condition: PartitionCondition | null, cursor: string | null, pageSize: number): Page<PartitionStateRecord> {
        this.RegisterBinding(binding);
        const policy = binding.Policy;
        const records = this.partitionKeys(policy.SubscriptionName)
            .map((key) => this.partitionRecord(policy, key))
            .filter((record) => (condition === null ? record.Condition !== 'Idle' : record.Condition === condition));
        return paginate(records, cursor, pageSize);
    }

    public Replay(binding: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): boolean {
        const delivery = this.ownDelivery(binding, deliveryID);
        if (delivery === null || delivery.Status !== 'DeadLettered') {
            return false;
        }
        // The delivery keeps its OrderKey, so an Ordered head keeps its place (spec 03 §7).
        delivery.Status = 'Pending';
        delivery.AttemptCount = 0;
        delivery.IsReplay = true;
        delivery.VisibleAtMs = this.now();
        delivery.DeadLetterReason = null;
        delivery.DeadLetteredAtMs = null;
        delivery.ResolvedByUserID = actorUserID;
        delivery.ResolutionNote = note === null ? null : truncateNote(note);
        return true;
    }

    public Discard(binding: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): DiscardResult {
        const delivery = this.ownDelivery(binding, deliveryID);
        if (delivery === null) {
            return { Changed: false, CancelRequested: false };
        }
        if (delivery.Status === 'InFlight') {
            if (delivery.CancelRequestedAtMs !== null) {
                return { Changed: false, CancelRequested: true };
            }
            // Status and LeaseToken stay as they are: the flag alone fences every settle except AcknowledgeCancel,
            // and keeping the token lets the holder acknowledge and free the key at once (spec 03 §7, F2).
            delivery.CancelRequestedAtMs = this.now();
            delivery.ResolvedByUserID = actorUserID;
            delivery.ResolutionNote = truncateNote(reason);
            return { Changed: true, CancelRequested: true };
        }
        if (delivery.Status !== 'Pending' && delivery.Status !== 'DeadLettered') {
            return { Changed: false, CancelRequested: false };
        }
        delivery.Status = 'Discarded';
        delivery.CompletedAtMs = this.now();
        delivery.ResolvedByUserID = actorUserID;
        delivery.ResolutionNote = truncateNote(reason);
        return { Changed: true, CancelRequested: false };
    }

    /** The sweeper's job in memory: expire leases everywhere. */
    public RunSweep(): { ExpiredLeases: number } {
        return { ExpiredLeases: this.ExpireLeases() };
    }

    public Snapshot(subscriptionName: string): InMemoryDeliverySnapshot[] {
        return this.deliveriesOf(subscriptionName)
            .sort(byOrder)
            .map((delivery) => ({
                DeliveryID: delivery.ID,
                MessageID: this.messageOf(delivery).MessageID,
                Status: delivery.Status,
                PartitionKey: delivery.PartitionKey,
                OrderKey: delivery.OrderKey,
                AttemptCount: delivery.AttemptCount,
                IsReplay: delivery.IsReplay,
                CancelRequested: delivery.CancelRequestedAtMs !== null,
                ResolutionNote: delivery.ResolutionNote,
            }));
    }

    private publishOne(topic: TopicBinding, message: WorkMessage, subscriptions: SubscriptionBinding[]): PublishResult {
        const messageKey = message.MessageID.toLowerCase();
        const canonical = CanonicalEnvelope(message);
        const existing = this.messages.get(messageKey);
        if (existing !== undefined) {
            return existing.TopicName === topic.TopicName && existing.Canonical === canonical
                ? { MessageID: message.MessageID, Status: 'Duplicate' }
                : RejectedPublishResult(message.MessageID, PublishErrorCodes.MessageIDConflict, `MessageID ${message.MessageID} was already published with a different envelope or topic`);
        }
        this.ordinal += 1;
        const stored: StoredMessage = { Message: structuredClone(message), TopicName: topic.TopicName, Canonical: canonical, Ordinal: this.ordinal };
        this.messages.set(messageKey, stored);
        for (const subscription of subscriptions) {
            if (MatchesFilter(subscription.Filter, message.Attributes)) {
                this.createDelivery(subscription.Policy, messageKey, stored);
            }
        }
        return { MessageID: message.MessageID, Status: 'Accepted' };
    }

    private createDelivery(policy: SubscriptionPolicy, messageKey: string, stored: StoredMessage): void {
        const now = this.now();
        const delivery: StoredDelivery = {
            ID: this.newId(),
            MessageKey: messageKey,
            SubscriptionName: policy.SubscriptionName,
            Status: 'Pending',
            PartitionKey: policy.PartitionMode !== 'None' ? stored.Message.PartitionKey ?? null : null,
            OrderKey: stored.Ordinal,
            AttemptCount: 0,
            IsReplay: false,
            CreatedAtMs: now,
            VisibleAtMs: now,
            LeaseToken: null,
            LeaseExpiresAtMs: null,
            LastHeartbeatAtMs: null,
            Progress: null,
            LastError: null,
            DeadLetterReason: null,
            DeadLetteredAtMs: null,
            CompletedAtMs: null,
            CancelRequestedAtMs: null,
            ResolvedByUserID: null,
            ResolutionNote: null,
        };
        this.deliveries.set(delivery.ID, delivery);
    }

    private visiblePending(subscriptionName: string, now: number): StoredDelivery[] {
        return this.deliveriesOf(subscriptionName)
            .filter((delivery) => delivery.Status === 'Pending' && delivery.VisibleAtMs <= now && delivery.CancelRequestedAtMs === null)
            .sort(byOrder);
    }

    private isClaimable(policy: SubscriptionPolicy, delivery: StoredDelivery): boolean {
        const key = delivery.PartitionKey;
        if (policy.PartitionMode === 'None' || key === null) {
            return true;
        }
        if (this.hasInFlight(policy.SubscriptionName, key)) {
            return false;
        }
        if (policy.PartitionMode === 'Exclusive') {
            return true;
        }
        return this.headOf(policy.SubscriptionName, key)?.ID === delivery.ID;
    }

    private lease(policy: SubscriptionPolicy, delivery: StoredDelivery, now: number): ReceivedDelivery {
        const leaseExpiresAtMs = now + policy.LeaseSeconds * 1000;
        const leaseToken = this.newId();
        delivery.Status = 'InFlight';
        delivery.AttemptCount += 1;
        delivery.LeaseToken = leaseToken;
        delivery.LeaseExpiresAtMs = leaseExpiresAtMs;
        delivery.LastHeartbeatAtMs = null;
        return {
            Message: structuredClone(this.messageOf(delivery)),
            DeliveryID: delivery.ID,
            LeaseToken: leaseToken,
            Attempt: delivery.AttemptCount,
            IsReplay: delivery.IsReplay,
            LeaseExpiresAt: new Date(leaseExpiresAtMs),
        };
    }

    private partitionRecord(policy: SubscriptionPolicy, key: string): PartitionStateRecord {
        const name = policy.SubscriptionName;
        const head = this.headOf(name, key);
        return {
            PartitionKey: key,
            Condition: this.conditionOf(policy, key, head),
            HeadDeliveryID: head?.ID ?? null,
            WaitingItems: this.deliveriesOf(name).filter((delivery) => delivery.PartitionKey === key && delivery.Status === 'Pending').length,
        };
    }

    private conditionOf(policy: SubscriptionPolicy, key: string, head: StoredDelivery | null): PartitionCondition {
        if (this.hasInFlight(policy.SubscriptionName, key)) {
            return 'InFlight';
        }
        if (policy.PartitionMode === 'Ordered' && head?.Status === 'DeadLettered') {
            return 'Blocked';
        }
        return 'Idle';
    }

    private deadLetterRecord(policy: SubscriptionPolicy, delivery: StoredDelivery): DeadLetterRecord {
        const message = this.messageOf(delivery);
        const blocksKey = policy.PartitionMode === 'Ordered' && delivery.PartitionKey !== null && this.headOf(policy.SubscriptionName, delivery.PartitionKey)?.ID === delivery.ID;
        return {
            DeliveryID: delivery.ID,
            Message: structuredClone(message),
            PartitionKey: message.PartitionKey ?? null,
            Attempts: delivery.AttemptCount,
            Reason: delivery.DeadLetterReason ?? 'Unknown',
            LastError: delivery.LastError,
            DeadLetteredAt: delivery.DeadLetteredAtMs === null ? null : new Date(delivery.DeadLetteredAtMs).toISOString(),
            BlocksKey: blocksKey,
        };
    }

    private partitionKeys(subscriptionName: string): string[] {
        const keys = new Set<string>();
        for (const delivery of this.deliveriesOf(subscriptionName)) {
            if (delivery.PartitionKey !== null) {
                keys.add(delivery.PartitionKey);
            }
        }
        return [...keys].sort();
    }

    private blockedKeyCount(subscriptionName: string): number {
        return this.partitionKeys(subscriptionName).filter((key) => this.headOf(subscriptionName, key)?.Status === 'DeadLettered').length;
    }

    private headOf(subscriptionName: string, key: string): StoredDelivery | null {
        const unfinished = this.deliveriesOf(subscriptionName).filter((delivery) => delivery.PartitionKey === key && UNFINISHED.has(delivery.Status));
        return unfinished.sort(byOrder)[0] ?? null;
    }

    private hasInFlight(subscriptionName: string, key: string): boolean {
        return this.deliveriesOf(subscriptionName).some((delivery) => delivery.PartitionKey === key && delivery.Status === 'InFlight');
    }

    /** Guard of every ordinary holder write: InFlight, this token, and no cancel request. */
    private held(handle: DeliveryHandle): StoredDelivery | null {
        const delivery = this.tokenHolder(handle);
        return delivery !== null && delivery.CancelRequestedAtMs === null ? delivery : null;
    }

    /** Guard of AcknowledgeCancel: InFlight, this token, and a cancel request. */
    private heldButCancelled(handle: DeliveryHandle): StoredDelivery | null {
        const delivery = this.tokenHolder(handle);
        return delivery !== null && delivery.CancelRequestedAtMs !== null ? delivery : null;
    }

    private tokenHolder(handle: DeliveryHandle): StoredDelivery | null {
        const delivery = this.deliveries.get(handle.DeliveryID);
        return delivery !== undefined && delivery.Status === 'InFlight' && delivery.LeaseToken === handle.LeaseToken ? delivery : null;
    }

    private ownDelivery(binding: SubscriptionBinding, deliveryID: string): StoredDelivery | null {
        this.RegisterBinding(binding);
        const delivery = this.deliveries.get(deliveryID);
        return delivery !== undefined && delivery.SubscriptionName === binding.Policy.SubscriptionName ? delivery : null;
    }

    private deliveriesOf(subscriptionName: string): StoredDelivery[] {
        return [...this.deliveries.values()].filter((delivery) => delivery.SubscriptionName === subscriptionName);
    }

    private messageOf(delivery: StoredDelivery): WorkMessage {
        const stored = this.messages.get(delivery.MessageKey);
        if (stored === undefined) {
            throw new Error(`InMemoryStore is missing message ${delivery.MessageKey}`);
        }
        return stored.Message;
    }

    private policyOf(subscriptionName: string): SubscriptionPolicy {
        const binding = this.bindings.get(subscriptionName);
        if (binding === undefined) {
            throw new Error(`Subscription '${subscriptionName}' is not registered with this InMemoryTransport`);
        }
        return binding.Policy;
    }
}

function byOrder(a: StoredDelivery, b: StoredDelivery): number {
    return a.OrderKey - b.OrderKey;
}

function clearLease(delivery: StoredDelivery): void {
    delivery.LeaseToken = null;
    delivery.LeaseExpiresAtMs = null;
}

function settled(delivery: StoredDelivery): SettleResult {
    return { Kind: 'Settled', DeliveryID: delivery.ID, Status: delivery.Status };
}

function lost(handle: DeliveryHandle): SettleResult {
    return { Kind: 'LeaseLost', DeliveryID: handle.DeliveryID };
}

function truncateNote(text: string): string {
    return text.length <= MAX_RESOLUTION_NOTE_LENGTH ? text : text.slice(0, MAX_RESOLUTION_NOTE_LENGTH);
}

function paginate<T>(items: T[], cursor: string | null, pageSize: number): Page<T> {
    const parsed = cursor === null ? 0 : Number.parseInt(cursor, 10);
    const offset = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const end = offset + Math.max(1, pageSize);
    return { Items: items.slice(offset, end), NextCursor: end < items.length ? String(end) : null };
}
