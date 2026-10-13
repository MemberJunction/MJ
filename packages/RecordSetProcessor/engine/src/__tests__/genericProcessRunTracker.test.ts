import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJProcessRunDetailEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import type { RecordRef, RunHandle } from '@memberjunction/record-set-processor-base';
import { GenericProcessRunTracker } from '../trackers/GenericProcessRunTracker';

/** The detail fields the tracker writes, on a plain object standing in for the entity. */
type DetailDouble = Partial<Pick<MJProcessRunDetailEntity, 'ProcessRunID' | 'Status' | 'ErrorMessage' | 'Warnings' | 'ResultPayload'>> & {
    NewRecord: () => void;
    Save: () => Promise<boolean>;
};

/** A provider whose GetEntityObject hands out one detail double. */
function providerFor(detail: DetailDouble): IMetadataProvider {
    // a Pick double of the provider: the tracker only calls GetEntityObject
    const provider: Pick<IMetadataProvider, 'GetEntityObject'> = { GetEntityObject: vi.fn().mockResolvedValue(detail) };
    return provider as IMetadataProvider;
}

const user = { ID: 'u1' } as UserInfo; // only the ID is read
const record: RecordRef = { EntityID: 'ent-1', RecordID: 'r1' };
// a run handle carrying the run entity the tracker reads its ID from; only ID is read here
const handle: RunHandle = { ProcessRunID: 'run-1', run: { ID: 'run-1' } as MJProcessRunEntity };

describe('GenericProcessRunTracker.RecordResult', () => {
    it('writes a succeeded record\'s warnings to the Warnings column as JSON, never to ErrorMessage', async () => {
        const detail: DetailDouble = { NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true) };
        await new GenericProcessRunTracker().RecordResult(handle, record,
            { Status: 'Succeeded', Warnings: ['failed storing cache entry: deadlock', 'second'] }, user, providerFor(detail));
        expect(detail.ErrorMessage).toBeNull();
        expect(detail.Warnings).toBe(JSON.stringify(['failed storing cache entry: deadlock', 'second']));
    });

    it('keeps a failure in ErrorMessage and leaves Warnings empty when there are none', async () => {
        const detail: DetailDouble = { NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true) };
        await new GenericProcessRunTracker().RecordResult(handle, record,
            { Status: 'Failed', ErrorMessage: 'Feature Value write failed' }, user, providerFor(detail));
        expect(detail.ErrorMessage).toBe('Feature Value write failed');
        expect(detail.Warnings).toBeNull();
    });
});
