import type { UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { DEDUP_RESERVATION_SECONDS, DEDUPLICATION_KEY_INDEX } from '../constants';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { ReservationRow } from '../sql/rows';
import { ExecuteRows, ExecuteWrite, IsUniqueViolation } from '../sql/sqlExecution';
import type { PublishSqlBuilder } from '../sql/WorkQueueSqlBuilder';
import type { WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';

/** 03 §11. Only `Duplicate` means "a publish with this key already succeeded". */
export type LedgerReservation =
    | { Kind: 'Reserved' }                                  // new, expired-and-replaced, or re-taken by the same MessageID
    | { Kind: 'Duplicate'; OwnerMessageID: string }         // a Confirmed, unexpired row
    | { Kind: 'Pending'; OwnerMessageID: string };          // Reserved, unexpired, owned by a different MessageID

const RESERVE_ATTEMPTS = 3;

/**
 * The publish deduplication ledger (03 §2.1, F1), shared by every transport. Construct it over a transaction
 * (Database publishes) or an independent executor (cloud publishes) — never over the shared source executor (03 §11).
 * A reservation proves a send was *attempted*, not that it succeeded: a process that dies between reserve and send
 * must not turn the caller's retry into a silent success, so only a Confirmed row is a duplicate.
 */
export class DeduplicationLedger {
    private readonly sql: PublishSqlBuilder;

    constructor(private readonly executor: WorkQueueSqlExecutor, private readonly contextUser: UserInfo) {
        this.sql = CreateWorkQueueSqlBuilder(executor).Publish;
    }

    public async Reserve(topicID: string, key: string, messageID: string): Promise<LedgerReservation> {
        for (let attempt = 1; attempt <= RESERVE_ATTEMPTS; attempt++) {
            if (await this.tryTake(topicID, key, messageID)) {
                return { Kind: 'Reserved' };
            }
            const owner = await this.readOwner(topicID, key);
            if (owner) {
                // SQL Server returns the owner UPPERCASE; publishers get every MessageID back lowercase (rowMapping).
                const ownerMessageID = NormalizeUUID(owner.MessageID);
                return owner.Status === 'Confirmed'
                    ? { Kind: 'Duplicate', OwnerMessageID: ownerMessageID }
                    : { Kind: 'Pending', OwnerMessageID: ownerMessageID };
            }
        }
        throw new Error(`Deduplication reservation for key '${key}' was not resolved after ${RESERVE_ATTEMPTS} attempts`);
    }

    public async Confirm(topicID: string, key: string, messageID: string, ttlSeconds: number): Promise<boolean> {
        const count = await ExecuteWrite(this.executor, this.sql.ConfirmDeduplication(topicID, key, messageID, ttlSeconds), this.contextUser);
        return count === 1;
    }

    public async Release(topicID: string, key: string, messageID: string): Promise<boolean> {
        const count = await ExecuteWrite(this.executor, this.sql.ReleaseDeduplication(topicID, key, messageID), this.contextUser);
        return count === 1;
    }

    /** Deletes expired keys in batches until a batch comes back short or maxBatches is reached. */
    public async PurgeExpired(batchSize = 1000, maxBatches = 20): Promise<number> {
        let total = 0;
        for (let batch = 0; batch < maxBatches; batch++) {
            const deleted = await ExecuteWrite(this.executor, this.sql.PurgeExpiredDeduplications(batchSize), this.contextUser);
            total += deleted;
            if (deleted < batchSize) {
                break;
            }
        }
        return total;
    }

    /** True when this call now owns the key (free, expired, or its own Reserved row re-taken). A key race reads as "not taken". */
    private async tryTake(topicID: string, key: string, messageID: string): Promise<boolean> {
        try {
            const rows = await ExecuteRows<ReservationRow>(
                this.executor,
                this.sql.ReserveDeduplication(topicID, key, messageID, DEDUP_RESERVATION_SECONDS),
                this.contextUser,
            );
            return rows.length > 0;
        } catch (error) {
            if (IsUniqueViolation(error, DEDUPLICATION_KEY_INDEX)) {
                return false;
            }
            throw error;
        }
    }

    /** A separate statement on purpose: it must see rows committed while the reserve statement was waiting. */
    private async readOwner(topicID: string, key: string): Promise<ReservationRow | null> {
        const rows = await ExecuteRows<ReservationRow>(this.executor, this.sql.SelectDeduplicationOwner(topicID, key), this.contextUser);
        return rows[0] ?? null;
    }
}
