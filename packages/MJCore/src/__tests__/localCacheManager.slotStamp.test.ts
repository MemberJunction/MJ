/**
 * The slot-maintenance funnel stamps `maxUpdatedAt` from the rows, like the fill path does
 *.
 *
 * It used to stamp the event time. That value never matched anything a reader held or the
 * database reported, so the client smart-cache check could not recognise a maintained slot as
 * current, and a payload's stamp said nothing about its rows.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { CompositeKey } from '../generic/compositeKey';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

const FP = 'Widgets|_|_|-1|0|_|_';
const PARAMS = { EntityName: 'Widgets' } as RunViewParams;
const EVENT_TIME = '2030-01-01T00:00:00.000Z';

function key(id: string): CompositeKey {
    const k = new CompositeKey();
    k.KeyValuePairs = [{ FieldName: 'ID', Value: id }];
    return k;
}

describe('LocalCacheManager slot maintenance stamp', () => {
    let manager: LocalCacheManager;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        manager = LocalCacheManager.Instance;
        await manager.Initialize(new MockCacheStorageProvider());
    });

    it('stamps an upserted slot with the newest row timestamp, not the event time', async () => {
        await manager.SetRunViewResult(FP, PARAMS, [
            { ID: '1', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' },
        ], '2026-01-01T00:00:00.000Z');

        await manager.UpsertSingleEntity(FP, { ID: '2', __mj_UpdatedAt: new Date('2026-02-01T00:00:00.000Z') }, key('2'), EVENT_TIME);

        expect((await manager.GetRunViewResult(FP))?.maxUpdatedAt).toBe('2026-02-01T00:00:00.000Z');
    });

    it('lowers the stamp when the newest row is removed, as the database would report', async () => {
        await manager.SetRunViewResult(FP, PARAMS, [
            { ID: '1', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' },
            { ID: '2', __mj_UpdatedAt: '2026-02-01T00:00:00.000Z' },
        ], '2026-02-01T00:00:00.000Z');

        await manager.RemoveSingleEntity(FP, key('2'), EVENT_TIME);

        expect((await manager.GetRunViewResult(FP))?.maxUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('falls back to the caller\'s stamp when the rows have no __mj_UpdatedAt column', async () => {
        await manager.SetRunViewResult(FP, PARAMS, [{ ID: '1' }], '');
        await manager.UpsertSingleEntity(FP, { ID: '2' }, key('2'), EVENT_TIME);
        expect((await manager.GetRunViewResult(FP))?.maxUpdatedAt).toBe(EVENT_TIME);
    });

    it('MaxUpdatedAtOfRows: empty set, mixed Date/string values, unreadable values', () => {
        expect(LocalCacheManager.MaxUpdatedAtOfRows([])).toBe('');
        expect(LocalCacheManager.MaxUpdatedAtOfRows([{ ID: 1 }])).toBeUndefined();
        expect(LocalCacheManager.MaxUpdatedAtOfRows([
            { __mj_UpdatedAt: new Date('2026-03-01T00:00:00.000Z') },
            { __mj_UpdatedAt: '2026-04-01T00:00:00.000Z' },
            { __mj_UpdatedAt: 'garbage' },
        ])).toBe('2026-04-01T00:00:00.000Z');
        expect(LocalCacheManager.MaxUpdatedAtOfRows([{ __mj_UpdatedAt: null }])).toBe('');
    });
});
