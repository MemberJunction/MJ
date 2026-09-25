import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import type { PostCommitTask, PostCommitToken } from '../generic/databaseProviderBase';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider } from '../generic/interfaces';

/**
 * A cached engine must not show a row that was saved inside a transaction until that transaction
 * commits.
 *
 * `BaseEntity` raises `save`/`delete` as soon as its own SQL write returns — while an enclosing
 * transaction (an `mj sync push`, a composite save) is still open. The engine mutated its cache
 * right there, and nothing undid it on rollback, so a rolled-back record stayed in the cache for
 * the life of the process. Found by IT33 (QC2) in the 6.2.0-edge.0 release gate: a Query created
 * inside a push that rolled back stayed in QueryEngine, and RunQuery then failed on a Query that
 * did not exist.
 */

class ItemsEngine extends BaseEngine<ItemsEngine> {
    public _items: BaseEntity[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // configs are injected directly
    }

    public UseConfigs(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public Handle(event: BaseEntityEvent): Promise<boolean> {
        return this.HandleIndividualBaseEntityEvent(event);
    }

    // Like the real clone: a separate object carrying the source's key AS OF clone time (the real
    // one also rebinds the provider, which is not what this test is about).
    protected override async cloneEntityForCache(source: BaseEntity): Promise<BaseEntity | null> {
        const id = (source as unknown as { ID: string }).ID;
        return createdItem(id, source.ProviderToUse as DatabaseProviderBase).baseEntity;
    }
}

/** The transaction-facing surface of a database provider: depth, and a post-commit queue. */
function providerAtDepth(depth: number): { provider: DatabaseProviderBase; commit: () => Promise<void>; rollback: () => void } {
    const queued: PostCommitTask[] = [];
    const provider = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
    Object.defineProperty(provider, 'TransactionDepth', { get: () => depth });
    provider.CapturePostCommitToken = () => (depth > 0 ? ({ frames: depth } as unknown as PostCommitToken) : undefined);
    provider.RunAfterCommit = (task: PostCommitTask) => {
        if (depth === 0) void task();
        else queued.push(task);
    };
    return {
        provider,
        commit: async () => { for (const t of queued.splice(0)) await t(); },
        rollback: () => { queued.length = 0; },
    };
}

function createdItem(id: string, provider: DatabaseProviderBase): BaseEntityEvent {
    const entity = {
        EntityInfo: { Name: 'Items', PrimaryKeys: [{ Name: 'ID' }] },
        PrimaryKey: {
            KeyValuePairs: [{ FieldName: 'ID', Value: id }],
            // Read the CURRENT pair, as the real CompositeKey does — resetToNewRecord replaces it.
            ToString() { return this.KeyValuePairs.map(kv => `${kv.FieldName}=${String(kv.Value)}`).join(','); },
            Equals(other: { KeyValuePairs?: { FieldName: string; Value: unknown }[] }) {
                const mine = this.KeyValuePairs[0].Value;
                return other?.KeyValuePairs?.some(kv => kv.FieldName === 'ID' && kv.Value === mine) ?? false;
            },
        },
        ID: id,
        ProviderToUse: provider,
    } as unknown as BaseEntity;
    return { type: 'save', saveSubType: 'create', baseEntity: entity } as BaseEntityEvent;
}

/** What BaseEntity.NewRecord() does to the deleted object: same reference, new primary key. */
function resetToNewRecord(entity: BaseEntity, newId: string): void {
    const mutable = entity as unknown as { ID: string; PrimaryKey: { KeyValuePairs: { FieldName: string; Value: unknown }[] } };
    mutable.ID = newId;
    mutable.PrimaryKey.KeyValuePairs = [{ FieldName: 'ID', Value: newId }];
}

function engineCachingItems(): ItemsEngine {
    const engine = new ItemsEngine();
    engine.UseConfigs([new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Items', PropertyName: '_items' })]);
    return engine;
}

const ids = (engine: ItemsEngine) => engine._items.map(e => (e as unknown as { ID: string }).ID);

describe('BaseEngine — cache mutations follow the saving transaction', () => {
    it('does not cache a row saved inside a transaction that rolls back', async () => {
        const engine = engineCachingItems();
        const tx = providerAtDepth(1);

        await engine.Handle(createdItem('rolled-back', tx.provider));
        tx.rollback();

        expect(ids(engine)).toEqual([]);
    });

    it('caches a row saved inside a transaction once that transaction commits', async () => {
        const engine = engineCachingItems();
        const tx = providerAtDepth(1);

        await engine.Handle(createdItem('committed', tx.provider));
        expect(ids(engine)).toEqual([]);   // not visible while the transaction is open
        await tx.commit();

        expect(ids(engine)).toEqual(['committed']);
    });

    // Deferring exposed a second hazard: BaseEntity.Delete() calls NewRecord() straight after
    // raising 'delete', which gives the SAME object a new primary key. A deferred removal that
    // matched on the live entity found nothing, so every committed delete left its row cached.
    it('removes a row deleted inside a transaction once it commits, though the entity was reset since', async () => {
        const engine = engineCachingItems();
        const cached = createdItem('deleted-row', providerAtDepth(0).provider).baseEntity;
        engine._items = [cached];
        const tx = providerAtDepth(1);

        const deleting = createdItem('deleted-row', tx.provider).baseEntity;
        await engine.Handle({ type: 'delete', baseEntity: deleting, payload: { OldValues: { ID: 'deleted-row' } } } as BaseEntityEvent);
        resetToNewRecord(deleting, 'regenerated-by-NewRecord');
        await tx.commit();

        expect(ids(engine)).toEqual([]);
    });

    // Created and deleted in the same transaction: by commit the object has been reset by
    // NewRecord(), so a deferred create that cloned it would cache a blank row under a new key.
    it('caches nothing for a row created and deleted inside the same committed transaction', async () => {
        const engine = engineCachingItems();
        const tx = providerAtDepth(1);

        const created = createdItem('short-lived', tx.provider);
        await engine.Handle(created);
        await engine.Handle({ type: 'delete', baseEntity: created.baseEntity, payload: { OldValues: { ID: 'short-lived' } } } as BaseEntityEvent);
        resetToNewRecord(created.baseEntity, 'regenerated-by-NewRecord');
        await tx.commit();

        expect(ids(engine)).toEqual([]);
    });

    it('caches a row saved outside any transaction immediately', async () => {
        const engine = engineCachingItems();

        await engine.Handle(createdItem('autocommit', providerAtDepth(0).provider));

        expect(ids(engine)).toEqual(['autocommit']);
    });
});
