import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@angular/core', () => {
    class MockEventEmitter {
        emit = vi.fn();
    }
    return {
        Component: () => (target: unknown) => target,
        Directive: () => (target: unknown) => target,
        Input: () => (target: unknown, key: string) => {},
        Output: () => (target: unknown, key: string) => {},
        EventEmitter: MockEventEmitter,
        OnInit: undefined,
        inject: vi.fn(),
    };
});

// BaseAngularComponent uses @Directive() at runtime — mock it so tests don't pull in real Angular DI.
vi.mock('@memberjunction/ng-base-types', async () => {
    // Lazy-instantiate the MockMetadata from the @memberjunction/core mock so the fallback
    // matches what real BaseAngularComponent does (`return this.Provider || Metadata.Provider`).
    const core = await import('@memberjunction/core');
    class MockBaseAngularComponent {
        Provider: unknown = null;
        get ProviderToUse(): unknown {
            return this.Provider ?? new (core as unknown as { Metadata: new () => unknown }).Metadata();
        }
    }
    return { BaseAngularComponent: MockBaseAngularComponent };
});

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        RunView = mockRunViewFn;
        // Multi-provider migration: code now uses RunView.FromMetadataProvider(...) instead of `new RunView()`.
        // Return a fresh instance — the test doesn't assert on the provider, only on RunView results.
        static FromMetadataProvider(_p: unknown) { return new MockRunView(); }
    }
    class MockBaseEntity {}
    class MockMetadata {
        Entities = [
            { Name: 'Contacts', ID: 'entity-contacts', Icon: 'fa-solid fa-user', Fields: [{ Name: 'FullName', IsNameField: true, Sequence: 1 }] },
            { Name: 'Companies', ID: 'entity-companies', Icon: 'fa-solid fa-building', Fields: [{ Name: 'Name', IsNameField: true, Sequence: 1 }] },
            { Name: 'Tasks', ID: 'entity-tasks', Icon: null, Fields: [] },
        ];
        GetEntityRecordName = vi.fn().mockResolvedValue(null);
    }
    class MockCompositeKey {
        LoadFromURLSegment = vi.fn();
    }
    return {
        RunView: MockRunView,
        BaseEntity: MockBaseEntity,
        Metadata: MockMetadata,
        CompositeKey: MockCompositeKey,
    };
});

vi.mock('@memberjunction/core-entities', () => {
    class MockMJTaggedItemEntity {
        ID = '';
        TagID = '';
        Tag = '';
        Weight = 0;
        Delete = vi.fn();
    }
    class MockKnowledgeHubMetadataEngine {
        static get Instance(): MockKnowledgeHubMetadataEngine {
            return new MockKnowledgeHubMetadataEngine();
        }
        GetEntityDocumentsForEntity = vi.fn().mockReturnValue([]);
    }
    return {
        MJTaggedItemEntity: MockMJTaggedItemEntity,
        KnowledgeHubMetadataEngine: MockKnowledgeHubMetadataEngine,
    };
});

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
    NormalizeUUID: (uuid: string) => uuid?.toLowerCase() ?? '',
}));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        Instance: { ExecuteGQL: vi.fn().mockResolvedValue({}) },
    },
}));

vi.mock('@memberjunction/ng-word-cloud', () => ({
    WordCloudItem: class {},
    WordCloudItemEvent: class {},
}));

import { RecordTagsComponent, RelatedRecord } from '../lib/record-tags.component';

// Helper to access private methods that return a value
function callPrivate<T>(instance: T, method: string, ...args: unknown[]): unknown {
    return (instance as Record<string, (...args: unknown[]) => unknown>)[method](...args);
}

describe('RecordTagsComponent — Related Records', () => {
    let component: RecordTagsComponent;

    beforeEach(() => {
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        component = new RecordTagsComponent();

        // Wire up a mock Record with entity info and primary key
        component.Record = {
            EntityInfo: {
                ID: 'entity-contacts',
                Name: 'Contacts',
                Fields: [],
            },
            PrimaryKey: {
                Values: () => 'pk-123',
            },
        } as unknown as import('@memberjunction/core').BaseEntity;
    });

    // ─── FormatScore ──────────────────────────────────────────────────

    describe('FormatScore', () => {
        it('should format 1.0 as "100%"', () => {
            expect(component.FormatScore(1.0)).toBe('100%');
        });

        it('should format 0 as "0%"', () => {
            expect(component.FormatScore(0)).toBe('0%');
        });

        it('should format 0.5 as "50%"', () => {
            expect(component.FormatScore(0.5)).toBe('50%');
        });

        it('should format 0.333 as "33%"', () => {
            expect(component.FormatScore(0.333)).toBe('33%');
        });

        it('should format 0.667 as "67%"', () => {
            expect(component.FormatScore(0.667)).toBe('67%');
        });

        it('should format 0.999 as "100%"', () => {
            expect(component.FormatScore(0.999)).toBe('100%');
        });

        it('should format 0.001 as "0%"', () => {
            expect(component.FormatScore(0.001)).toBe('0%');
        });
    });

    // ─── LoadTagRelatedRecords grouping and scoring ──────────────────

    describe('LoadTagRelatedRecords', () => {
        it('should return empty when TaggedItems is empty', async () => {
            component.TaggedItems = [];
            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];
            expect(results).toEqual([]);
        });

        it('should return empty when no tagIDs are available', async () => {
            component.TaggedItems = [
                { TagID: null, Tag: 'Orphan', Weight: 0.5 } as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity,
            ];
            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];
            expect(results).toEqual([]);
        });

        it('should group related items by entity+recordID and accumulate tags', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
                { TagID: 'tag-2', Tag: 'ML', Weight: 0.7, ID: 'ti-2' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [
                        { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 0.8 },
                        { TagID: 'tag-2', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'ML', Entity: 'Companies', Weight: 0.6 },
                        { TagID: 'tag-1', EntityID: 'entity-contacts', RecordID: 'contact-99', Tag: 'AI', Entity: 'Contacts', Weight: 0.5 },
                    ]
                });

            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            // comp-1 should have 2 shared tags, contact-99 should have 1
            expect(results.length).toBe(2);

            const comp = results.find(r => r.RecordID === 'comp-1');
            expect(comp).toBeDefined();
            expect(comp!.SharedTags).toContain('AI');
            expect(comp!.SharedTags).toContain('ML');
            expect(comp!.EntityName).toBe('Companies');

            const contact = results.find(r => r.RecordID === 'contact-99');
            expect(contact).toBeDefined();
            expect(contact!.SharedTags).toEqual(['AI']);
        });

        it('should sort related records by total weight descending', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'low', Tag: 'AI', Entity: 'Companies', Weight: 0.2 },
                    { TagID: 'tag-1', EntityID: 'entity-contacts', RecordID: 'high', Tag: 'AI', Entity: 'Contacts', Weight: 0.9 },
                    { TagID: 'tag-1', EntityID: 'entity-tasks', RecordID: 'mid', Tag: 'AI', Entity: 'Tasks', Weight: 0.5 },
                ]
            });

            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            expect(results[0].RecordID).toBe('high');
            expect(results[1].RecordID).toBe('mid');
            expect(results[2].RecordID).toBe('low');
        });

        it('should limit related records to 10', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            // Generate 15 related records
            const results = Array.from({ length: 15 }, (_, i) => ({
                TagID: 'tag-1',
                EntityID: `entity-${i}`,
                RecordID: `rec-${i}`,
                Tag: 'AI',
                Entity: `Entity${i}`,
                Weight: 0.5,
            }));

            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: results });

            const related = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            expect(related.length).toBeLessThanOrEqual(10);
        });

        it('should set Source to "tags" for tag-based related records', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 0.8 },
                ]
            });

            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            expect(results[0].Source).toBe('tags');
        });

        it('should cap Score at 1.0', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 5.0 },
                ]
            });

            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            expect(results[0].Score).toBeLessThanOrEqual(1);
        });

        it('should resolve entity icons from metadata', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 0.8 },
                    { TagID: 'tag-1', EntityID: 'entity-tasks', RecordID: 'task-1', Tag: 'AI', Entity: 'Tasks', Weight: 0.5 },
                ]
            });

            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            const comp = results.find(r => r.EntityName === 'Companies');
            expect(comp!.EntityIcon).toBe('fa-solid fa-building');

            const task = results.find(r => r.EntityName === 'Tasks');
            expect(task!.EntityIcon).toBe('fa-solid fa-table'); // fallback
        });

        it('should return empty on RunView failure', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({ Success: false, Results: [] });

            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            expect(results).toEqual([]);
        });

        it('should not add duplicate tags for the same record', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [
                    // Same entity+record, same tag appearing twice
                    { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 0.8 },
                    { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 0.8 },
                ]
            });

            const results = await callPrivate(component, 'LoadTagRelatedRecords') as RelatedRecord[];

            const comp = results.find(r => r.RecordID === 'comp-1');
            expect(comp!.SharedTags).toEqual(['AI']); // No duplicate
        });
    });

    // ─── MergeRelatedResults ─────────────────────────────────────────

    describe('MergeRelatedResults', () => {
        it('should merge tag-only and vector-only results', () => {
            const tagResults: RelatedRecord[] = [
                { EntityName: 'Companies', RecordID: 'comp-1', DisplayName: 'Company 1', EntityIcon: 'fa-solid fa-building', Score: 0.8, Source: 'tags', SharedTags: ['AI'] },
            ];
            const vectorResults: RelatedRecord[] = [
                { EntityName: 'Contacts', RecordID: 'contact-1', DisplayName: 'Contact 1', EntityIcon: 'fa-solid fa-user', Score: 0.7, Source: 'vectors', SharedTags: [] },
            ];

            const merged = callPrivate(component, 'MergeRelatedResults', tagResults, vectorResults) as RelatedRecord[];
            expect(merged).toHaveLength(2);
            expect(merged[0].RecordID).toBe('comp-1'); // Higher score first
            expect(merged[1].RecordID).toBe('contact-1');
        });

        it('should boost score and set Source to "both" for overlapping records', () => {
            const tagResults: RelatedRecord[] = [
                { EntityName: 'Companies', RecordID: 'comp-1', DisplayName: 'Company 1', EntityIcon: 'fa-solid fa-building', Score: 0.6, Source: 'tags', SharedTags: ['AI'] },
            ];
            const vectorResults: RelatedRecord[] = [
                { EntityName: 'Companies', RecordID: 'comp-1', DisplayName: 'Company 1', EntityIcon: 'fa-solid fa-building', Score: 0.8, Source: 'vectors', SharedTags: ['ML'] },
            ];

            const merged = callPrivate(component, 'MergeRelatedResults', tagResults, vectorResults) as RelatedRecord[];
            expect(merged).toHaveLength(1);
            expect(merged[0].Source).toBe('both');
            // Boosted: (0.6 + 0.8) / 1.5 ≈ 0.933
            expect(merged[0].Score).toBeCloseTo(0.933, 2);
            expect(merged[0].SharedTags).toContain('AI');
            expect(merged[0].SharedTags).toContain('ML');
        });

        it('should return empty for two empty arrays', () => {
            const merged = callPrivate(component, 'MergeRelatedResults', [], []) as RelatedRecord[];
            expect(merged).toEqual([]);
        });

        it('should sort merged results by score descending', () => {
            const tagResults: RelatedRecord[] = [
                { EntityName: 'A', RecordID: 'low', DisplayName: 'Low', EntityIcon: '', Score: 0.2, Source: 'tags', SharedTags: [] },
            ];
            const vectorResults: RelatedRecord[] = [
                { EntityName: 'B', RecordID: 'high', DisplayName: 'High', EntityIcon: '', Score: 0.9, Source: 'vectors', SharedTags: [] },
            ];

            const merged = callPrivate(component, 'MergeRelatedResults', tagResults, vectorResults) as RelatedRecord[];
            expect(merged[0].RecordID).toBe('high');
            expect(merged[1].RecordID).toBe('low');
        });
    });

    // ─── BuildCloudItems ──────────────────────────────────────────────

    describe('BuildCloudItems', () => {
        it('should convert tagged items to word cloud items', () => {
            const items = [
                { Tag: 'AI', Weight: 0.9, ID: 'ti-1', TagID: 'tag-1' },
                { Tag: 'ML', Weight: 0.5, ID: 'ti-2', TagID: 'tag-2' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            const cloudItems = callPrivate(component, 'BuildCloudItems', items) as Array<{ Text: string; Weight: number }>;
            expect(cloudItems).toHaveLength(2);
            expect(cloudItems[0].Text).toBe('AI');
            expect(cloudItems[0].Weight).toBe(0.9);
            expect(cloudItems[1].Text).toBe('ML');
        });

        it('should return empty array for no items', () => {
            const cloudItems = callPrivate(component, 'BuildCloudItems', []) as unknown[];
            expect(cloudItems).toEqual([]);
        });
    });
});
