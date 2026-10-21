/**
 * Tests for EntityRecordNameCache, the record-name cache a single-user (client-side) provider
 * keeps so UI code can show a record's name synchronously.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityRecordNameCache } from '../generic/entityRecordNameCache';
import { CompositeKey } from '../generic/compositeKey';
import { EntityRecordNameInput, EntityRecordNameResult } from '../generic/interfaces';

function keyFor(id: string): CompositeKey {
    return CompositeKey.FromID(id);
}

/** A fetcher that names each record after its key and counts the records it was asked for. */
class CountingFetcher {
    public Requested = 0;

    public One = async (entityName: string, key: CompositeKey): Promise<string> => {
        this.Requested++;
        return `${entityName}:${key.ToString()}`;
    };

    public Many = async (info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> => {
        this.Requested += info.length;
        return info.map(i => ({
            EntityName: i.EntityName,
            CompositeKey: i.CompositeKey,
            Status: 'success',
            Success: true,
            RecordName: `${i.EntityName}:${i.CompositeKey.ToString()}`,
        }));
    };
}

describe('EntityRecordNameCache', () => {
    let cache: EntityRecordNameCache;
    let fetcher: CountingFetcher;

    beforeEach(() => {
        cache = new EntityRecordNameCache();
        fetcher = new CountingFetcher();
    });

    it('returns a name that was set, and reports it as cached', () => {
        cache.Set('Accounts', keyFor('1'), 'Acme Corp');

        expect(cache.Get('Accounts', keyFor('1'))).toBe('Acme Corp');
        expect(cache.Has('Accounts', keyFor('1'))).toBe(true);
        expect(cache.Has('Accounts', keyFor('2'))).toBe(false);
    });

    it('fetches a name once and serves repeats from memory', async () => {
        const fetch = () => fetcher.One('Accounts', keyFor('1'));

        await cache.GetOrFetch('Accounts', keyFor('1'), false, fetch);
        const second = await cache.GetOrFetch('Accounts', keyFor('1'), false, fetch);

        expect(second).toBe('Accounts:ID=1');
        expect(fetcher.Requested).toBe(1);
    });

    it('fetches again when forceRefresh is set', async () => {
        const fetch = () => fetcher.One('Accounts', keyFor('1'));

        await cache.GetOrFetch('Accounts', keyFor('1'), false, fetch);
        await cache.GetOrFetch('Accounts', keyFor('1'), true, fetch);

        expect(fetcher.Requested).toBe(2);
    });

    it('does not cache an empty name, so a missing or withheld name is asked for again', async () => {
        const fetch = async () => '';

        await cache.GetOrFetch('Accounts', keyFor('1'), false, fetch);

        expect(cache.Has('Accounts', keyFor('1'))).toBe(false);
    });

    it('fetches only the uncached records of a batch, and keeps the input order', async () => {
        cache.Set('Accounts', keyFor('2'), 'Cached Two');
        const info = ['1', '2', '3'].map(id => ({ EntityName: 'Accounts', CompositeKey: keyFor(id) }));

        const results = await cache.GetOrFetchMany(info, false, fetcher.Many);

        expect(results.map(r => r.RecordName)).toEqual(['Accounts:ID=1', 'Cached Two', 'Accounts:ID=3']);
        expect(fetcher.Requested).toBe(2);
        expect(cache.Get('Accounts', keyFor('3'))).toBe('Accounts:ID=3');
    });

    it('is bounded — it stops growing at its maximum size', () => {
        const small = new EntityRecordNameCache(5);
        for (let i = 0; i < 50; i++) {
            small.Set('Accounts', keyFor(String(i)), `Account ${i}`);
        }

        expect(small.Size).toBe(5);
        expect(small.Get('Accounts', keyFor('49'))).toBe('Account 49');
        expect(small.Get('Accounts', keyFor('0'))).toBeUndefined();
    });

    it('evicts the least-recently-used entry once full', () => {
        const small = new EntityRecordNameCache(2);
        small.Set('Accounts', keyFor('1'), 'One');
        small.Set('Accounts', keyFor('2'), 'Two');
        small.Get('Accounts', keyFor('1'));
        small.Set('Accounts', keyFor('3'), 'Three');

        expect(small.Get('Accounts', keyFor('1'))).toBe('One');
        expect(small.Get('Accounts', keyFor('2'))).toBeUndefined();
    });
});
