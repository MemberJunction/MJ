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

    // Cloning rebinds the entity to the engine's provider — not what this test is about.
    protected override async cloneEntityForCache(source: BaseEntity): Promise<BaseEntity | null> {
        return source;
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
            Equals: (other: { KeyValuePairs?: { FieldName: string; Value: unknown }[] }) =>
                other?.KeyValuePairs?.some(kv => kv.FieldName === 'ID' && kv.Value === id) ?? false,
        },
        ID: id,
        ProviderToUse: provider,
    } as unknown as BaseEntity;
    return { type: 'save', saveSubType: 'create', baseEntity: entity } as BaseEntityEvent;
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

    it('caches a row saved outside any transaction immediately', async () => {
        const engine = engineCachingItems();

        await engine.Handle(createdItem('autocommit', providerAtDepth(0).provider));

        expect(ids(engine)).toEqual(['autocommit']);
    });
});
