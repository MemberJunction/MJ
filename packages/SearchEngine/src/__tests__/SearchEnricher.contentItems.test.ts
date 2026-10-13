import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchEnricher } from '../generic/SearchEnricher';
import { SearchResultItem } from '../generic/search.types';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

// Mock KnowledgeHubMetadataEngine and RunView with hoisted vars
const { mockContentSourceTypes, mockContentSources, mockRunViewFn } = vi.hoisted(() => {
    return {
        mockContentSourceTypes: [
            { ID: 'cst-entity-id', Name: 'Entity' },
            { ID: 'cst-web-id', Name: 'Website' }
        ],
        mockContentSources: [
            { ID: 'cs-entity-1', ContentSourceTypeID: 'cst-entity-id', Name: 'Core Entities' },
            { ID: 'cs-web-1', ContentSourceTypeID: 'cst-web-id', Name: 'Company Docs' }
        ],
        mockRunViewFn: vi.fn()
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            ContentSourceTypes: mockContentSourceTypes,
            ContentSources: mockContentSources
        }
    }
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: vi.fn().mockImplementation(function (this: { RunView: typeof mockRunViewFn }) {
            this.RunView = mockRunViewFn;
        })
    };
});

function makeResult(overrides: Partial<SearchResultItem> & { RecordID: string; EntityName: string }): SearchResultItem {
    return {
        ID: overrides.ID ?? `item-${overrides.RecordID}`,
        EntityName: overrides.EntityName,
        RecordID: overrides.RecordID,
        SourceType: overrides.SourceType ?? 'vector',
        ResultType: overrides.ResultType ?? 'content-item',
        Title: overrides.Title ?? `Title ${overrides.RecordID}`,
        Snippet: overrides.Snippet ?? 'Sample snippet',
        Score: overrides.Score ?? 0.85,
        ScoreBreakdown: overrides.ScoreBreakdown ?? { vector: 0.85 },
        Tags: overrides.Tags ?? [],
        MatchedAt: overrides.MatchedAt ?? new Date('2026-01-01'),
        RawMetadata: overrides.RawMetadata
    };
}

describe('SearchEnricher - Option B Content Item Promotion & Exclusion', () => {
    let enricher: SearchEnricher;
    let mockUser: UserInfo;
    let mockMetadataProvider: IMetadataProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        enricher = new SearchEnricher();
        mockUser = { ID: 'user-1', Email: 'test@example.com' } as UserInfo;

        mockMetadataProvider = {
            EntityByName: vi.fn().mockImplementation((name: string) => {
                if (name === 'MJ: Products' || name === 'Products') {
                    return { ID: 'entity-prod-id', Name: 'Products', Icon: 'fa-solid fa-box' };
                }
                if (name === 'MJ: Accounts' || name === 'Accounts') {
                    return { ID: 'entity-acc-id', Name: 'Accounts', Icon: 'fa-solid fa-building' };
                }
                return null;
            })
        } as unknown as IMetadataProvider;

        enricher.Provider = mockMetadataProvider;
    });

    it('passes non-Content-Item results through untouched', async () => {
        const results = [
            makeResult({ EntityName: 'MJ: Products', RecordID: 'prod-1' }),
            makeResult({ EntityName: 'MJ: Users', RecordID: 'user-1' })
        ];

        const output = await enricher.ExcludeEntitySourcedContentItems(results, mockUser);
        expect(output).toHaveLength(2);
        expect(output[0].EntityName).toBe('MJ: Products');
        expect(output[1].EntityName).toBe('MJ: Users');
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('promotes content items directly when RawMetadata contains Entity and RecordID', async () => {
        const results = [
            makeResult({
                EntityName: 'MJ: Content Items',
                RecordID: 'ci-100',
                Score: 0.92,
                Snippet: 'Vector snippet about widget',
                RawMetadata: JSON.stringify({ Entity: 'MJ: Products', RecordID: 'prod-999' })
            })
        ];

        const output = await enricher.ExcludeEntitySourcedContentItems(results, mockUser);
        expect(output).toHaveLength(1);
        expect(output[0].EntityName).toBe('MJ: Products');
        expect(output[0].RecordID).toBe('prod-999');
        expect(output[0].ID).toBe('prod-999');
        expect(output[0].ResultType).toBe('entity-record');
        expect(output[0].Title).toBe('MJ: Products Record');
        expect(output[0].EntityIcon).toBe('fa-solid fa-box');
        expect(output[0].Score).toBe(0.92);
        expect(output[0].Snippet).toBe('Vector snippet about widget');
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('promotes content items via RunView when RawMetadata does not have Entity info', async () => {
        const results = [
            makeResult({
                EntityName: 'MJ: Content Items',
                RecordID: 'ci-200',
                Score: 0.88,
                Snippet: 'Vector snippet for account record'
            })
        ];

        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Content Items') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'ci-200',
                            ContentSourceID: 'cs-entity-1',
                            EntityRecordDocumentID: 'erd-500'
                        }
                    ]
                };
            }
            if (params.EntityName === 'MJ: Entity Record Documents') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'erd-500',
                            Entity: 'MJ: Accounts',
                            RecordID: 'acc-888'
                        }
                    ]
                };
            }
            return { Success: false, Results: [] };
        });

        const output = await enricher.ExcludeEntitySourcedContentItems(results, mockUser);
        expect(output).toHaveLength(1);
        expect(output[0].EntityName).toBe('MJ: Accounts');
        expect(output[0].RecordID).toBe('acc-888');
        expect(output[0].ResultType).toBe('entity-record');
        expect(output[0].EntityIcon).toBe('fa-solid fa-building');
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);
    });

    it('handles case differences in UUIDs between result and DB records', async () => {
        const results = [
            makeResult({
                EntityName: 'MJ: Content Items',
                RecordID: 'CI-UPPERCASE-300',
                Score: 0.88
            })
        ];

        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Content Items') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'ci-uppercase-300',
                            ContentSourceID: 'cs-entity-1',
                            EntityRecordDocumentID: 'ERD-700'
                        }
                    ]
                };
            }
            if (params.EntityName === 'MJ: Entity Record Documents') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'erd-700',
                            Entity: 'MJ: Products',
                            RecordID: 'prod-case-test'
                        }
                    ]
                };
            }
            return { Success: false, Results: [] };
        });

        const output = await enricher.ExcludeEntitySourcedContentItems(results, mockUser);
        expect(output).toHaveLength(1);
        expect(output[0].EntityName).toBe('MJ: Products');
        expect(output[0].RecordID).toBe('prod-case-test');
    });

    it('drops entity-sourced content items that fail to resolve an entity record', async () => {
        const results = [
            makeResult({
                EntityName: 'MJ: Content Items',
                RecordID: 'ci-orphan',
                Score: 0.81
            })
        ];

        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Content Items') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'ci-orphan',
                            ContentSourceID: 'cs-entity-1',
                            EntityRecordDocumentID: null // Entity source without ERD link
                        }
                    ]
                };
            }
            return { Success: false, Results: [] };
        });

        const output = await enricher.ExcludeEntitySourcedContentItems(results, mockUser);
        expect(output).toHaveLength(0);
    });

    it('preserves genuine external unstructured content items as MJ: Content Items', async () => {
        const results = [
            makeResult({
                EntityName: 'MJ: Content Items',
                RecordID: 'ci-web-doc',
                Title: 'Company Handbook PDF',
                Score: 0.95
            })
        ];

        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Content Items') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'ci-web-doc',
                            ContentSourceID: 'cs-web-1', // Website / external doc source
                            EntityRecordDocumentID: null
                        }
                    ]
                };
            }
            return { Success: false, Results: [] };
        });

        const output = await enricher.ExcludeEntitySourcedContentItems(results, mockUser);
        expect(output).toHaveLength(1);
        expect(output[0].EntityName).toBe('MJ: Content Items');
        expect(output[0].RecordID).toBe('ci-web-doc');
        expect(output[0].Title).toBe('Company Handbook PDF');
        expect(output[0].ResultType).toBe('content-item');
    });

    it('merges cleanly with direct entity hit when deduplicated after promotion', async () => {
        const results = [
            makeResult({
                EntityName: 'MJ: Content Items',
                RecordID: 'ci-300',
                Score: 0.90,
                Snippet: 'Snippet from vector indexed content item',
                ScoreBreakdown: { vector: 0.90 },
                RawMetadata: JSON.stringify({ Entity: 'MJ: Products', RecordID: 'prod-42' })
            }),
            makeResult({
                EntityName: 'MJ: Products',
                RecordID: 'prod-42',
                Score: 0.85,
                Snippet: 'Matched record',
                ScoreBreakdown: { entity: 0.85 }
            })
        ];

        // 1. Promote
        const promoted = await enricher.ExcludeEntitySourcedContentItems(results, mockUser);
        expect(promoted).toHaveLength(2);
        expect(promoted[0].EntityName).toBe('MJ: Products');
        expect(promoted[0].RecordID).toBe('prod-42');
        expect(promoted[1].EntityName).toBe('MJ: Products');
        expect(promoted[1].RecordID).toBe('prod-42');

        // 2. Import SearchFusion and Deduplicate
        const { SearchFusion } = await import('../generic/SearchFusion');
        const fusion = new SearchFusion();
        const deduplicated = fusion.Deduplicate(promoted);

        expect(deduplicated).toHaveLength(1);
        expect(deduplicated[0].EntityName).toBe('MJ: Products');
        expect(deduplicated[0].RecordID).toBe('prod-42');
        expect(deduplicated[0].Score).toBe(0.90); // Preserves highest score
        expect(deduplicated[0].ScoreBreakdown).toEqual({ vector: 0.90, entity: 0.85 }); // Merges score breakdowns
        expect(deduplicated[0].Snippet).toBe('Snippet from vector indexed content item'); // Prefers richer snippet over 'Matched record'
    });
});
