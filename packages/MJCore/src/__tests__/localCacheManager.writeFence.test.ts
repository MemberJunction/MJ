/**
 * Reads after a write see the write (#3059).
 *
 * Event maintenance of cached RunView slots runs after a save returns, and nothing ordered it
 * against reads: a read could be served a slot the maintenance had not reached, and a read that
 * began before a save could store its pre-save rows after the maintenance ran, where they were
 * served as a hit until the slot expired. The write fence closes both: reads miss while a save's
 * maintenance runs, and a fill whose read began before a save of its entity is not stored.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore, MJEventType, MJGlobal } from '@memberjunction/global';
import { LocalCacheManager } from '../generic/localCacheManager';
import { EntityWriteFence } from '../generic/entityWriteFence';
import { BaseEntity } from '../generic/baseEntity';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

const ENTITY = 'Fence Widgets';
const OTHER_ENTITY = 'Fence Gadgets';
const UNFILTERED = `${ENTITY}|_|_|-1|0|_|_`;
const FILTERED = `${ENTITY}|Color='red'|_|-1|0|_|_`;
const OTHER_FILTERED = `${OTHER_ENTITY}|Color='red'|_|-1|0|_|_`;
const PARAMS = { EntityName: ENTITY } as RunViewParams;
const OTHER_PARAMS = { EntityName: OTHER_ENTITY } as RunViewParams;

type Row = Record<string, unknown>;

function entityInfo(name: string) {
    return {
        Name: name,
        PrimaryKeys: [{ Name: 'ID' }],
        AllowCaching: true,
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Color' }],
    };
}

/** Raises a completed save the way BaseEntity.Save() does, through an optional provider. */
function raiseSave(fields: Row, owner: object = { name: 'provider' }, name: string = ENTITY): void {
    MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        component: null,
        args: {
            type: 'save',
            payload: null,
            baseEntity: { EntityInfo: entityInfo(name), ProviderToUse: owner, GetAll: () => ({ ...fields }) },
        },
    });
}

/** Lets fire-and-forget event handlers finish. */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

describe('LocalCacheManager write fence (#3059)', () => {
    let manager: LocalCacheManager;
    let storage: MockCacheStorageProvider;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        storage = new MockCacheStorageProvider();
        await manager.Initialize(storage);
    });

    it('a filtered view read after a save misses, and the next fill is served', async () => {
        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '');
        expect(await manager.GetRunViewResult(FILTERED)).not.toBeNull();

        raiseSave({ ID: '2', Name: 'two', Color: 'red' });
        // Before the maintenance has run: the slot must not be served.
        expect(await manager.GetRunViewResult(FILTERED)).toBeNull();
        await settle();
        expect(await manager.GetRunViewResult(FILTERED)).toBeNull();

        const fence = manager.CaptureReadFence();
        await manager.SetRunViewResult(FILTERED, PARAMS,
            [{ ID: '1', Name: 'one', Color: 'red' }, { ID: '2', Name: 'two', Color: 'red' }], '', undefined, undefined, undefined, undefined,
            { ReadFence: fence });
        expect((await manager.GetRunViewResult(FILTERED))?.results).toHaveLength(2);
    });

    it('an unfiltered slot misses while a save is being applied, then serves the updated row', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '');

        raiseSave({ ID: '1', Name: 'renamed', Color: 'red' });
        expect(await manager.GetRunViewResult(UNFILTERED)).toBeNull();
        expect((await manager.GetRunViewResults([UNFILTERED])).get(UNFILTERED)).toBeNull();

        await settle();
        const cached = await manager.GetRunViewResult(UNFILTERED);
        expect((cached?.results as Row[])[0]['Name']).toBe('renamed');
    });

    it('a read that began before a save does not store its rows', async () => {
        const fence = manager.CaptureReadFence();
        raiseSave({ ID: '2', Name: 'two', Color: 'red' });
        await settle();

        // The slow read finishes after the save's maintenance ran, with pre-save rows.
        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '',
            undefined, undefined, undefined, undefined, { ReadFence: fence });
        expect(await manager.GetRunViewResult(FILTERED)).toBeNull();
        expect(manager.GetFingerprintsForEntity(ENTITY).has(FILTERED)).toBe(false);
    });

    it('rows are taken back out when a save lands while they are being stored', async () => {
        const fence = manager.CaptureReadFence();
        const original = storage.SetItem.bind(storage);
        let raised = false;
        vi.spyOn(storage, 'SetItem').mockImplementation(async (k: string, v: string, c?: string) => {
            if (k === FILTERED && !raised) {
                // The save lands after the fill passed its first check, and its maintenance
                // finishes before the slot is stored, so it never sees these rows.
                raised = true;
                raiseSave({ ID: '2', Name: 'two', Color: 'red' });
                await settle();
            }
            await original(k, v, c);
        });

        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '',
            undefined, undefined, undefined, undefined, { ReadFence: fence });
        await settle();
        expect(raised).toBe(true);
        expect(await manager.GetRunViewResult(FILTERED)).toBeNull();
    });

    it('a save of another entity neither refuses the fill nor hides the slot', async () => {
        await manager.SetRunViewResult(OTHER_FILTERED, OTHER_PARAMS, [{ ID: '8', Name: 'gadget', Color: 'red' }], '');
        const fence = manager.CaptureReadFence();
        raiseSave({ ID: '9', Name: 'gadget', Color: 'red' }, { name: 'provider' }, OTHER_ENTITY);
        expect(await manager.GetRunViewResult(OTHER_FILTERED)).toBeNull();

        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '',
            undefined, undefined, undefined, undefined, { ReadFence: fence });
        // Read while the other entity's maintenance is still running.
        expect(await manager.GetRunViewResult(FILTERED)).not.toBeNull();
        await settle();
    });

    it('a fill without a read fence is stored as before', async () => {
        raiseSave({ ID: '2', Name: 'two', Color: 'red' });
        await settle();
        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '');
        expect(await manager.GetRunViewResult(FILTERED)).not.toBeNull();
    });

    it('closing a batch counts as a write: a fill whose read began before the close is refused', async () => {
        const owner = { name: 'provider' };
        manager.BeginEntityEventBatch(owner);
        raiseSave({ ID: '2', Name: 'two', Color: 'red' }, owner);
        // Read began inside the unit of work, before its commit.
        const fence = manager.CaptureReadFence();
        await manager.EndEntityEventBatch(owner, true);

        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '',
            undefined, undefined, undefined, undefined, { ReadFence: fence });
        expect(await manager.GetRunViewResult(FILTERED)).toBeNull();

        const after = manager.CaptureReadFence();
        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '',
            undefined, undefined, undefined, undefined, { ReadFence: after });
        expect(await manager.GetRunViewResult(FILTERED)).not.toBeNull();
    });

    it('reads miss while a closed batch is being applied', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '');
        const owner = { name: 'provider' };
        manager.BeginEntityEventBatch(owner);
        raiseSave({ ID: '1', Name: 'renamed', Color: 'red' }, owner);

        const closing = manager.EndEntityEventBatch(owner, true);
        expect(await manager.GetRunViewResult(UNFILTERED)).toBeNull();
        await closing;
        expect(((await manager.GetRunViewResult(UNFILTERED))?.results as Row[])[0]['Name']).toBe('renamed');
    });

    it('matches the saved entity to the slot without regard to case', async () => {
        const fence = manager.CaptureReadFence();
        raiseSave({ ID: '2', Name: 'two', Color: 'red' }, { name: 'provider' }, ENTITY.toUpperCase());
        await settle();
        await manager.SetRunViewResult(FILTERED, PARAMS, [{ ID: '1', Name: 'one', Color: 'red' }], '',
            undefined, undefined, undefined, undefined, { ReadFence: fence });
        expect(await manager.GetRunViewResult(FILTERED)).toBeNull();
    });
});

describe('EntityWriteFence', () => {
    it('reports a write after the captured sequence only, per entity, ignoring case', () => {
        const fence = new EntityWriteFence();
        const before = fence.Current;
        fence.RecordWrite('Widgets');
        expect(fence.WrittenSince('widgets', before)).toBe(true);
        expect(fence.WrittenSince('Gadgets', before)).toBe(false);
        expect(fence.WrittenSince('Widgets', fence.Current)).toBe(false);
    });

    it('counts overlapping maintenance passes and ends them when the work settles, even on failure', async () => {
        const fence = new EntityWriteFence();
        let release: () => void = () => undefined;
        const first = fence.Maintain(['Widgets'], () => new Promise<void>(resolve => { release = resolve; }));
        const second = fence.Maintain(['widgets'], () => Promise.reject(new Error('maintenance failed')));
        expect(fence.IsMaintaining('WIDGETS')).toBe(true);

        await expect(second).rejects.toThrow('maintenance failed');
        expect(fence.IsMaintaining('Widgets')).toBe(true);

        release();
        await first;
        expect(fence.IsMaintaining('Widgets')).toBe(false);
    });

    it('ignores empty entity names', () => {
        const fence = new EntityWriteFence();
        fence.RecordWrite('');
        expect(fence.Current).toBe(0);
        fence.EndMaintenance('Widgets');
        expect(fence.IsMaintaining('Widgets')).toBe(false);
    });
});
