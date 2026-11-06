import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

type GeoCleanup = { cleanupGeoCodesForDeletedRecord(entity: BaseEntity, contextUser: UserInfo): Promise<void> };

/** Runs the cleanup for a key and returns the filter it asked for. */
async function filterFor(...values: string[]): Promise<string | undefined> {
    const runView = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: [] } as never);
    const entity = {
        EntityInfo: { ID: 'entity-1' },
        PrimaryKey: { KeyValuePairs: values.map((Value, i) => ({ FieldName: `K${i}`, Value })) },
    } as unknown as BaseEntity;
    const cleanup = GenericDatabaseProvider.prototype as unknown as GeoCleanup;
    await cleanup.cleanupGeoCodesForDeletedRecord(entity, {} as UserInfo);
    return (runView.mock.calls[0][0] as RunViewParams).ExtraFilter;
}

describe('GenericDatabaseProvider geo cleanup key', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('leaves a plain key unchanged', async () => {
        expect(await filterFor('abc')).toBe(`EntityID='entity-1' AND RecordID='abc'`);
    });

    it('escapes a quote in the key', async () => {
        expect(await filterFor(`it's`)).toBe(`EntityID='entity-1' AND RecordID='it''s'`);
    });

    it('escapes a quote in a composite key', async () => {
        expect(await filterFor(`a'b`, 'c')).toBe(`EntityID='entity-1' AND RecordID='a''b||c'`);
    });
});
