import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { SearchResultItem } from '../generic/search.types';

const {
    mockRunViewFn,
    mockKHState,
} = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockKHState: {
        contentSourceTypes: [
            { ID: 'cst-entity-id', Name: 'Entity' },
            { ID: 'cst-web-id', Name: 'Website' },
        ] as Array<{ ID: string; Name: string }>,
        contentSources: [
            { ID: 'cs-web-1', ContentSourceTypeID: 'cst-web-id', Name: 'Docs' },
        ] as Array<{ ID: string; ContentSourceTypeID: string; Name: string }>,
        isPermissionConstrained: false,
        configRejects: false,
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn(async () => {
                if (mockKHState.configRejects) {
                    throw new Error('config failed');
                }
            }),
            get ContentSourceTypes() {
                return mockKHState.contentSourceTypes;
            },
            get ContentSources() {
                return mockKHState.contentSources;
            },
            get IsPermissionConstrained() {
                return mockKHState.isPermissionConstrained;
            },
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: vi.fn().mockImplementation(function (this: { RunView: typeof mockRunViewFn }) {
            this.RunView = mockRunViewFn;
        }),
    };
});

import { SearchEnricher } from '../generic/SearchEnricher';
import { FullTextSearchProvider } from '../generic/FullTextSearchProvider';

const USER = { ID: 'user-1', Email: 'u@example.com' } as UserInfo;

function makeItem(overrides: Partial<SearchResultItem> & { RecordID: string; EntityName: string }): SearchResultItem {
    return {
        ID: overrides.ID ?? overrides.RecordID,
        EntityName: overrides.EntityName,
        RecordID: overrides.RecordID,
        SourceType: overrides.SourceType ?? 'vector',
        ResultType: overrides.ResultType ?? 'content-item',
        Title: overrides.Title ?? `${overrides.EntityName} Record`,
        Snippet: overrides.Snippet ?? 'snippet',
        Score: overrides.Score ?? 0.9,
        ScoreBreakdown: overrides.ScoreBreakdown ?? { Vector: 0.9 },
        Tags: overrides.Tags ?? [],
        MatchedAt: overrides.MatchedAt ?? new Date('2026-01-01'),
        RawMetadata: overrides.RawMetadata,
    };
}

describe('SearchEnricher & FullTextSearchProvider — hot-path optimizations', () => {
    let enricher: SearchEnricher;
    let getEntityRecordNamesSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockKHState.contentSourceTypes = [
            { ID: 'cst-entity-id', Name: 'Entity' },
            { ID: 'cst-web-id', Name: 'Website' },
        ];
        mockKHState.contentSources = [
            { ID: 'cs-web-1', ContentSourceTypeID: 'cst-web-id', Name: 'Docs' },
        ];
        mockKHState.isPermissionConstrained = false;
        mockKHState.configRejects = false;

        getEntityRecordNamesSpy = vi.fn(async () => [{ Success: true, RecordName: 'Resolved Name' }]);
        enricher = new SearchEnricher();
        enricher.Provider = {
            EntityByName: (name: string) => ({
                ID: 'e-1',
                Name: name,
                DisplayName: 'Content Items',
                Icon: 'fa-solid fa-file',
                FirstPrimaryKey: { Name: 'ID' },
            }),
            GetEntityRecordNames: getEntityRecordNamesSpy,
        } as unknown as IMetadataProvider;
    });

    describe('SearchEnricher.Enrich — SkipNameEnrichment', () => {
        it('attaches entity icons & display names while skipping GetEntityRecordNames when SkipNameEnrichment is true', async () => {
            const results = [makeItem({ EntityName: 'MJ: Content Items', RecordID: 'ci-1' })];

            await enricher.Enrich(results, USER, { SkipNameEnrichment: true });

            expect(results[0].EntityIcon).toBe('fa-solid fa-file');
            expect(results[0].EntityDisplayName).toBe('Content Items');
            expect(getEntityRecordNamesSpy).not.toHaveBeenCalled();
        });

        it('resolves record names via GetEntityRecordNames when SkipNameEnrichment is omitted/false', async () => {
            const results = [makeItem({ EntityName: 'MJ: Content Items', RecordID: 'ci-1' })];

            await enricher.Enrich(results, USER);

            expect(getEntityRecordNamesSpy).toHaveBeenCalledTimes(1);
            expect(results[0].RecordName).toBe('Resolved Name');
        });
    });

    describe('SearchEnricher.ExcludeEntitySourcedContentItems — preserves non-Entity EntityRecordDocumentID promotion', () => {
        it('promotes an Upload-sourced content item linked to an EntityRecordDocumentID even when no Entity ContentSource exists', async () => {
            mockKHState.contentSourceTypes = [
                { ID: 'cst-entity-id', Name: 'Entity' },
                { ID: 'cst-upload-id', Name: 'Upload' },
            ];
            mockKHState.contentSources = [
                { ID: 'cs-upload-1', ContentSourceTypeID: 'cst-upload-id', Name: 'Member Uploads' },
            ];
            mockRunViewFn
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'ci-1', ContentSourceID: 'cs-upload-1', EntityRecordDocumentID: 'erd-1' }],
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: 'erd-1', Entity: 'Accounts', RecordID: 'acct-9' }],
                });

            const results = [
                makeItem({
                    EntityName: 'MJ: Content Items',
                    RecordID: 'ci-1',
                    RawMetadata: JSON.stringify({ ContentSourceID: 'cs-upload-1' }),
                }),
            ];

            const output = await enricher.ExcludeEntitySourcedContentItems(results, USER);

            expect(output).toHaveLength(1);
            expect(output[0].EntityName).toBe('Accounts');
            expect(output[0].RecordID).toBe('acct-9');
            expect(mockRunViewFn).toHaveBeenCalledTimes(2);
        });

        it('skips DB lookup when RawMetadata already resolves Entity and RecordID directly', async () => {
            const results = [
                makeItem({
                    EntityName: 'MJ: Content Items',
                    RecordID: 'ci-direct',
                    RawMetadata: JSON.stringify({ Entity: 'Accounts', RecordID: 'acct-42' }),
                }),
            ];

            const output = await enricher.ExcludeEntitySourcedContentItems(results, USER);

            expect(output).toHaveLength(1);
            expect(output[0].EntityName).toBe('Accounts');
            expect(output[0].RecordID).toBe('acct-42');
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });
    });

    describe('FullTextSearchProvider — skip EnrichWithTags without tag filter', () => {
        it('does not call EnrichWithTags when filters.Tags is absent or empty', async () => {
            const provider = new FullTextSearchProvider();
            provider.Provider = {
                FullTextSearch: vi.fn(async () => ({
                    Success: true,
                    Results: [{ RecordID: 'r-1', EntityName: 'MJ: Content Items', Title: 'Doc', Snippet: 'hit', Score: 1 }],
                })),
            } as unknown as IMetadataProvider;
            const enrichTagsSpy = vi.spyOn(enricher, 'EnrichWithTags').mockResolvedValue(undefined);
            provider.SetEnricher(enricher);

            const r1 = await provider.Search('policy', 10, undefined, USER);
            const r2 = await provider.Search('policy', 10, { Tags: [] }, USER);

            expect(r1).toHaveLength(1);
            expect(r2).toHaveLength(1);
            expect(enrichTagsSpy).not.toHaveBeenCalled();
        });

        it('calls EnrichWithTags and FilterByTags when filters.Tags is non-empty', async () => {
            const provider = new FullTextSearchProvider();
            provider.Provider = {
                FullTextSearch: vi.fn(async () => ({
                    Success: true,
                    Results: [{ RecordID: 'r-1', EntityName: 'MJ: Content Items', Title: 'Doc', Snippet: 'hit', Score: 1 }],
                })),
            } as unknown as IMetadataProvider;
            const enrichTagsSpy = vi.spyOn(enricher, 'EnrichWithTags').mockImplementation(async (items) => {
                items[0].Tags = ['hr'];
            });
            provider.SetEnricher(enricher);

            const matched = await provider.Search('policy', 10, { Tags: ['hr'] }, USER);

            expect(enrichTagsSpy).toHaveBeenCalledTimes(1);
            expect(matched).toHaveLength(1);
        });
    });
});
