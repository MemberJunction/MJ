import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpsert = vi.fn();
const mockSetPayload = vi.fn();
const mockDelete = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
    QdrantClient: class MockQdrantClient {
        public upsert = mockUpsert;
        public setPayload = mockSetPayload;
        public delete = mockDelete;
    },
}));

vi.mock('../config', () => ({
    QdrantUrl: 'http://localhost:6333',
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    UserInfo: class {},
}));

import { QdrantDatabase } from '../models/QdrantDatabase.js';

describe('QdrantDatabase — UpdateRecords and DeleteRecords', () => {
    let db: QdrantDatabase;

    beforeEach(() => {
        mockUpsert.mockReset().mockResolvedValue({ status: 'completed' });
        mockSetPayload.mockReset().mockResolvedValue({ status: 'completed' });
        mockDelete.mockReset().mockResolvedValue({ status: 'completed' });
        db = new QdrantDatabase('test-api-key');
    });

    it('routes metadata-only updates (omitted or empty values) to setPayload without touching stored vectors', async () => {
        const result = await db.UpdateRecords(
            [
                { id: 'v1', metadata: { Title: 'Updated 1' } },
                { id: 'v2', values: [], metadata: { Title: 'Updated 2' } },
            ],
            'idx-collection',
        );
        expect(result.success).toBe(true);
        expect(mockUpsert).not.toHaveBeenCalled();
        expect(mockSetPayload).toHaveBeenCalledTimes(2);
        expect(mockSetPayload).toHaveBeenNthCalledWith(1, 'idx-collection', {
            payload: { Title: 'Updated 1' },
            points: ['v1'],
        });
        expect(mockSetPayload).toHaveBeenNthCalledWith(2, 'idx-collection', {
            payload: { Title: 'Updated 2' },
            points: ['v2'],
        });
    });

    it('upserts records that carry non-empty values and uses setPayload for metadata-only records in the same batch', async () => {
        const result = await db.UpdateRecords(
            [
                { id: 'v1', values: [0.1, 0.2], metadata: { Title: 'Full' } },
                { id: 'v2', metadata: { Title: 'MetaOnly' } },
            ],
            'idx-collection',
        );
        expect(result.success).toBe(true);
        expect(mockUpsert).toHaveBeenCalledWith('idx-collection', {
            points: [{ id: 'v1', vector: [0.1, 0.2], payload: { Title: 'Full' } }],
        });
        expect(mockSetPayload).toHaveBeenCalledWith('idx-collection', {
            payload: { Title: 'MetaOnly' },
            points: ['v2'],
        });
    });

    it('fails when no collectionName or indexName is supplied', async () => {
        const result = await db.UpdateRecords([{ id: 'v1', metadata: { Title: 'NoIndex' } }]);
        expect(result.success).toBe(false);
        expect(result.message).toContain('collectionName is required');
    });

    it('preserves the underlying error message when setPayload or upsert rejects', async () => {
        mockSetPayload.mockRejectedValueOnce(new Error('Qdrant connection refused'));
        const result = await db.UpdateRecord({ id: 'v1', metadata: { Title: 'Fail' } }, 'idx-collection');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Qdrant connection refused');
    });

    it('deletes multiple records by id in the target collection', async () => {
        const result = await db.DeleteRecords(
            [
                { id: 'v1', values: [] },
                { id: 'v2', values: [] },
            ],
            'idx-collection',
        );
        expect(result.success).toBe(true);
        expect(mockDelete).toHaveBeenCalledWith('idx-collection', {
            points: ['v1', 'v2'],
        });
    });
});
