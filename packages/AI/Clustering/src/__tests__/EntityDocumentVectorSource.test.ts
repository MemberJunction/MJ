import { describe, it, expect, vi } from 'vitest';
import { EntityDocumentVectorSource } from '../adapters/EntityDocumentVectorSource';
import { RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
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
