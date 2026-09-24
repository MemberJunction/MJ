import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXPIRE_LEASES_BATCH, SWEEP_LOCK_RESOURCE } from '../constants';
import { WorkQueueOperatorSql } from '../sql/WorkQueueOperatorSql';
import { DELIVERY, SUB, USER } from './builderCalls';
import { RecordingExecutor } from './fakes';
import { PROCEDURES_MIGRATION } from './migrationProcedures';

const sql = new WorkQueueOperatorSql(new RecordingExecutor('sqlserver'));
const pg = new WorkQueueOperatorSql(new RecordingExecutor('postgresql'));

function ProcedureBody(name: string): string {
    const text = readFileSync(PROCEDURES_MIGRATION, 'utf8');
    const start = text.indexOf(`CREATE PROCEDURE [\${flyway:defaultSchema}].[${name}]`);
    return text.slice(start, text.indexOf('\nGO', start));
}

describe('WorkQueueOperatorSql read calls', () => {
    it('passes the Ordered flag to stats', () => {
        expect(sql.SubscriptionStats(SUB, true).Params).toEqual([SUB, true]);
        expect(sql.SubscriptionStats(SUB, false).Params).toEqual([SUB, false]);
    });

    it('pages dead letters by delivery ID, null for the first page', () => {
        expect(sql.ListDeadLetters(SUB, false, null, 50).Params).toEqual([SUB, false, null, 50]);
        expect(sql.ListDeadLetters(SUB, true, { DeliveryID: DELIVERY }, 50).Params).toEqual([SUB, true, DELIVERY, 50]);
    });

    it('pages partitions by key with an optional condition (null = every non-Idle key)', () => {
        expect(sql.ListPartitions(SUB, true, null, null, 50).Params).toEqual([SUB, true, null, null, 50]);
        expect(sql.ListPartitions(SUB, true, 'Blocked', 'venue-41', 50).Params).toEqual([SUB, true, 'Blocked', 'venue-41', 50]);
    });

    it('renders a parameterless call on both platforms', () => {
        expect(sql.ReadCommittedSnapshotState().SQL.trim()).toBe('EXEC [__mj].[spWorkQueueReadCommittedSnapshotState]');
        expect(sql.ReadCommittedSnapshotState().Params).toEqual([]);
        expect(pg.ReadCommittedSnapshotState().SQL).toBe('SELECT * FROM __mj."spWorkQueueReadCommittedSnapshotState"()');
    });
});

describe('WorkQueueOperatorSql write calls', () => {
    it('replay, discard and cancel are scoped to the subscription and record the actor', () => {
        expect(sql.ReplayDelivery(SUB, DELIVERY, USER, 'retry').Params).toEqual([SUB, DELIVERY, USER, 'retry']);
        expect(sql.ReplayDelivery(SUB, DELIVERY, null, null).Params).toEqual([SUB, DELIVERY, null, null]);
        expect(sql.DiscardDelivery(SUB, DELIVERY, true, USER, 'obsolete').Params).toEqual([SUB, DELIVERY, true, USER, 'obsolete']);
        expect(sql.CancelInFlightDelivery(SUB, DELIVERY, USER, 'stop').Params).toEqual([SUB, DELIVERY, USER, 'stop']);
    });

    it('sweeps in bounded batches, defaulting ExpireLeasesAll to EXPIRE_LEASES_BATCH', () => {
        expect(sql.ExpireLeasesAll().Params).toEqual([EXPIRE_LEASES_BATCH]);
        expect(sql.ExpireLeasesAll(50).Params).toEqual([50]);
        expect(sql.PurgeTerminalDeliveries(500).Params).toEqual([500]);
        expect(sql.PurgeOrphanMessages(500).Params).toEqual([500]);
        expect(sql.AcquireSweepLock(SWEEP_LOCK_RESOURCE).Params).toEqual([SWEEP_LOCK_RESOURCE]);
    });
});

describe('the operator procedures (03 §5.2, §7, reviewed as SQL in the migration)', () => {
    it('cancel-in-flight stamps the flag, requires InFlight and leaves the lease token unchanged (F2)', () => {
        const body = ProcedureBody('spWorkQueueCancelInFlightDelivery');
        expect(body).toContain('SET [CancelRequestedAt] = SYSDATETIMEOFFSET()');
        expect(body).toContain("[Status] = N'InFlight' AND [CancelRequestedAt] IS NULL");
        expect(body).not.toContain('[LeaseToken]');
        expect(body).not.toContain("N'Discarded'");
    });

    it('replay keeps OrderKey, resets attempts, marks the replay and clears the dead-letter fields', () => {
        const body = ProcedureBody('spWorkQueueReplayDelivery');
        expect(body).toContain("SET [Status] = N'Pending', [AttemptCount] = 0, [IsReplay] = 1, [VisibleAt] = SYSDATETIMEOFFSET()");
        expect(body).toContain('[DeadLetterReason] = NULL, [DeadLetteredAt] = NULL');
        expect(body).not.toContain('[OrderKey]');
        expect(body).toContain("AND [Status] = N'DeadLettered'");
    });

    it('discard takes a dead letter, or a Pending row only when @AllowPending', () => {
        expect(ProcedureBody('spWorkQueueDiscardDelivery')).toContain("([Status] = N'DeadLettered' OR (@AllowPending = 1 AND [Status] = N'Pending'))");
    });

    it('stats are per-status seeks and BlockedKeys is NULL unless Ordered', () => {
        const body = ProcedureBody('spWorkQueueSubscriptionStats');
        for (const status of ['Pending', 'InFlight', 'DeadLettered']) {
            expect(body).toContain(`[SubscriptionID] = @SubscriptionID AND `);
            expect(body).toContain(`[Status] = N'${status}'`);
        }
        expect(body).toContain('CASE WHEN @Ordered = 1 THEN');
        expect(body).toContain('ELSE CAST(NULL AS INT) END AS [BlockedKeys]');
        expect(body).not.toMatch(/GROUP BY/);
    });

    it('partition conditions are derived from delivery rows alone and paged by key', () => {
        const body = ProcedureBody('spWorkQueueListPartitions');
        expect(body).toContain("CASE WHEN k.[InFlightCount] > 0 THEN N'InFlight'");
        expect(body).toContain("WHEN @Ordered = 1 AND h.[Status] = N'DeadLettered' THEN N'Blocked'");
        expect(body).toContain("WHERE (@Condition IS NULL AND [Condition] <> N'Idle') OR [Condition] = @Condition");
        expect(body).toContain('(@AfterPartitionKey IS NULL OR d.[PartitionKey] > @AfterPartitionKey)');
        expect(body).toContain('ORDER BY [PartitionKey]');
    });

    it('dead letters page by delivery ID and flag an Ordered head as BlocksKey', () => {
        const body = ProcedureBody('spWorkQueueListDeadLetters');
        expect(body).toContain('(@AfterDeliveryID IS NULL OR d.[ID] > @AfterDeliveryID)');
        expect(body).toContain('ORDER BY d.[ID]');
        expect(body).toContain('AS [BlocksKey]');
    });

    it('the sweep lock is transaction-owned and non-blocking; expiry joins each subscription’s MaxAttempts', () => {
        expect(ProcedureBody('spWorkQueueAcquireSweepLock')).toContain("@LockOwner = N'Transaction', @LockTimeout = 0");
        const expire = ProcedureBody('spWorkQueueExpireLeasesAll');
        expect(expire).toContain('UPDATE TOP (@BatchSize) d SET');
        expect(expire).toContain('d.[AttemptCount] >= s.[MaxAttempts]');
        expect(expire).toContain("FROM @Expired WHERE [Status] = N'DeadLettered'");
    });

    it('purges are bounded, skip locked rows and honour per-topic retention', () => {
        const terminal = ProcedureBody('spWorkQueuePurgeTerminalDeliveries');
        expect(terminal).toContain('DELETE TOP (@BatchSize) d');
        expect(terminal).toContain('WITH (READPAST)');
        expect(terminal).toContain("d.[Status] IN (N'Completed', N'Discarded')");
        expect(terminal).toContain('DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())');
        const orphans = ProcedureBody('spWorkQueuePurgeOrphanMessages');
        expect(orphans).toContain('DELETE TOP (@BatchSize) m');
        expect(orphans).toContain('WHERE NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d WHERE d.[MessageID] = m.[ID])');
    });
});

describe('scripts/work-queue-scaler-login.sql', () => {
    const script = readFileSync(fileURLToPath(new URL('../../../../../scripts/work-queue-scaler-login.sql', import.meta.url)), 'utf8');

    it('grants SELECT on exactly the two tables the scaler query reads, and nothing else', () => {
        const grants = [...script.matchAll(/^GRANT (\w+) ON OBJECT::\[\$\(Schema\)\]\.(\w+) TO mj_workqueue_scaler;/gm)].map(m => `${m[1]} ${m[2]}`);
        expect(grants).toEqual(['SELECT WorkQueueDelivery', 'SELECT WorkQueueSubscription']);
        expect(script).not.toMatch(/GRANT (EXECUTE|INSERT|UPDATE|DELETE)/);
    });

    it('carries the bounded scaler query counting claimable Pending plus InFlight', () => {
        expect(script).toContain("s.Name = @SubscriptionName AND s.Status = 'Active'");
        expect(script).toContain("s.Name = @SubscriptionName AND d.Status = 'InFlight'");
        expect((script.match(/SELECT TOP \(1000\) 1 AS x/g) ?? []).length).toBe(2);
        expect(script).toContain("s.PartitionMode <> 'Ordered'");
    });
});
