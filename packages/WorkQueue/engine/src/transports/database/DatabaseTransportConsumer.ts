import type {
    DeliveryStatus, ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkProgress,
} from '@memberjunction/work-queue-core';
import { CANDIDATE_OVERSCAN, IN_FLIGHT_PARTITION_INDEX } from '../../constants';
import type { ClaimedDeliveryRow, ClaimPartitionMode, ExpiredDeadLetterRow, LeaseStateRow, PartitionCandidateRow } from '../../sql/rows';
import { ErrorText, ExecuteRows, ExecuteWrite, IsUniqueViolation, ToBoolean, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueExecutorSource } from '../../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../OwnedExecutor';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadSubscriptionIDs } from './bindingIds';
import type { DatabaseSubscriptionIDs } from './bindingIds';
import { MessageFromColumns, NormalizeRowID, SerializeProgress } from './rowMapping';

/**
 * The Database transport's consumer (03 §7, §11). It owns one independent executor, never runs a statement on the
 * shared source, and never opens a transaction: every claim, heartbeat and settle is a single guarded procedure call.
 */
export class DatabaseTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly ids: DatabaseSubscriptionIDs;
    private readonly owned: OwnedExecutor;

    constructor(
        source: WorkQueueExecutorSource,
        private readonly sql: WorkQueueSqlBuilder,
        private readonly binding: SubscriptionBinding,
        private readonly deps: TransportDriverDeps,
        private readonly leaseOwner: string,
    ) {
        this.ids = ReadSubscriptionIDs(binding);
        this.owned = new OwnedExecutor(source);
    }

    /** One claim cycle. The Database consumer never long-polls, so waitSeconds is ignored; the runtime's idle backoff paces it. */
    public async Receive(max: number, _waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        if (signal.aborted || max <= 0) {
            return [];
        }
        const policy = this.binding.Policy;
        await this.expireLeases();
        const claimed: ClaimedDeliveryRow[] = policy.PartitionMode === 'None' ? [] : await this.claimPartitioned(max, signal);
        if (claimed.length < max && !signal.aborted) {
            const keyless = await this.rows<ClaimedDeliveryRow>(
                this.sql.Consume.ClaimUnpartitioned(this.ids.SubscriptionID, this.leaseOwner, policy.LeaseSeconds, max - claimed.length));
            claimed.push(...keyless);
        }
        return claimed.map(row => this.toDelivery(row));
    }

    /** 'Held' | 'Lost' | 'Cancelled' (03 §7). A thrown error is transient: the runtime retries on its next tick. */
    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<LeaseExtension> {
        const progressJSON = progress === undefined ? null : SerializeProgress(progress);
        const count = await this.write(this.sql.Consume.ExtendLease(delivery.DeliveryID, delivery.LeaseToken, leaseSeconds, progressJSON));
        if (count === 1) {
            return 'Held';
        }
        const state = await this.rows<LeaseStateRow>(this.sql.Consume.SelectLeaseState(delivery.DeliveryID, delivery.LeaseToken));
        return state.length > 0 && ToBoolean(state[0].CancelRequested) ? 'Cancelled' : 'Lost';
    }

    public Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settleWrite(delivery, 'Completed', this.sql.Consume.CompleteDelivery(delivery.DeliveryID, delivery.LeaseToken));
    }

    public Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult> {
        return this.settleWrite(delivery, 'Pending',
            this.sql.Consume.RetryDelivery(delivery.DeliveryID, delivery.LeaseToken, Math.max(0, Math.round(delaySeconds)), error));
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        const result = await this.settleWrite(delivery, 'DeadLettered',
            this.sql.Consume.DeadLetterDelivery(delivery.DeliveryID, delivery.LeaseToken, reason, error));
        if (result.Kind === 'Settled') {
            this.deps.NotifyDeadLettered?.({
                SubscriptionName: this.binding.Policy.SubscriptionName, DeliveryID: delivery.DeliveryID,
                Reason: reason, PartitionKey: delivery.Message.PartitionKey ?? null,
            });
        }
        return result;
    }

    public Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settleWrite(delivery, 'Pending', this.sql.Consume.ReleaseDelivery(delivery.DeliveryID, delivery.LeaseToken));
    }

    /** The cancelled delivery becomes Discarded now, freeing its key; anything else is LeaseLost with no change (03 §5). */
    public AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.settleWrite(delivery, 'Discarded', this.sql.Consume.AcknowledgeCancel(delivery.DeliveryID, delivery.LeaseToken));
    }

    /** Releases the consumer's independent executor (03 §11). */
    public Close(): Promise<void> {
        return this.owned.Release();
    }

    private async expireLeases(): Promise<void> {
        const policy = this.binding.Policy;
        const expired = await this.rows<ExpiredDeadLetterRow>(this.sql.Consume.ExpireLeases(this.ids.SubscriptionID, policy.MaxAttempts));
        for (const row of expired) {
            this.deps.NotifyDeadLettered?.({
                SubscriptionName: policy.SubscriptionName, DeliveryID: row.DeliveryID, Reason: row.Reason, PartitionKey: row.PartitionKey,
            });
        }
    }

    private async claimPartitioned(max: number, signal: AbortSignal): Promise<ClaimedDeliveryRow[]> {
        const mode: ClaimPartitionMode = this.binding.Policy.PartitionMode === 'Ordered' ? 'Ordered' : 'Exclusive';
        const candidates = await this.rows<PartitionCandidateRow>(
            this.sql.Consume.SelectPartitionCandidates(this.ids.SubscriptionID, mode, max * CANDIDATE_OVERSCAN));
        const claimed: ClaimedDeliveryRow[] = [];
        for (const candidate of FirstPerKey(candidates)) {
            if (claimed.length >= max || signal.aborted) {
                break;
            }
            const row = await this.tryClaimCandidate(candidate, mode);
            if (row) {
                claimed.push(row);
            }
        }
        return claimed;
    }

    /** A unique violation on the in-flight index means another worker won this key: skip the candidate, keep the batch. */
    private async tryClaimCandidate(candidate: PartitionCandidateRow, mode: ClaimPartitionMode): Promise<ClaimedDeliveryRow | null> {
        try {
            const rows = await this.rows<ClaimedDeliveryRow>(
                this.sql.Consume.ClaimPartitionCandidate(this.ids.SubscriptionID, candidate.DeliveryID, mode, this.leaseOwner, this.binding.Policy.LeaseSeconds));
            return rows[0] ?? null;
        } catch (error) {
            if (IsUniqueViolation(error, IN_FLIGHT_PARTITION_INDEX)) {
                return null;
            }
            throw error;
        }
    }

    private async settleWrite(delivery: ReceivedDelivery<TPayload>, status: DeliveryStatus, statement: SqlStatement): Promise<SettleResult> {
        try {
            const count = await this.write(statement);
            return count === 1
                ? { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status }
                : { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ErrorText(error) };
        }
    }

    private async rows<T>(statement: SqlStatement): Promise<T[]> {
        return ExecuteRows<T>(await this.owned.Get(), statement, this.deps.ContextUser);
    }

    private async write(statement: SqlStatement): Promise<number> {
        return ExecuteWrite(await this.owned.Get(), statement, this.deps.ContextUser);
    }

    private toDelivery(row: ClaimedDeliveryRow): ReceivedDelivery<TPayload> {
        return {
            Message: MessageFromColumns<TPayload>(row, this.binding.Policy.TopicName),
            DeliveryID: NormalizeRowID(row.DeliveryID),
            LeaseToken: NormalizeRowID(row.LeaseToken),
            Attempt: ToNumber(row.AttemptCount) ?? 1,
            IsReplay: ToBoolean(row.IsReplay),
            LeaseExpiresAt: row.LeaseExpiresAt instanceof Date ? row.LeaseExpiresAt : new Date(row.LeaseExpiresAt),
        };
    }
}

/** 03 §7: at most one row per partition key within one claim batch. Candidates arrive oldest first. */
function FirstPerKey(candidates: PartitionCandidateRow[]): PartitionCandidateRow[] {
    const seen = new Set<string>();
    return candidates.filter(candidate => {
        if (seen.has(candidate.PartitionKey)) {
            return false;
        }
        seen.add(candidate.PartitionKey);
        return true;
    });
}
