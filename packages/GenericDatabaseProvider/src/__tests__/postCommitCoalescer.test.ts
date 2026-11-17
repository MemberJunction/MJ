/**
 * Unit tests for `GenericDatabaseProvider.ScheduleAfterCommit` (PostCommitCoalescer).
 *
 * Verifies:
 *   1. `'last-wins'` and `'first-wins'` coalescing inside an open transaction drain once on commit.
 *   2. Savepoint rollback discards rolled-back coalesced registrations without erasing outer keys.
 *   3. `PostCommitToken` resolves accurately across frames and after commit/rollback.
 *   4. Detached (non-transactional) calls coalesce across the same microtask turn and run detached
 *      from any active foreign transaction affinity.
 */
import { describe, expect, it } from 'vitest';
import {
    DeleteSQLResult,
    EntityInfo,
    RunViewParams,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

class CoalescerTestProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return CoalescerTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return CoalescerTestProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `LIMIT ${maxRows} OFFSET ${startRow}`;
    }

    public physicalOpen = false;
    protected override get HasPhysicalTransaction(): boolean {
        return this.physicalOpen;
    }
    protected override async BeginPhysicalTransaction(): Promise<void> {
        this.physicalOpen = true;
    }
    protected override async CommitPhysicalTransaction(): Promise<void> {
        this.physicalOpen = false;
    }
    protected override async RollbackPhysicalTransaction(): Promise<void> {
        this.physicalOpen = false;
    }

    public async ExecuteSQL<T>(): Promise<T[]> {
        return [];
    }

    public async InternalRunView<T>(): Promise<{ Success: boolean; Results: T[]; TotalRowCount: number }> {
        return { Success: true, Results: [], TotalRowCount: 0 };
    }

    public GetEffectiveBaseViewForTest(info: EntityInfo, params: RunViewParams, user?: UserInfo) {
        return this.GetEffectiveBaseView(info, params);
    }
}

describe('GenericDatabaseProvider ScheduleAfterCommit (PostCommitCoalescer)', () => {
    it('coalesces duplicate keys inside a transaction with last-wins (default) and first-wins modes', async () => {
        const provider = new CoalescerTestProvider();
        const executed: string[] = [];

        await provider.BeginTransaction();
        provider.ScheduleAfterCommit('cache:users', async () => { executed.push('last-1'); }, 'u1');
        provider.ScheduleAfterCommit('other', async () => { executed.push('other'); }, 'other');
        provider.ScheduleAfterCommit('cache:users', async () => { executed.push('last-2'); }, 'u2');
        provider.ScheduleAfterCommit('audit:flush', async () => { executed.push('first-1'); }, 'f1', undefined, 'first-wins');
        provider.ScheduleAfterCommit('audit:flush', async () => { executed.push('first-2'); }, 'f2', undefined, 'first-wins');

        expect(executed).toEqual([]);
        await provider.CommitTransaction();

        expect(executed).toEqual(['other', 'last-2', 'first-1']);
        expect(provider.PendingPostCommitTaskCount).toBe(0);
    });

    it('preserves savepoint rollback safety when the same key is registered in outer and inner savepoints', async () => {
        const provider = new CoalescerTestProvider();
        const executed: string[] = [];

        await provider.BeginTransaction();
        provider.ScheduleAfterCommit('cache:entity', async () => { executed.push('outer'); }, 'outer');

        await provider.BeginTransaction(); // SavePoint_1
        provider.ScheduleAfterCommit('cache:entity', async () => { executed.push('rolled-back'); }, 'inner-rb');
        await provider.RollbackTransaction();

        expect(executed).toEqual([]);
        await provider.CommitTransaction();

        expect(executed).toEqual(['outer']);
    });

    it('promotes coalesced inner savepoint updates when the savepoint releases', async () => {
        const provider = new CoalescerTestProvider();
        const executed: string[] = [];

        await provider.BeginTransaction();
        provider.ScheduleAfterCommit('cache:entity', async () => { executed.push('outer'); }, 'outer');

        await provider.BeginTransaction(); // SavePoint_1
        provider.ScheduleAfterCommit('cache:entity', async () => { executed.push('inner-released'); }, 'inner-ok');
        await provider.CommitTransaction();

        expect(executed).toEqual([]);
        await provider.CommitTransaction();

        expect(executed).toEqual(['inner-released']);
    });

    it('respects PostCommitToken for late registrations across savepoints and already-committed work', async () => {
        const provider = new CoalescerTestProvider();
        const executed: string[] = [];

        await provider.BeginTransaction();
        const outerToken = provider.CapturePostCommitToken();
        await provider.BeginTransaction();
        const innerToken = provider.CapturePostCommitToken();
        await provider.RollbackTransaction();

        // innerToken was rolled back -> should be dropped safely
        provider.ScheduleAfterCommit('k', async () => { executed.push('dropped'); }, 'dropped', innerToken);
        // outerToken is still alive -> queues under depth 1
        provider.ScheduleAfterCommit('k', async () => { executed.push('kept-1'); }, 'kept-1', outerToken);
        provider.ScheduleAfterCommit('k', async () => { executed.push('kept-2'); }, 'kept-2', outerToken);

        await provider.CommitTransaction();
        expect(executed).toEqual(['kept-2']);

        // outerToken is now committed -> runs detached on microtask coalescer
        provider.ScheduleAfterCommit('k', async () => { executed.push('after-commit-1'); }, 'ac1', outerToken);
        provider.ScheduleAfterCommit('k', async () => { executed.push('after-commit-2'); }, 'ac2', outerToken);
        await new Promise<void>((resolve) => queueMicrotask(() => setTimeout(resolve, 0)));
        expect(executed).toEqual(['kept-2', 'after-commit-2']);
    });

    it('coalesces detached calls within a single microtask turn', async () => {
        const provider = new CoalescerTestProvider();
        const executed: string[] = [];

        provider.ScheduleAfterCommit('refresh:A', async () => { executed.push('A1'); }, 'A1');
        provider.ScheduleAfterCommit('refresh:A', async () => { executed.push('A2'); }, 'A2');
        provider.ScheduleAfterCommit('refresh:B', async () => { executed.push('B1'); }, 'B1', undefined, 'first-wins');
        provider.ScheduleAfterCommit('refresh:B', async () => { executed.push('B2'); }, 'B2', undefined, 'first-wins');

        expect(executed).toEqual([]);
        await new Promise<void>((resolve) => queueMicrotask(() => setTimeout(resolve, 0)));
        expect(executed).toEqual(['A2', 'B1']);
    });
});
