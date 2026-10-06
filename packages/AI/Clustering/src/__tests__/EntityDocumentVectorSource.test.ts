import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityDocumentVectorSource } from '../adapters/EntityDocumentVectorSource';
import { RunView, UserInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';
import type { MJEntityDocumentEntity, MJEntityRecordDocumentEntity } from '@memberjunction/core-entities';

describe('EntityDocumentVectorSource', () => {
    const mockUser = { ID: 'user-1' } as unknown as UserInfo;

    it('throws when any selected document lacks an AIModelID (e.g. Context document without vectorization)', async () => {
        const mockDocs: Partial<MJEntityDocumentEntity>[] = [
            {
                ID: 'doc-1',
                Name: 'Company Context',
                AIModelID: null as unknown as string,
            },
            {
                ID: 'doc-2',
                Name: 'Customer Profiles',
                AIModelID: 'model-embed-1',
            },
        ];

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Entity Documents') {
                return {
                    Success: true,
                    Results: mockDocs as MJEntityDocumentEntity[],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        });

        const source = new EntityDocumentVectorSource(mockUser);
        await expect(
            source.FetchVectors({
                EntityDocumentIDs: ['doc-1', 'doc-2'],
            })
        ).rejects.toThrow(/Cannot cluster documents without an embedding model/);
    });

    it('throws when selected documents use different embedding models', async () => {
        const mockDocs: Partial<MJEntityDocumentEntity>[] = [
            {
                ID: 'doc-1',
                Name: 'Profiles V1',
                AIModelID: 'model-a',
                AIModel: 'Text-Embedding-3-Small',
            },
            {
                ID: 'doc-2',
                Name: 'Profiles V2',
                AIModelID: 'model-b',
                AIModel: 'Cohere-Embed-V3',
            },
        ];

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Entity Documents') {
                return {
                    Success: true,
                    Results: mockDocs as MJEntityDocumentEntity[],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        });

        const source = new EntityDocumentVectorSource(mockUser);
        await expect(
            source.FetchVectors({
                EntityDocumentIDs: ['doc-1', 'doc-2'],
            })
        ).rejects.toThrow(/Cannot cluster across documents that use different embedding models/);
    });

    it('succeeds and parses vectors when selected documents share the same embedding model', async () => {
        const mockDocs: Partial<MJEntityDocumentEntity>[] = [
            {
                ID: 'doc-1',
                Name: 'Profiles V1',
                AIModelID: 'model-a',
                AIModel: 'Text-Embedding-3-Small',
            },
            {
                ID: 'doc-2',
                Name: 'Profiles V2',
                AIModelID: 'model-a',
                AIModel: 'Text-Embedding-3-Small',
            },
        ];

        const mockRecordsDoc1: Partial<MJEntityRecordDocumentEntity>[] = [
            {
                ID: 'rec-1',
                EntityDocumentID: 'doc-1',
                VectorJSON: JSON.stringify([0.1, 0.2, 0.3]),
                EntityRecordID: 'p-1',
                Entity: 'Persons',
            },
        ];

        const mockRecordsDoc2: Partial<MJEntityRecordDocumentEntity>[] = [
            {
                ID: 'rec-2',
                EntityDocumentID: 'doc-2',
                VectorJSON: JSON.stringify([0.4, 0.5, 0.6]),
                EntityRecordID: 'p-2',
                Entity: 'Persons',
            },
        ];

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Entity Documents') {
                return {
                    Success: true,
                    Results: mockDocs as MJEntityDocumentEntity[],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: Entity Record Documents') {
                const results = params.ExtraFilter?.includes("'doc-1'") ? mockRecordsDoc1 : mockRecordsDoc2;
                return {
                    Success: true,
                    Results: results as MJEntityRecordDocumentEntity[],
                    RowCount: results.length,
                    TotalRowCount: results.length,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            }
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        });

        const source = new EntityDocumentVectorSource(mockUser);
        const vectors = await source.FetchVectors({
            EntityDocumentIDs: ['doc-1', 'doc-2'],
        });

        expect(vectors.length).toBe(2);
        expect(vectors[0].Vector).toEqual([0.1, 0.2, 0.3]);
        expect(vectors[1].Vector).toEqual([0.4, 0.5, 0.6]);
    });
});

describe('EntityDocumentVectorSource — binary vector column', () => {
    const mockUser = { ID: 'user-1' } as unknown as UserInfo;

    /** Base64 of the little-endian float32 bytes — the VectorBinary wire shape. */
    function toBinary(values: number[]): string {
        return Buffer.from(new Float32Array(values).buffer).toString('base64');
    }

    /** Stub RunView so the record query returns `records`; returns the captured record-query params. */
    function stubRecords(records: Partial<MJEntityRecordDocumentEntity>[]): RunViewParams[] {
        const captured: RunViewParams[] = [];
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            const results = params.EntityName === 'MJ: Entity Record Documents' ? records : [];
            if (params.EntityName === 'MJ: Entity Record Documents') captured.push(params);
            return {
                Success: true,
                Results: results as MJEntityRecordDocumentEntity[],
                RowCount: results.length,
                TotalRowCount: results.length,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        });
        return captured;
    }

    function record(id: string, cols: { binary?: string | null; json?: string | null }): Partial<MJEntityRecordDocumentEntity> {
        return {
            ID: id,
            RecordID: `r-${id}`,
            EntityDocumentID: 'doc-1',
            VectorBinary: cols.binary ?? null,
            VectorJSON: cols.json ?? null,
        };
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('selects rows that carry either vector column', async () => {
        const captured = stubRecords([]);

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: 'doc-1' });

        expect(captured).toHaveLength(1);
        expect(captured[0].ExtraFilter).toContain(`EntityDocumentID = 'doc-1'`);
        expect(captured[0].ExtraFilter).toContain('(VectorBinary IS NOT NULL OR VectorJSON IS NOT NULL)');
    });

    // RunView omits binary fields unless asked; without the flag VectorBinary would never arrive and
    // binary-only rows (which pass the filter above) would be silently dropped.
    it('asks RunView to include binary fields on the record-document query', async () => {
        const captured = stubRecords([]);

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: 'doc-1' });

        expect(captured[0].IncludeBinaryFields).toBe(true);
    });

    it('reads a row that has only the binary column', async () => {
        stubRecords([record('a', { binary: toBinary([0.5, -1.5, 0.25]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: 'doc-1' });

        expect(vectors).toHaveLength(1);
        expect(vectors[0].Key).toBe('r-a');
        expect(Array.isArray(vectors[0].Vector)).toBe(true);
        expect(vectors[0].Vector).toEqual([0.5, -1.5, 0.25]);
    });

    it('prefers the binary column over a disagreeing JSON column', async () => {
        stubRecords([record('a', { binary: toBinary([0.5, -1.5, 0.25]), json: JSON.stringify([9, 9, 9]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: 'doc-1' });

        expect(vectors[0].Vector).toEqual([0.5, -1.5, 0.25]);
    });

    it('falls back to JSON when the binary column is not a whole number of float32 values', async () => {
        stubRecords([record('a', { binary: Buffer.from([1, 2, 3]).toString('base64'), json: JSON.stringify([0.1, 0.2]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: 'doc-1' });

        expect(vectors[0].Vector).toEqual([0.1, 0.2]);
    });

    it('falls back to JSON when the binary column holds a non-finite value', async () => {
        stubRecords([record('a', { binary: toBinary([Number.NaN, 1, 2]), json: JSON.stringify([0.1, 0.2, 0.3]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: 'doc-1' });

        expect(vectors[0].Vector).toEqual([0.1, 0.2, 0.3]);
    });

    it('skips a row whose binary is invalid and whose JSON is missing', async () => {
        stubRecords([
            record('bad', { binary: toBinary([Number.POSITIVE_INFINITY, 1]) }),
            record('good', { binary: toBinary([0.5, 0.25]) }),
        ]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: 'doc-1' });

        expect(vectors.map(v => v.Key)).toEqual(['r-good']);
    });
});
