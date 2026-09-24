import { describe, it, expect } from 'vitest';
import { WorkQueueProcedures } from '../sql/procedures';
import { SampleCalls } from './builderCalls';
import { RecordingExecutor } from './fakes';
import { ParseSqlServerCall, ReadMigrationProcedures } from './migrationProcedures';

/**
 * The builders and the migration are two halves of one contract (plan 12 / CD9): a builder that names a procedure
 * the migration does not create, or binds arguments in an order the procedure does not declare, fails only at
 * runtime — and on PostgreSQL, where arguments are positional, silently binds the wrong values. This test reads the
 * migration and checks both halves agree.
 */
const migration = ReadMigrationProcedures();
const sqlServerCalls = SampleCalls(new RecordingExecutor('sqlserver'));
const postgresCalls = SampleCalls(new RecordingExecutor('postgresql'));

/** Procedures that no builder calls yet; Tasks 4 and 5 add the consume and operator builders and empty this list. */
const NOT_YET_BUILT = new Set<string>([
    WorkQueueProcedures.ExpireLeases, WorkQueueProcedures.SubscriptionBacklog, WorkQueueProcedures.ClaimUnpartitioned,
    WorkQueueProcedures.SelectPartitionCandidates, WorkQueueProcedures.ClaimPartitionCandidate, WorkQueueProcedures.ExtendLease,
    WorkQueueProcedures.SelectLeaseState, WorkQueueProcedures.CompleteDelivery, WorkQueueProcedures.RetryDelivery,
    WorkQueueProcedures.DeadLetterDelivery, WorkQueueProcedures.ReleaseDelivery, WorkQueueProcedures.AcknowledgeCancel,
    WorkQueueProcedures.SubscriptionStats, WorkQueueProcedures.ListDeadLetters, WorkQueueProcedures.ListPartitions,
    WorkQueueProcedures.ReplayDelivery, WorkQueueProcedures.DiscardDelivery, WorkQueueProcedures.CancelInFlightDelivery,
    WorkQueueProcedures.ExpireLeasesAll, WorkQueueProcedures.AcquireSweepLock, WorkQueueProcedures.ReadCommittedSnapshotState,
    WorkQueueProcedures.PurgeTerminalDeliveries, WorkQueueProcedures.PurgeOrphanMessages,
]);

describe('procedure inventory', () => {
    it('the migration creates every procedure the engine names, and nothing else', () => {
        const named = Object.values(WorkQueueProcedures).sort();
        expect([...migration.keys()].sort()).toEqual(named);
    });

    it('grants EXECUTE to exactly the roles that hold the driver-owned entities (03 §6.7): never cdp_UI', () => {
        for (const procedure of migration.values()) {
            expect(procedure.Grants, procedure.Name).toEqual(['cdp_Developer', 'cdp_Integration']);
        }
    });

    it('every procedure with a builder is exercised by a sample call', () => {
        const called = new Set(sqlServerCalls.map(call => ParseSqlServerCall(call.Statement).Procedure));
        const uncovered = Object.values(WorkQueueProcedures).filter(name => !called.has(name)).sort();
        expect(uncovered).toEqual([...NOT_YET_BUILT].sort());
    });
});

describe('builder ↔ procedure parameter parity', () => {
    for (const [index, call] of sqlServerCalls.entries()) {
        it(`${call.Method} binds the declared parameters in declared order`, () => {
            const rendered = ParseSqlServerCall(call.Statement);
            const declared = migration.get(rendered.Procedure);
            expect(declared, `${rendered.Procedure} is not in the migration`).toBeDefined();
            expect(rendered.Params).toEqual(declared?.Params);
            expect(call.Statement.Params).toHaveLength(rendered.Params.length);

            const positional = postgresCalls[index].Statement;
            expect(positional.SQL).toBe(`SELECT * FROM __mj."${rendered.Procedure}"(${rendered.Params.map((_, i) => `$${i + 1}`).join(', ')})`);
            expect(positional.Params).toEqual(call.Statement.Params);
        });
    }
});
