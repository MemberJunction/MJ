import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { SaveSQLResult, DeleteSQLResult, ExecuteSQLOptions, LocalCacheManager } from '@memberjunction/core';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));

/**
 * EVERY PATH THAT ENDS THE AMBIENT TRANSACTION TELLS THE METADATA LAYER.
 *
 * RefreshWithinTransaction pins the in-memory metadata to the open transaction; the pin is released
 * (and the metadata reloaded from the pool) by ProviderBase.OnAmbientTransactionEnded. If any path
 * that reaches depth 0 skipped the call, pool reloads would stay held back for the life of the
 * process, and after a rollback the metadata would keep rows that never committed.
 */
class TransactionEndProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    protected get UUIDFunctionPattern(): RegExp { return TransactionEndProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TransactionEndProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }

    /** Each call to the hook: true = ended with a commit. */
    public Ended: boolean[] = [];
    /** Whether the hook saw the transaction still open (it must never). */
    public EndedWhileOpen = false;
    public FailCommit = false;
    /** Makes the post-commit hook throw, after the physical commit has happened. */
    public FailAfterCommit = false;
    private _physical = false;

    /** Whether the provider reports an open ambient transaction (the protected getter under test). */
    public get IsOpen(): boolean { return this.HasOpenAmbientTransaction; }
    /** Whether a timer-driven metadata refresh must wait now (the protected getter under test). */
    public get RefreshMustWait(): boolean { return this.MetadataMemberRefreshMustWait; }
    protected override async AfterPhysicalCommit(): Promise<void> {
        if (this.FailAfterCommit) {
            throw new Error('post-commit step failed');
        }
    }

    protected override get HasPhysicalTransaction(): boolean { return this._physical; }
    protected override async BeginPhysicalTransaction(): Promise<void> { this._physical = true; }
    protected override async CommitPhysicalTransaction(): Promise<void> {
        if (this.FailCommit) {
            throw new Error('commit failed');
        }
        this._physical = false;
    }
    protected override async RollbackPhysicalTransaction(): Promise<void> { this._physical = false; }
    /** Makes abandoning the physical handle throw (the driver rejects the rollback of a dead connection). */
    public FailAbandon = false;
    protected override async AbandonPhysicalTransaction(): Promise<void> {
        this._physical = false;
        if (this.FailAbandon) {
            throw new Error('abandon failed');
        }
    }
    override async ExecuteSQL<T>(_sql?: string, _params?: unknown[], _options?: ExecuteSQLOptions): Promise<Array<T>> { return []; }

    protected override async OnAmbientTransactionEnded(committed: boolean): Promise<void> {
        this.EndedWhileOpen = this.EndedWhileOpen || this.HasOpenAmbientTransaction;
        this.Ended.push(committed);
    }
}

describe('the ambient transaction end reaches OnAmbientTransactionEnded', () => {
    let provider: TransactionEndProvider;
    beforeEach(() => {
        provider = new TransactionEndProvider();
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(false);
    });
    afterEach(() => vi.restoreAllMocks());

    it('an outermost commit reports a commit', async () => {
        await provider.BeginTransaction();
        expect(provider.Ended).toEqual([]);
        await provider.CommitTransaction();
        expect(provider.Ended).toEqual([true]);
        expect(provider.EndedWhileOpen).toBe(false);
    });

    it('an outermost rollback reports an end without a commit', async () => {
        await provider.BeginTransaction();
        await provider.RollbackTransaction();
        expect(provider.Ended).toEqual([false]);
        expect(provider.EndedWhileOpen).toBe(false);
    });

    it('a failed commit that dropped the handle reports an end without a commit', async () => {
        await provider.BeginTransaction();
        provider.FailCommit = true;
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(provider.CommitTransaction()).rejects.toThrow('commit failed');
        expect(logged).toHaveBeenCalled(); // the provider logs the failed commit
        expect(provider.Ended).toEqual([false]);
        expect(provider.EndedWhileOpen).toBe(false);
    });

    it('a rollback that throws but leaves depth 0 still reports the end', async () => {
        // Rolling back with nothing open throws ("No active transaction to rollback") at depth 0.
        await expect(provider.RollbackTransaction()).rejects.toThrow();
        expect(provider.Ended).toEqual([false]);
    });

    it('ResetTransactionState (an abandoned handle) reports an end without a commit', async () => {
        await provider.BeginTransaction();
        // The abandoned batch is reported (and its slots invalidated) — expected here.
        const warned = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await provider.ResetTransactionState();
        expect(warned).toHaveBeenCalled();
        expect(provider.Ended).toEqual([false]);
        expect(provider.EndedWhileOpen).toBe(false);
    });

    it('ResetTransactionState abandons the entity-event batch even when abandoning the handle throws', async () => {
        await provider.BeginTransaction();
        provider.FailAbandon = true;
        const abandonBatch = vi.spyOn(LocalCacheManager.Instance, 'AbandonEntityEventBatch').mockResolvedValue(undefined);
        await expect(provider.ResetTransactionState()).rejects.toThrow('abandon failed');
        expect(abandonBatch).toHaveBeenCalledWith(provider);
    });

    it('HasOpenAmbientTransaction follows the transaction, and a timer-driven refresh waits exactly while it is open', async () => {
        expect([provider.IsOpen, provider.RefreshMustWait]).toEqual([false, false]);
        await provider.BeginTransaction();
        expect([provider.IsOpen, provider.RefreshMustWait]).toEqual([true, true]);
        await provider.CommitTransaction();
        expect([provider.IsOpen, provider.RefreshMustWait]).toEqual([false, false]);
    });

    it('a savepoint commit and a savepoint rollback end nothing; only the outermost settle reports', async () => {
        await provider.BeginTransaction();
        await provider.BeginTransaction(); // savepoint
        await provider.CommitTransaction(); // releases the savepoint
        expect(provider.Ended).toEqual([]);
        await provider.BeginTransaction(); // another savepoint
        await provider.RollbackTransaction(); // rolls back to it
        expect(provider.Ended).toEqual([]);
        expect(provider.IsOpen).toBe(true);
        await provider.CommitTransaction();
        expect(provider.Ended).toEqual([true]);
    });

    it('a post-commit step that throws after the commit still reports the end (the pin is never stranded)', async () => {
        await provider.BeginTransaction();
        provider.FailAfterCommit = true;
        await expect(provider.CommitTransaction()).rejects.toThrow('post-commit step failed');
        expect(provider.Ended).toEqual([true]);
        expect(provider.EndedWhileOpen).toBe(false);
    });
});
