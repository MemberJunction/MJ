/**
 * Cache maintenance must batch for a RAW transaction, not only for `BeginEntityTransaction`
 * (found in review), and a batch whose owner goes away must not leak (#5).
 *
 * Why the existing coverage missed both: `localCacheManager.entityEventBatch.test.ts` drives
 * `BeginEntityTransaction` through a hand-written stub whose `BeginTransaction()` does nothing but
 * count depth — so it proves the wrapper batches and says nothing about the 41 production call
 * sites that use the raw primitive directly (new-user creation on first login, the magic-link
 * service, the roles/users sync resolver, `MergeRecords`, every generated cascade-delete override).
 * Those published one cache write per save, and a rollback left rows in the shared cache that were
 * never committed. These tests use a real `GenericDatabaseProvider` subclass, which is where the
 * hook lives.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore, MJEventType, MJGlobal } from '@memberjunction/global';
import {
    BaseEntity, CompositeKey, LocalCacheManager,
    type BaseEntityEvent, type EntityInfo, type SaveSQLResult, type DeleteSQLResult, type RunViewParams,
} from '@memberjunction/core';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

/** The slot every test watches: an unfiltered RunView of one entity. */
const ENTITY = 'MJ: AI Models';
const FINGERPRINT = `${ENTITY}|||-1|0||`;
const PARAMS = { EntityName: ENTITY } as RunViewParams;

/** Minimal concrete provider: real transaction machinery, no database. */
class TxProvider extends GenericDatabaseProvider {
    public FailCommitPhysical = false;
    private physicalOpen = false;

    protected get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^$/; }
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

    protected override get HasPhysicalTransaction(): boolean { return this.physicalOpen; }
    protected override async BeginPhysicalTransaction(): Promise<void> { this.physicalOpen = true; }
    protected override async CommitPhysicalTransaction(): Promise<void> {
        if (this.FailCommitPhysical) {
            throw new Error('commit failed');
        }
        this.physicalOpen = false;
    }
    protected override async RollbackPhysicalTransaction(): Promise<void> { this.physicalOpen = false; }
    protected override async createSavepoint(): Promise<void> { /* no physical database */ }
    protected override async rollbackToSavepoint(): Promise<void> { /* no physical database */ }
    protected override async releaseSavepoint(): Promise<void> { /* no physical database */ }
}

/** A storage provider that records writes, so "one write per slot" is observable. */
class RecordingStore {
    public readonly Items = new Map<string, unknown>();
    public readonly Writes: string[] = [];
    public readonly Removes: string[] = [];
    public async GetItem<T>(key: string): Promise<T | null> { return (this.Items.get(key) as T) ?? null; }
    public async SetItem<T>(key: string, value: T): Promise<void> { this.Writes.push(key); this.Items.set(key, value); }
    public async Remove(key: string): Promise<void> { this.Removes.push(key); this.Items.delete(key); }
    public async GetItems<T>(keys: string[]): Promise<Map<string, T | null>> {
        return new Map(keys.map(k => [k, (this.Items.get(k) as T) ?? null]));
    }
    public async ClearCategory(): Promise<void> { this.Items.clear(); }
    public async GetCategoryKeys(): Promise<string[]> { return [...this.Items.keys()]; }
}

const entityInfo = { Name: ENTITY, PrimaryKeys: [{ Name: 'ID' }], AllowCaching: true } as unknown as EntityInfo;

/** Raises the save/delete event a BaseEntity raises, bound to `provider`. */
function raise(provider: object, type: 'save' | 'delete', row: Record<string, unknown>): void {
    const baseEntity = {
        EntityInfo: entityInfo,
        ProviderToUse: provider,
        PrimaryKey: CompositeKey.FromKeyValuePairs([{ FieldName: 'ID', Value: row.ID as string }]),
        GetAll: () => row,
    } as unknown as BaseEntity;
    MJGlobal.Instance.RaiseEvent({
        component: baseEntity, event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode,
        args: { type, baseEntity, payload: null } as BaseEntityEvent,
    });
}

/** Lets the manager's own event handling run. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('a raw transaction batches cache maintenance', () => {
    let store: RecordingStore;
    let manager: LocalCacheManager;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        store = new RecordingStore();
        await manager.Initialize(store as never);
        await manager.SetRunViewResult(FINGERPRINT, PARAMS, [{ ID: '1' }], '');
        store.Writes.length = 0;
    });

    it('writes the slot once, after commit, for every save in the transaction', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        for (let i = 2; i <= 6; i++) {
            raise(provider, 'save', { ID: String(i) });
        }
        await settle();
        expect(store.Writes.filter(k => k === FINGERPRINT)).toHaveLength(0); // nothing yet

        await provider.CommitTransaction();
        await settle();

        expect(store.Writes.filter(k => k === FINGERPRINT)).toHaveLength(1);
        expect((await manager.GetRunViewResult(FINGERPRINT))?.results).toHaveLength(6);
        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
    });

    it('leaves no uncommitted rows in the cache when the raw transaction rolls back', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '99' });
        await settle();

        await provider.RollbackTransaction();
        await settle();

        // Invalidated, not written: whether those rows reached the database is unknown.
        expect(await manager.GetRunViewResult(FINGERPRINT)).toBeNull();
        expect(store.Writes.filter(k => k === FINGERPRINT)).toHaveLength(0);
        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
    });

    it('applies once at the OUTERMOST settle when transactions nest', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '2' });
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '3' });
        await provider.CommitTransaction(); // inner
        await settle();
        expect(store.Writes.filter(k => k === FINGERPRINT)).toHaveLength(0);

        await provider.CommitTransaction(); // outer
        await settle();

        expect(store.Writes.filter(k => k === FINGERPRINT)).toHaveLength(1);
        expect((await manager.GetRunViewResult(FINGERPRINT))?.results).toHaveLength(3);
    });

    it('invalidates rather than writes when the commit itself fails', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '2' });
        await settle();
        provider.FailCommitPhysical = true;

        await expect(provider.CommitTransaction()).rejects.toThrow('commit failed');
        await settle();

        expect(await manager.GetRunViewResult(FINGERPRINT)).toBeNull();
        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
    });

    it('reads its own writes inside the transaction, so the batch never hides them', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '2' });
        await settle();

        // While a batch holds changes for the entity, cached reads miss on purpose: the slot is
        // behind the database as this unit of work sees it.
        expect(await manager.GetRunViewResult(FINGERPRINT)).toBeNull();

        await provider.CommitTransaction();
        await settle();
        expect((await manager.GetRunViewResult(FINGERPRINT))?.results).toHaveLength(2);
    });
});

describe('a rollback for a begin that never happened', () => {
    let store: RecordingStore;
    let manager: LocalCacheManager;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        store = new RecordingStore();
        await manager.Initialize(store as never);
        await manager.SetRunViewResult(FINGERPRINT, PARAMS, [{ ID: '1' }], '');
        store.Writes.length = 0;
    });

    /**
     * The shape: a nested begin whose savepoint fails, and a caller that rolls back in its catch —
     * how the seventeen generated cascade-delete overrides are written. The batch is opened only
     * after a begin SUCCEEDS, so that rollback closes a level it did not open.
     *
     * These tests pin the INVARIANT (opens and closes stay paired, and a rollback with nothing open
     * is inert); they are not a regression pin. Both pass with the level counter removed, because
     * `EntityEventBatchSet.Close` already returns null when the owner has no batch. The review
     * expected the outer unit of work to be left un-batched here; it is not — and where the outer
     * batch does close, that is correct, because the same rollback rolled the OUTER transaction
     * back at the physical level (depth was 1).
     */
    class SavepointFailsProvider extends TxProvider {
        public FailSavepoint = false;
        protected override async createSavepoint(): Promise<void> {
            if (this.FailSavepoint) {
                throw new Error('could not create savepoint');
            }
        }
    }

    it('keeps opens and closes paired across a failed nested begin', async () => {
        const provider = new SavepointFailsProvider();
        await provider.BeginTransaction();              // outer: opens level 1
        raise(provider, 'save', { ID: '2' });
        await settle();

        provider.FailSavepoint = true;
        await expect(provider.BeginTransaction()).rejects.toThrow('could not create savepoint');
        expect(manager.IsBatchingEntityEvents(provider)).toBe(true);   // still the outer's level

        // The nested caller's catch rolls back. That settles the outer transaction (depth is 1), so
        // closing the batch here is right — but it must close exactly ONE level.
        await provider.RollbackTransaction();
        await settle();
        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);

        // The outer's own catch rolls back too. There is no level left to close, and this must not
        // reach into any batch opened since.
        provider.FailSavepoint = false;
        await provider.BeginTransaction();              // a fresh unit of work on the same provider
        raise(provider, 'save', { ID: '3' });
        await settle();
        await provider.RollbackTransaction().catch(() => undefined);

        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
        expect(store.Writes.filter(k => k === FINGERPRINT)).toHaveLength(0); // nothing written through
    });

    it('keeps batching the outer unit of work when a nested begin fails and is not rolled back', async () => {
        const provider = new SavepointFailsProvider();
        await provider.BeginTransaction();
        provider.FailSavepoint = true;
        await expect(provider.BeginTransaction()).rejects.toThrow('could not create savepoint');

        raise(provider, 'save', { ID: '4' });
        await settle();

        // Still buffered: the failed begin neither opened nor closed a level.
        expect(manager.IsBatchingEntityEvents(provider)).toBe(true);
        expect(store.Writes.filter(k => k === FINGERPRINT)).toHaveLength(0);
    });
});

describe('a batch whose owner goes away is abandoned, not leaked', () => {
    let store: RecordingStore;
    let manager: LocalCacheManager;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        store = new RecordingStore();
        await manager.Initialize(store as never);
        await manager.SetRunViewResult(FINGERPRINT, PARAMS, [{ ID: '1' }], '');
    });

    it('ReleaseIndependentInstance closes the batch, so the entity stops counting as pending', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '2' });
        await settle();
        expect(manager.IsBatchingEntityEvents(provider)).toBe(true);

        await provider.ReleaseIndependentInstance();
        await settle();

        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
        // The decisive assertion: with the entity still counted as pending, EVERY later read of it
        // misses and every fill is skipped — for the life of the process, on a cache nothing can
        // repair. A fresh fill must therefore be readable again.
        await manager.SetRunViewResult(FINGERPRINT, PARAMS, [{ ID: '1' }, { ID: '2' }], '');
        expect((await manager.GetRunViewResult(FINGERPRINT))?.results).toHaveLength(2);
    });

    it('ResetTransactionState closes the batch too', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '2' });
        await settle();

        await provider.ResetTransactionState();
        await settle();

        expect(manager.IsBatchingEntityEvents(provider)).toBe(false);
        await manager.SetRunViewResult(FINGERPRINT, PARAMS, [{ ID: '1' }], '');
        expect(await manager.GetRunViewResult(FINGERPRINT)).not.toBeNull();
    });

    it('invalidates what an abandoned batch touched, since those rows may or may not be committed', async () => {
        const provider = new TxProvider();
        await provider.BeginTransaction();
        raise(provider, 'save', { ID: '2' });
        await settle();

        await provider.ReleaseIndependentInstance();
        await settle();

        expect(await manager.GetRunViewResult(FINGERPRINT)).toBeNull();
    });
});
