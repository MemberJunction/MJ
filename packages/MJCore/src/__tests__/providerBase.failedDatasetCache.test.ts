/**
 * Tests for the dataset cache when a dataset read fails.
 *
 * A failed or undated dataset result must never be written to the local cache, so it cannot be
 * served later as a fresh copy. A failed status read must count as "not up to date" instead of
 * throwing on its missing `LatestUpdateDate`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatasetResultType, DatasetStatusResultType, ILocalStorageProvider } from '../generic/interfaces';
import { InMemoryLocalStorageProvider } from '../generic/InMemoryLocalStorageProvider';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

const DATASET = 'Some Dataset';

function failedDataset(): DatasetResultType {
    return {
        DatasetID: '',
        DatasetName: DATASET,
        Success: false,
        Status: 'User restricted@example.com does not have read permissions',
        LatestUpdateDate: null as unknown as Date,
        Results: [],
    };
}

function goodDataset(): DatasetResultType {
    return {
        DatasetID: 'D1',
        DatasetName: DATASET,
        Success: true,
        Status: 'OK',
        LatestUpdateDate: new Date('2026-06-01T12:00:00.000Z'),
        Results: [],
    };
}

describe('ProviderBase dataset cache after a failed dataset read', () => {
    let provider: TestMetadataProvider;
    let storage: InMemoryLocalStorageProvider;
    let setItem: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        provider = new TestMetadataProvider();
        storage = new InMemoryLocalStorageProvider();
        setItem = vi.spyOn(storage, 'SetItem');
        vi.spyOn(provider, 'LocalStorageProvider', 'get').mockReturnValue(storage as ILocalStorageProvider);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('GetAndCacheDatasetByName returns a failed read without caching it', async () => {
        vi.spyOn(provider, 'GetDatasetByName').mockResolvedValue(failedDataset());

        const result = await provider.GetAndCacheDatasetByName(DATASET);

        expect(result.Success).toBe(false);
        expect(setItem).not.toHaveBeenCalled();
        expect(await provider.IsDatasetCached(DATASET)).toBe(false);
    });

    it('CacheDataset refuses a failed or undated dataset', async () => {
        await expect(provider.CacheDataset(DATASET, undefined, failedDataset())).resolves.toBeUndefined();
        await expect(provider.CacheDataset(DATASET, undefined, { ...goodDataset(), LatestUpdateDate: null as unknown as Date })).resolves.toBeUndefined();
        await expect(provider.CacheDataset(DATASET, undefined, { ...goodDataset(), LatestUpdateDate: new Date('not a date') })).resolves.toBeUndefined();

        expect(setItem).not.toHaveBeenCalled();
    });

    it('does not cache a failed read that carries a placeholder date', async () => {
        vi.spyOn(provider, 'GetDatasetByName').mockResolvedValue({ ...failedDataset(), LatestUpdateDate: new Date(0) });

        const result = await provider.GetAndCacheDatasetByName(DATASET);

        expect(result.Success).toBe(false);
        expect(await provider.IsDatasetCached(DATASET)).toBe(false);
    });

    it('treats a failed status read with a placeholder date on a warm cache as out of date', async () => {
        await provider.CacheDataset(DATASET, undefined, goodDataset());
        vi.spyOn(provider, 'GetDatasetStatusByName').mockResolvedValue({
            DatasetID: '',
            DatasetName: DATASET,
            Success: false,
            Status: 'Batch execution failed',
            LatestUpdateDate: new Date(0),
            EntityUpdateDates: [],
        });

        await expect(provider.IsDatasetCacheUpToDate(DATASET)).resolves.toBe(false);
    });

    it('treats a failed status read on a warm cache as out of date, without throwing', async () => {
        await provider.CacheDataset(DATASET, undefined, goodDataset());
        const failedStatus: DatasetStatusResultType = {
            DatasetID: '',
            DatasetName: DATASET,
            Success: false,
            Status: 'User restricted@example.com does not have read permissions',
            LatestUpdateDate: null as unknown as Date,
            EntityUpdateDates: null as unknown as DatasetStatusResultType['EntityUpdateDates'],
        };
        vi.spyOn(provider, 'GetDatasetStatusByName').mockResolvedValue(failedStatus);
        vi.spyOn(provider, 'GetDatasetByName').mockResolvedValue(failedDataset());

        await expect(provider.IsDatasetCacheUpToDate(DATASET)).resolves.toBe(false);
        const result = await provider.GetAndCacheDatasetByName(DATASET);
        expect(result.Success).toBe(false);
    });
});
