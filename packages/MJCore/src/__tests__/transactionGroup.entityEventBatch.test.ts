/**
 * A transaction group's saves reach the local cache as one batch per provider: each cached slot
 * is rewritten once for the whole group, and invalidated instead when the group did not succeed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore, MJEventType, MJGlobal } from '@memberjunction/global';
import { LocalCacheManager } from '../generic/localCacheManager';
import { BaseEntity } from '../generic/baseEntity';
import { TransactionGroupBase, TransactionItem, TransactionResult } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

const ENTITY = 'Widgets';
const UNFILTERED = `${ENTITY}|_|_|-1|0|_|_`;
const PARAMS = { EntityName: ENTITY } as RunViewParams;
const ENTITY_INFO = { Name: ENTITY, PrimaryKeys: [{ Name: 'ID' }], AllowCaching: true };
const FILTERED = `${ENTITY}|Color='red'|_|-1|0|_|_`;
const OTHER_ENTITY = 'Gadgets';
const OTHER_UNFILTERED = `${OTHER_ENTITY}|_|_|-1|0|_|_`;
const OTHER_ENTITY_INFO = { Name: OTHER_ENTITY, PrimaryKeys: [{ Name: 'ID' }], AllowCaching: true };

type Row = Record<string, unknown>;

/** A stand-in for the provider entities save through; batches are keyed on it. */
function newOwner(): object {
    return { name: 'provider' };
}

/** Raises the save event an item's entity raises once it is finalized. */
function raiseSave(owner: object, fields: Row, entityInfo: typeof ENTITY_INFO = ENTITY_INFO): void {
    MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        component: null,
        args: {
            type: 'save',
            payload: null,
            baseEntity: { EntityInfo: entityInfo, ProviderToUse: owner, GetAll: () => ({ ...fields }) },
        },
    });
}

/** Lets fire-and-forget event handlers finish. */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

/** One planned group item: the provider it saves through, the row it saves, and how it ends. */
interface PlannedItem {
    Owner: object;
    Row: Row;
    /** The entity the row belongs to; Widgets when omitted. */
    Entity?: typeof ENTITY_INFO;
    Succeeds?: boolean;
    CallbackThrows?: boolean;
    /**
     * Where the item raises its save. An entity's `Save()` raises it when the group notifies its
     * outcome ('notification', the default); 'callback' raises it from the item's callback.
     *
     * A real `BaseEntity` raises its save only from a successful notification, so 'callback' is a
     * synthetic source. The failure-path tests use it to put a save inside a batch that then fails,
     * standing in for any other save raised for the same provider during the group's callbacks: a
     * callback that saves another entity, or, in a browser, an unrelated save on the shared provider.
     */
    RaiseFrom?: 'notification' | 'callback';
    /** When set, the item's callback waits for this before it finishes. */
    Gate?: Promise<void>;
}

/** A transaction group whose submit reports each item's planned outcome without a database. */
class FakeTransactionGroup extends TransactionGroupBase {
    private readonly outcomes = new Map<TransactionItem, boolean>();

    public Plan(item: PlannedItem, onRaise?: () => void): void {
        const raise = (): void => {
            onRaise?.();
            raiseSave(item.Owner, item.Row, item.Entity);
        };
        const entity = { ProviderToUse: item.Owner } as unknown as BaseEntity;
        const transaction = new TransactionItem(entity, 'Create', '', null, null, async (_result, success) => {
            await item.Gate;
            if (item.CallbackThrows && success) {
                throw new Error('finalizing the entity failed');
            }
            if (success && item.RaiseFrom === 'callback') {
                raise();
            }
        });
        if (item.RaiseFrom !== 'callback') {
            // As BaseEntity.Save() does for an entity in a group.
            this.TransactionNotifications$.subscribe(({ success, results }) => {
                if (success && results?.some(r => r.Transaction === transaction)) {
                    raise();
                }
            });
        }
        this.outcomes.set(transaction, item.Succeeds ?? true);
        this.AddTransaction(transaction);
    }

    protected async HandleSubmit(): Promise<TransactionResult[]> {
        return this.PendingTransactions.map(t => new TransactionResult(t, {}, this.outcomes.get(t) ?? false));
    }
}

describe('TransactionGroupBase.Submit batches cache maintenance', () => {
    let manager: LocalCacheManager;
    let slotWrites: string[];

    async function rows(fingerprint: string): Promise<Row[] | null> {
        const cached = await manager.GetRunViewResult(fingerprint);
        return cached ? (cached.results as Row[]).map(r => ({ ...r })).sort((a, b) => String(a.ID).localeCompare(String(b.ID))) : null;
    }

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        const storage = new MockCacheStorageProvider();
        await manager.Initialize(storage);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'one' }], '');
        slotWrites = [];
        const original = storage.SetItem.bind(storage);
        vi.spyOn(storage, 'SetItem').mockImplementation(async (k: string, v: string, c?: string) => {
            if (k.startsWith(ENTITY) || k.startsWith(OTHER_ENTITY)) {
                slotWrites.push(k);
            }
            return original(k, v, c);
        });
    });

    it('rewrites each slot once for the whole group', async () => {
        const owner = newOwner();
        const group = new FakeTransactionGroup();
        const batchingWhenRaised: boolean[] = [];
        for (const id of ['2', '3', '4']) {
            group.Plan({ Owner: owner, Row: { ID: id, Name: `row ${id}` } }, () => batchingWhenRaised.push(manager.IsBatchingEntityEvents(owner)));
        }

        expect(await group.Submit()).toBe(true);
        await settle();

        expect(slotWrites).toEqual([UNFILTERED]);
        expect(batchingWhenRaised).toEqual([true, true, true]);
        expect(manager.IsBatchingEntityEvents(owner)).toBe(false);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3', '4']);
    });

    it('writes each cache key once when the group spans several entities and keys', async () => {
        await manager.SetRunViewResult(FILTERED, { EntityName: ENTITY, ExtraFilter: "Color='red'" } as RunViewParams, [{ ID: '1', Name: 'one' }], '');
        await manager.SetRunViewResult(OTHER_UNFILTERED, { EntityName: OTHER_ENTITY } as RunViewParams, [{ ID: 'g1', Name: 'gadget one' }], '');
        slotWrites.length = 0;
        const owner = newOwner();
        const group = new FakeTransactionGroup();
        group.Plan({ Owner: owner, Row: { ID: '2', Name: 'widget two' } });
        group.Plan({ Owner: owner, Row: { ID: 'g2', Name: 'gadget two' }, Entity: OTHER_ENTITY_INFO });
        group.Plan({ Owner: owner, Row: { ID: '3', Name: 'widget three' } });
        group.Plan({ Owner: owner, Row: { ID: 'g3', Name: 'gadget three' }, Entity: OTHER_ENTITY_INFO });

        expect(await group.Submit()).toBe(true);
        await settle();

        expect([...slotWrites].sort()).toEqual([OTHER_UNFILTERED, UNFILTERED]);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3']);
        expect((await rows(OTHER_UNFILTERED))?.map(r => r.ID)).toEqual(['g1', 'g2', 'g3']);
        // A filtered slot cannot be evaluated in memory, so it is invalidated rather than rewritten.
        expect(await rows(FILTERED)).toBeNull();
    });

    it('also batches saves raised from the items\' callbacks', async () => {
        const owner = newOwner();
        const group = new FakeTransactionGroup();
        for (const id of ['2', '3', '4']) {
            group.Plan({ Owner: owner, Row: { ID: id, Name: `row ${id}` }, RaiseFrom: 'callback' });
        }

        expect(await group.Submit()).toBe(true);
        await settle();

        expect(slotWrites).toEqual([UNFILTERED]);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3', '4']);
    });

    it('invalidates the slot instead of applying part of a group that did not fully succeed', async () => {
        const owner = newOwner();
        const group = new FakeTransactionGroup();
        group.Plan({ Owner: owner, Row: { ID: '2', Name: 'saved' }, RaiseFrom: 'callback' });
        group.Plan({ Owner: owner, Row: { ID: '3', Name: 'failed' }, Succeeds: false, RaiseFrom: 'callback' });

        expect(await group.Submit()).toBe(false);
        await settle();

        expect(slotWrites).toHaveLength(0);
        expect(await rows(UNFILTERED)).toBeNull();
    });

    it('invalidates the slot when a callback throws after earlier items raised their saves', async () => {
        const owner = newOwner();
        const group = new FakeTransactionGroup();
        group.Plan({ Owner: owner, Row: { ID: '2', Name: 'saved' }, RaiseFrom: 'callback' });
        group.Plan({ Owner: owner, Row: { ID: '3', Name: 'throws' }, CallbackThrows: true, RaiseFrom: 'callback' });

        expect(await group.Submit()).toBe(false);
        await settle();

        expect(manager.IsBatchingEntityEvents(owner)).toBe(false);
        expect(slotWrites).toHaveLength(0);
        expect(await rows(UNFILTERED)).toBeNull();
    });

    it('opens one batch per provider when the group spans several', async () => {
        const first = newOwner();
        const second = newOwner();
        const group = new FakeTransactionGroup();
        group.Plan({ Owner: first, Row: { ID: '2', Name: 'a' } });
        group.Plan({ Owner: second, Row: { ID: '3', Name: 'b' } });
        group.Plan({ Owner: first, Row: { ID: '4', Name: 'c' } });
        group.Plan({ Owner: second, Row: { ID: '5', Name: 'd' } });

        expect(await group.Submit()).toBe(true);
        await settle();

        expect(slotWrites).toEqual([UNFILTERED, UNFILTERED]);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('inside an open batch for the same provider, leaves applying to the outer close', async () => {
        const owner = newOwner();
        manager.BeginEntityEventBatch(owner);
        const group = new FakeTransactionGroup();
        group.Plan({ Owner: owner, Row: { ID: '2', Name: 'a' } });
        group.Plan({ Owner: owner, Row: { ID: '3', Name: 'b' } });

        expect(await group.Submit()).toBe(true);
        await settle();
        expect(slotWrites).toHaveLength(0);
        expect(manager.IsBatchingEntityEvents(owner)).toBe(true);

        await manager.EndEntityEventBatch(owner, true);
        expect(slotWrites).toEqual([UNFILTERED]);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3']);
    });

    it('applies two overlapping groups on one provider once, when the second of them finishes', async () => {
        const owner = newOwner();
        let release = (): void => undefined;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const first = new FakeTransactionGroup();
        first.Plan({ Owner: owner, Row: { ID: '2', Name: 'first' }, Gate: gate });
        const second = new FakeTransactionGroup();
        second.Plan({ Owner: owner, Row: { ID: '3', Name: 'second' } });

        const firstDone = first.Submit();
        await settle();
        expect(await second.Submit()).toBe(true);
        await settle();
        expect(slotWrites).toHaveLength(0);

        release();
        expect(await firstDone).toBe(true);
        expect(manager.IsBatchingEntityEvents(owner)).toBe(false);
        expect(slotWrites).toEqual([UNFILTERED]);
        expect((await rows(UNFILTERED))?.map(r => r.ID)).toEqual(['1', '2', '3']);
    });

    it('invalidates instead of applying when either of two overlapping groups on one provider fails', async () => {
        const owner = newOwner();
        let release = (): void => undefined;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const succeeding = new FakeTransactionGroup();
        succeeding.Plan({ Owner: owner, Row: { ID: '2', Name: 'kept' }, Gate: gate });
        const failing = new FakeTransactionGroup();
        failing.Plan({ Owner: owner, Row: { ID: '3', Name: 'saved' }, RaiseFrom: 'callback' });
        failing.Plan({ Owner: owner, Row: { ID: '4', Name: 'refused' }, Succeeds: false, RaiseFrom: 'callback' });

        const succeedingDone = succeeding.Submit();
        await settle();
        expect(await failing.Submit()).toBe(false);
        release();
        expect(await succeedingDone).toBe(true);
        await settle();

        expect(manager.IsBatchingEntityEvents(owner)).toBe(false);
        expect(slotWrites).toHaveLength(0);
        expect(await rows(UNFILTERED)).toBeNull();
    });

    it('opens no batch while the cache manager is not initialized', async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        const uninitialized = LocalCacheManager.Instance;
        const owner = newOwner();
        const group = new FakeTransactionGroup();
        const batching: boolean[] = [];
        group.Plan({ Owner: owner, Row: { ID: '2', Name: 'a' } }, () => batching.push(uninitialized.IsBatchingEntityEvents(owner)));

        expect(await group.Submit()).toBe(true);
        expect(batching).toEqual([false]);
    });
});
