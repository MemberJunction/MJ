import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityDocumentVectorSource } from '../adapters/EntityDocumentVectorSource';
import { RunView, UserInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';
import type { MJEntityDocumentEntity, MJEntityRecordDocumentEntity } from '@memberjunction/core-entities';

const DOC_1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const DOC_2 = 'aaaaaaaa-0000-0000-0000-000000000002';

describe('EntityDocumentVectorSource', () => {
    const mockUser = { ID: 'user-1' } as unknown as UserInfo;

    it('throws when any selected document lacks an AIModelID (e.g. Context document without vectorization)', async () => {
        const mockDocs: Partial<MJEntityDocumentEntity>[] = [
            {
                ID: DOC_1,
                Name: 'Company Context',
                AIModelID: null as unknown as string,
            },
            {
                ID: DOC_2,
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
                EntityDocumentIDs: [DOC_1, DOC_2],
            })
        ).rejects.toThrow(/Cannot cluster documents without an embedding model/);
    });

    it('throws when selected documents use different embedding models', async () => {
        const mockDocs: Partial<MJEntityDocumentEntity>[] = [
            {
                ID: DOC_1,
                Name: 'Profiles V1',
                AIModelID: 'model-a',
                AIModel: 'Text-Embedding-3-Small',
            },
            {
                ID: DOC_2,
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
                EntityDocumentIDs: [DOC_1, DOC_2],
            })
        ).rejects.toThrow(/Cannot cluster across documents that use different embedding models/);
    });

    it('succeeds and parses vectors when selected documents share the same embedding model', async () => {
        const mockDocs: Partial<MJEntityDocumentEntity>[] = [
            {
                ID: DOC_1,
                Name: 'Profiles V1',
                AIModelID: 'model-a',
                AIModel: 'Text-Embedding-3-Small',
            },
            {
                ID: DOC_2,
                Name: 'Profiles V2',
                AIModelID: 'model-a',
                AIModel: 'Text-Embedding-3-Small',
            },
        ];

        const mockRecordsDoc1: Partial<MJEntityRecordDocumentEntity>[] = [
            {
                ID: 'rec-1',
                EntityDocumentID: DOC_1,
                VectorJSON: JSON.stringify([0.1, 0.2, 0.3]),
                EntityRecordID: 'p-1',
                Entity: 'Persons',
            },
        ];

        const mockRecordsDoc2: Partial<MJEntityRecordDocumentEntity>[] = [
            {
                ID: 'rec-2',
                EntityDocumentID: DOC_2,
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
                const results = params.ExtraFilter?.includes(`'${DOC_1}'`) ? mockRecordsDoc1 : mockRecordsDoc2;
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
            EntityDocumentIDs: [DOC_1, DOC_2],
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
            EntityDocumentID: DOC_1,
            VectorBinary: cols.binary ?? null,
            VectorJSON: cols.json ?? null,
        };
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('selects rows that carry either vector column', async () => {
        const captured = stubRecords([]);

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(captured).toHaveLength(1);
        expect(captured[0].ExtraFilter).toContain(`EntityDocumentID = '${DOC_1}'`);
        expect(captured[0].ExtraFilter).toContain('(VectorBinary IS NOT NULL OR VectorJSON IS NOT NULL)');
    });

    // RunView omits binary fields unless asked; without the flag VectorBinary would never arrive and
    // binary-only rows (which pass the filter above) would be silently dropped.
    it('asks RunView to include binary fields on the record-document query', async () => {
        const captured = stubRecords([]);

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(captured[0].IncludeBinaryFields).toBe(true);
    });

    // On the server a cached RunView widens Fields to every column so its slot can serve any field set,
    // which would load each record's DocumentText and hold every vector in the cache.
    it('reads only the columns it uses, bypassing the RunView cache', async () => {
        const captured = stubRecords([]);

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(captured[0].Fields).toEqual(['ID', 'RecordID', 'EntityID', 'Entity', 'EntityDocumentID', 'VectorBinary', 'VectorJSON']);
        expect(captured[0].Fields).not.toContain('DocumentText');
        expect(captured[0].BypassCache).toBe(true);
    });

    it('reads a row that has only the binary column', async () => {
        stubRecords([record('a', { binary: toBinary([0.5, -1.5, 0.25]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(vectors).toHaveLength(1);
        expect(vectors[0].Key).toBe('r-a');
        expect(Array.isArray(vectors[0].Vector)).toBe(true);
        expect(vectors[0].Vector).toEqual([0.5, -1.5, 0.25]);
    });

    it('prefers the binary column over a disagreeing JSON column', async () => {
        stubRecords([record('a', { binary: toBinary([0.5, -1.5, 0.25]), json: JSON.stringify([9, 9, 9]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(vectors[0].Vector).toEqual([0.5, -1.5, 0.25]);
    });

    it('falls back to JSON when the binary column is not a whole number of float32 values', async () => {
        stubRecords([record('a', { binary: Buffer.from([1, 2, 3]).toString('base64'), json: JSON.stringify([0.1, 0.2]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(vectors[0].Vector).toEqual([0.1, 0.2]);
    });

    it('falls back to JSON when the binary column holds a non-finite value', async () => {
        stubRecords([record('a', { binary: toBinary([Number.NaN, 1, 2]), json: JSON.stringify([0.1, 0.2, 0.3]) })]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(vectors[0].Vector).toEqual([0.1, 0.2, 0.3]);
    });

    it('skips a row whose binary is invalid and whose JSON is missing', async () => {
        stubRecords([
            record('bad', { binary: toBinary([Number.POSITIVE_INFINITY, 1]) }),
            record('good', { binary: toBinary([0.5, 0.25]) }),
        ]);

        const vectors = await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: DOC_1 });

        expect(vectors.map(v => v.Key)).toEqual(['r-good']);
    });
});

describe('EntityDocumentVectorSource — caller values in filters', () => {
    const mockUser = { ID: 'user-1' } as unknown as UserInfo;
    const DOC = '11111111-2222-3333-4444-555555555555';
    const marker = "' OR '1'='1";
    const notAUuid = `${DOC}${marker}`;
    const callerFilter = 'EXISTS(SELECT 1 FROM __mj.SomeTable)';

    function okResult(results: Partial<MJEntityDocumentEntity>[] = []) {
        return { Success: true, Results: results as MJEntityDocumentEntity[], RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 1, ErrorMessage: '' };
    }

    function captureFilters(): string[] {
        const filters: string[] = [];
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            filters.push(String(params.ExtraFilter ?? ''));
            return okResult();
        });
        return filters;
    }

    /** A data provider whose client clause screen refuses every clause. */
    class RefusingProvider {
        public readonly screened: Array<{ clause: string; user?: UserInfo }> = [];
        public EntityByName(name: string) {
            return { Name: name };
        }
        public ScreenClientClause(clause: string, _label: string, user?: UserInfo): void {
            this.screened.push({ clause, user });
            throw new Error('clause refused');
        }
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not put an Entity Document ID list entry that is not a UUID into a filter', async () => {
        const filters = captureFilters();

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentIDs: [DOC, notAUuid] }).catch(() => undefined);

        expect(filters.filter((f) => f.includes(marker))).toEqual([]);
    });

    it('does not put a single Entity Document ID that is not a UUID into a filter', async () => {
        const filters = captureFilters();

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityDocumentID: notAUuid }).catch(() => undefined);

        expect(filters.filter((f) => f.includes(marker))).toEqual([]);
    });

    it('does not put an Entity ID that is not a UUID into a filter', async () => {
        const filters = captureFilters();

        await new EntityDocumentVectorSource(mockUser).FetchVectors({ EntityID: notAUuid }).catch(() => undefined);

        expect(filters.filter((f) => f.includes(marker))).toEqual([]);
    });

    it('does not pass the data provider error text to the caller when documents cannot be validated', async () => {
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: 'provider-detail-marker',
        });

        const error = await new EntityDocumentVectorSource(mockUser)
            .FetchVectors({ EntityDocumentIDs: [DOC, '11111111-2222-3333-4444-666666666666'] })
            .then(() => null, (e: Error) => e);

        expect(error).not.toBeNull();
        expect(error?.message).not.toContain('provider-detail-marker');
    });

    it('does not run a caller Filter that the client clause screen refuses for the caller', async () => {
        const filters = captureFilters();
        const provider = new RefusingProvider();

        await new EntityDocumentVectorSource(mockUser, provider as unknown as IMetadataProvider)
            .FetchVectors({ EntityDocumentID: DOC, Filter: callerFilter })
            .catch(() => undefined);

        expect(filters.filter((f) => f.includes(callerFilter))).toEqual([]);
        expect(provider.screened).toEqual([{ clause: callerFilter, user: mockUser }]);
    });

    it('does not run a caller Filter when the data provider cannot screen it', async () => {
        const filters = captureFilters();
        const provider = { EntityByName: (name: string) => ({ Name: name }) };

        await new EntityDocumentVectorSource(mockUser, provider as unknown as IMetadataProvider)
            .FetchVectors({ EntityDocumentID: DOC, Filter: callerFilter })
            .catch(() => undefined);

        expect(filters.filter((f) => f.includes(callerFilter))).toEqual([]);
    });
});
