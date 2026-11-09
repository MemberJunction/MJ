import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WorkQueueConsumeSql } from '../sql/WorkQueueConsumeSql';
import { DELIVERY, SUB, TOKEN } from './builderCalls';
import { RecordingExecutor } from './fakes';
import { PROCEDURES_MIGRATION } from './migrationProcedures';

const sql = new WorkQueueConsumeSql(new RecordingExecutor('sqlserver'));
const pg = new WorkQueueConsumeSql(new RecordingExecutor('postgresql'));

/** The body of one procedure in the migration, so the fence and claim rules can be asserted where they live. */
function ProcedureBody(name: string): string {
    const text = readFileSync(PROCEDURES_MIGRATION, 'utf8');
    const start = text.indexOf(`CREATE PROCEDURE [\${flyway:defaultSchema}].[${name}]`);
    const end = text.indexOf('\nGO', start);
    return text.slice(start, end);
}

const HOLDER_FENCE = "WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL";

describe('WorkQueueConsumeSql claim calls', () => {
    it('maps the partition mode onto the procedure’s @Ordered flag', () => {
        expect(sql.SelectPartitionCandidates(SUB, 'Exclusive', 10).Params).toEqual([SUB, false, 10]);
        expect(sql.SelectPartitionCandidates(SUB, 'Ordered', 10).Params).toEqual([SUB, true, 10]);
        expect(sql.ClaimPartitionCandidate(SUB, DELIVERY, 'Ordered', 'worker-1', 60).Params).toEqual([SUB, DELIVERY, true, 'worker-1', 60]);
    });

    it('passes the backlog mode through by name, including None', () => {
        const statement = sql.SubscriptionBacklog(SUB, 'None', 1000);
        expect(statement.SQL).toBe('EXEC [__mj].[spWorkQueueSubscriptionBacklog] @SubscriptionID=@p0, @Mode=@p1, @Cap=@p2');
        expect(statement.Params).toEqual([SUB, 'None', 1000]);
    });

    it('claims keyless rows with owner, lease and batch size', () => {
        const statement = sql.ClaimUnpartitioned(SUB, 'worker-1', 60, 10);
        expect(statement.SQL).toBe('EXEC [__mj].[spWorkQueueClaimUnpartitioned] @SubscriptionID=@p0, @LeaseOwner=@p1, @LeaseSeconds=@p2, @MaxRows=@p3');
        expect(statement.Params).toEqual([SUB, 'worker-1', 60, 10]);
    });

    it('expires with the subscription’s MaxAttempts', () => {
        expect(sql.ExpireLeases(SUB, 5).Params).toEqual([SUB, 5]);
    });
});

describe('WorkQueueConsumeSql holder calls', () => {
    it('heartbeats with an optional progress document', () => {
        expect(sql.ExtendLease(DELIVERY, TOKEN, 60, null).Params).toEqual([DELIVERY, TOKEN, 60, null]);
        expect(sql.ExtendLease(DELIVERY, TOKEN, 60, '{"step":2}').Params).toEqual([DELIVERY, TOKEN, 60, '{"step":2}']);
        expect(sql.SelectLeaseState(DELIVERY, TOKEN).Params).toEqual([DELIVERY, TOKEN]);
    });

    it('settles under the token', () => {
        expect(sql.CompleteDelivery(DELIVERY, TOKEN).Params).toEqual([DELIVERY, TOKEN]);
        expect(sql.RetryDelivery(DELIVERY, TOKEN, 30, 'boom').Params).toEqual([DELIVERY, TOKEN, 30, 'boom']);
        expect(sql.DeadLetterDelivery(DELIVERY, TOKEN, 'MaxAttempts', null).Params).toEqual([DELIVERY, TOKEN, 'MaxAttempts', null]);
        expect(sql.ReleaseDelivery(DELIVERY, TOKEN).Params).toEqual([DELIVERY, TOKEN]);
        expect(sql.AcknowledgeCancel(DELIVERY, TOKEN).Params).toEqual([DELIVERY, TOKEN]);
    });
});

describe('the consume procedures (03 §7, reviewed as SQL in the migration)', () => {
    it.each(['spWorkQueueExtendLease', 'spWorkQueueCompleteDelivery', 'spWorkQueueRetryDelivery', 'spWorkQueueDeadLetterDelivery', 'spWorkQueueReleaseDelivery'])(
        '%s is fenced on ID + token + InFlight + no cancel and reports AffectedRows', (name) => {
            const body = ProcedureBody(name);
            expect(body).toContain(HOLDER_FENCE);
            expect(body).toContain('SELECT @@ROWCOUNT AS [AffectedRows];');
        });

    it('AcknowledgeCancel is the one holder write that requires the cancel flag (F2)', () => {
        const body = ProcedureBody('spWorkQueueAcknowledgeCancel');
        expect(body).toContain("WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NOT NULL");
        expect(body).toContain("SET [Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET()");
    });

    it('claims issue a fresh token, count the attempt, clear progress and skip locked rows', () => {
        const body = ProcedureBody('spWorkQueueClaimUnpartitioned');
        expect(body).toContain('WITH (UPDLOCK, READPAST, ROWLOCK)');
        expect(body).toContain("[Status] = N'InFlight', [LeaseToken] = NEWID(), [LeaseOwner] = @LeaseOwner");
        expect(body).toContain('[AttemptCount] = [AttemptCount] + 1, [Progress] = NULL');
        expect(body).toContain('ORDER BY d.[VisibleAt]');
        expect(body).toContain('INTO @Claimed');
    });

    it('partition claims enforce single flight per key and, when @Ordered, head-of-line', () => {
        for (const name of ['spWorkQueueSelectPartitionCandidates', 'spWorkQueueClaimPartitionCandidate']) {
            const body = ProcedureBody(name);
            expect(body).toContain("f.[PartitionKey] = d.[PartitionKey] AND f.[Status] = N'InFlight'");
            expect(body).toContain("AND (@Ordered = 0 OR NOT EXISTS");
            expect(body).toContain("e.[OrderKey] < d.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')");
            expect(body).toContain('[CancelRequestedAt] IS NULL');
        }
        expect(ProcedureBody('spWorkQueueSelectPartitionCandidates')).toContain('OPTION (RECOMPILE)');
    });

    it('ExpireLeases discards a cancelled holder, dead-letters an exhausted one, requeues the rest, and returns only dead letters', () => {
        const body = ProcedureBody('spWorkQueueExpireLeases');
        expect(body).toContain("CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN N'Discarded'");
        expect(body).toContain("WHEN d.[AttemptCount] >= @MaxAttempts THEN N'DeadLettered' ELSE N'Pending' END");
        expect(body).toContain("d.[LeaseExpiresAt] < SYSDATETIMEOFFSET()");
        expect(body).toContain("FROM @Expired WHERE [Status] = N'DeadLettered'");
        expect(body).toContain('UPDATE TOP (500)');
    });

    it('never binds the clock and never uses dynamic SQL (ownership chaining)', () => {
        const code = readFileSync(PROCEDURES_MIGRATION, 'utf8').split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
        expect(code).not.toMatch(/@Now\b/);
        expect(code).not.toContain('GETUTCDATE()');
        expect(code).not.toContain('sp_executesql');
        expect(code).not.toMatch(/EXEC(?:UTE)?\s*\(/);
    });
});

describe('ShiftTimestampsForConformance (test-only raw statement)', () => {
    it('is a raw UPDATE wrapped so ExecuteWrite reads AffectedRows, on both platforms', () => {
        const ss = sql.ShiftTimestampsForConformance(SUB, 120);
        expect(ss.SQL).toContain('UPDATE [__mj].[WorkQueueDelivery]');
        expect(ss.SQL).toContain('SET [VisibleAt] = DATEADD(SECOND, -@p1, [VisibleAt]), [LeaseExpiresAt] = DATEADD(SECOND, -@p1, [LeaseExpiresAt])');
        expect(ss.SQL).toContain("WHERE [SubscriptionID] = @p0 AND [Status] IN (N'Pending', N'InFlight')");
        expect(ss.SQL.endsWith('SELECT @@ROWCOUNT AS AffectedRows')).toBe(true);
        expect(ss.Params).toEqual([SUB, 120]);

        const pgs = pg.ShiftTimestampsForConformance(SUB, 120);
        expect(pgs.SQL).toContain('UPDATE "__mj"."WorkQueueDelivery"');
        expect(pgs.SQL).toContain('make_interval(secs => $2::int)');
        expect(pgs.SQL).toContain('RETURNING 1');
        expect(pgs.SQL).toContain('COUNT(*)::int AS "AffectedRows"');
        expect(pgs.Params).toEqual([SUB, 120]);
    });

    it('is not a procedure: no spWorkQueue procedure shifts timestamps', () => {
        expect(readFileSync(PROCEDURES_MIGRATION, 'utf8')).not.toMatch(/ShiftTimestamps/i);
    });
});
