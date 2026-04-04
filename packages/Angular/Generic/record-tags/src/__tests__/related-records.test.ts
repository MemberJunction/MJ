import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@angular/core', () => {
    class MockEventEmitter {
        emit = vi.fn();
    }
    return {
        Component: () => (target: unknown) => target,
        Input: () => (target: unknown, key: string) => {},
        Output: () => (target: unknown, key: string) => {},
        EventEmitter: MockEventEmitter,
        OnInit: undefined,
        inject: vi.fn(),
    };
});

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        RunView = mockRunViewFn;
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
    return { MJTaggedItemEntity: MockMJTaggedItemEntity };
});

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
    NormalizeUUID: (uuid: string) => uuid?.toLowerCase() ?? '',
}));

vi.mock('@memberjunction/ng-word-cloud', () => ({
    WordCloudItem: class {},
    WordCloudItemEvent: class {},
}));

import { RecordTagsComponent, RelatedRecord } from '../lib/record-tags.component';

// Helper to access private methods
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

    // ─── LoadRelatedRecords grouping and scoring ──────────────────────

    describe('LoadRelatedRecords', () => {
        it('should not load when TaggedItems is empty', async () => {
            component.TaggedItems = [];
            await callPrivate(component, 'LoadRelatedRecords');
            expect(component.RelatedRecords).toEqual([]);
            expect(component.IsLoadingRelated).toBe(false);
        });

        it('should not load when no tagIDs are available', async () => {
            component.TaggedItems = [
                { TagID: null, Tag: 'Orphan', Weight: 0.5 } as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity,
            ];
            await callPrivate(component, 'LoadRelatedRecords');
            expect(component.RelatedRecords).toEqual([]);
        });

        it('should group related items by entity+recordID and accumulate tags', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
                { TagID: 'tag-2', Tag: 'ML', Weight: 0.7, ID: 'ti-2' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            // LoadRelatedRecords makes one RunView call for related tagged items
            mockRunViewFn
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [
                        { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 0.8 },
                        { TagID: 'tag-2', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'ML', Entity: 'Companies', Weight: 0.6 },
                        { TagID: 'tag-1', EntityID: 'entity-contacts', RecordID: 'contact-99', Tag: 'AI', Entity: 'Contacts', Weight: 0.5 },
                    ]
                });

            await callPrivate(component, 'LoadRelatedRecords');

            // comp-1 should have 2 shared tags, contact-99 should have 1
            expect(component.RelatedRecords.length).toBe(2);

            const comp = component.RelatedRecords.find(r => r.RecordID === 'comp-1');
            expect(comp).toBeDefined();
            expect(comp!.SharedTags).toContain('AI');
            expect(comp!.SharedTags).toContain('ML');
            expect(comp!.EntityName).toBe('Companies');

            const contact = component.RelatedRecords.find(r => r.RecordID === 'contact-99');
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

            await callPrivate(component, 'LoadRelatedRecords');

            expect(component.RelatedRecords[0].RecordID).toBe('high');
            expect(component.RelatedRecords[1].RecordID).toBe('mid');
            expect(component.RelatedRecords[2].RecordID).toBe('low');
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

            await callPrivate(component, 'LoadRelatedRecords');

            expect(component.RelatedRecords.length).toBeLessThanOrEqual(10);
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

            await callPrivate(component, 'LoadRelatedRecords');

            expect(component.RelatedRecords[0].Source).toBe('tags');
        });

        it('should cap Score at 1.0', async () => {
            // 3 tagged items, related record shares a tag with weight 5 (hypothetical)
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [
                    { TagID: 'tag-1', EntityID: 'entity-companies', RecordID: 'comp-1', Tag: 'AI', Entity: 'Companies', Weight: 5.0 },
                ]
            });

            await callPrivate(component, 'LoadRelatedRecords');

            expect(component.RelatedRecords[0].Score).toBeLessThanOrEqual(1);
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

            await callPrivate(component, 'LoadRelatedRecords');

            const comp = component.RelatedRecords.find(r => r.EntityName === 'Companies');
            expect(comp!.EntityIcon).toBe('fa-solid fa-building');

            const task = component.RelatedRecords.find(r => r.EntityName === 'Tasks');
            expect(task!.EntityIcon).toBe('fa-solid fa-table'); // fallback
        });

        it('should handle RunView failure gracefully', async () => {
            component.TaggedItems = [
                { TagID: 'tag-1', Tag: 'AI', Weight: 0.9, ID: 'ti-1' },
            ] as unknown as import('@memberjunction/core-entities').MJTaggedItemEntity[];

            mockRunViewFn.mockResolvedValueOnce({ Success: false, Results: [] });

            await callPrivate(component, 'LoadRelatedRecords');

            expect(component.RelatedRecords).toEqual([]);
            expect(component.IsLoadingRelated).toBe(false);
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

            await callPrivate(component, 'LoadRelatedRecords');

            const comp = component.RelatedRecords.find(r => r.RecordID === 'comp-1');
            expect(comp!.SharedTags).toEqual(['AI']); // No duplicate
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
