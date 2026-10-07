/**
 * ProviderBase keeps no record-name cache.
 *
 * A provider on a server is shared by every user in the process, and a record's name can be
 * withheld from some of them by field-level security, so a name cached for one user must never
 * be served to another. ProviderBase therefore always asks its subclass; a single-user client
 * provider adds its own cache (see EntityRecordNameCache).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { CompositeKey } from '../generic/compositeKey';
import { EntityRecordNameInput, EntityRecordNameResult } from '../generic/interfaces';

// Counts the lookups ProviderBase delegates to its subclass.
class TestableProvider extends ProviderBase {
    public lookupCallCount = 0;

    protected async InternalGetEntityRecordName(entityName: string, compositeKey: CompositeKey): Promise<string> {
        this.lookupCallCount++;
        return `${entityName}:${compositeKey.ToString()}`;
    }

    protected async InternalGetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
        this.lookupCallCount += info.length;
        return info.map((i) => ({
            EntityName: i.EntityName,
            CompositeKey: i.CompositeKey,
            Status: 'success',
            Success: true,
            RecordName: `${i.EntityName}:${i.CompositeKey.ToString()}`,
        }));
    }

    // Required abstract implementations (unused in these tests)
    get ProviderType() { return 0 as never; }
    get StartedAt() { return new Date(); }
    async GetRecordFavoriteStatus() { return false; }
    async SetRecordFavoriteStatus() {}
    async GetRecordDuplicates() { return null as never; }
    async MergeRecords() { return null as never; }
    async GetRecordDependencies() { return [] as never; }
    async GetDatasetByName() { return null as never; }
    async GetDatasetStatusByName() { return null as never; }
    async CreateTransactionGroup() { return null as never; }
    async Refresh() { return true; }
    get AllEntities() { return []; }
    get AllApplications() { return []; }
    get CurrentUser() { return null as never; }
    get Entities() { return []; }
    get Applications() { return []; }
    get LatestLocalMetadataTimestamps() { return []; }
    get LatestRemoteMetadataTimestamps() { return []; }
    get LocalStorageProvider() { return null as never; }
}

function keyFor(id: string): CompositeKey {
    return CompositeKey.FromID(id);
}

describe('ProviderBase record names', () => {
    let provider: TestableProvider;

    beforeEach(() => {
        provider = new TestableProvider();
    });

    it('looks a name up every time rather than serving a remembered one', async () => {
        await provider.GetEntityRecordName('Accounts', keyFor('1'));
        await provider.GetEntityRecordName('Accounts', keyFor('1'));

        expect(provider.lookupCallCount).toBe(2);
    });

    it('looks every record of a batch up every time', async () => {
        const info = [{ EntityName: 'Accounts', CompositeKey: keyFor('1') }, { EntityName: 'Accounts', CompositeKey: keyFor('2') }];

        await provider.GetEntityRecordNames(info);
        const results = await provider.GetEntityRecordNames(info);

        expect(provider.lookupCallCount).toBe(4);
        expect(results.map(r => r.RecordName)).toEqual(['Accounts:ID=1', 'Accounts:ID=2']);
    });

    it('does not keep a name handed to SetCachedRecordName', () => {
        provider.SetCachedRecordName('Accounts', keyFor('1'), 'Acme Corp');

        expect(provider.HasCachedRecordName('Accounts', keyFor('1'))).toBe(false);
        expect(provider.GetCachedRecordNameOnlyIfCached('Accounts', keyFor('1'))).toBeUndefined();
    });

    it('does not keep a name it looked up', async () => {
        await provider.GetEntityRecordName('Accounts', keyFor('1'));

        expect(provider.GetCachedRecordNameOnlyIfCached('Accounts', keyFor('1'))).toBeUndefined();
    });

    it('GetCachedRecordName looks the name up when asked to, and otherwise answers not cached', async () => {
        expect(await provider.GetCachedRecordName('Accounts', keyFor('1'))).toBeUndefined();
        expect(await provider.GetCachedRecordName('Accounts', keyFor('1'), true)).toBe('Accounts:ID=1');
        expect(provider.lookupCallCount).toBe(1);
    });
});
