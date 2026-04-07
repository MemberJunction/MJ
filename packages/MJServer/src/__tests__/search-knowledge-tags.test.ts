import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for SearchKnowledgeResolver — focusing on tag enrichment,
 * title extraction, and metadata-to-result conversion logic.
 *
 * The resolver has heavy infrastructure dependencies (type-graphql, vector DBs,
 * embeddings), so we test the pure-logic methods by constructing an instance
 * and accessing them via prototype / casting tricks.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const mockRunViewResults = new Map<string, { Success: boolean; Results: unknown[] }>();

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        async RunView(params: { EntityName: string; ExtraFilter?: string }): Promise<{ Success: boolean; Results: unknown[] }> {
            // Allow tests to set up per-entity results
            for (const [key, val] of mockRunViewResults.entries()) {
                if (params.EntityName === key || (params.ExtraFilter && params.ExtraFilter.includes(key))) {
                    return val;
                }
            }
            return { Success: true, Results: [] };
        }
    }

    const mockEntities = [
        {
            Name: 'Contacts',
            ID: 'entity-contacts-id',
            Icon: 'fa-solid fa-user',
            NameField: { Name: 'FullName', IsNameField: true, Sequence: 1 },
            Fields: [
                { Name: 'ID', IsNameField: false, IsPrimaryKey: true, Sequence: 0, TSType: 'string' },
                { Name: 'FirstName', IsNameField: true, Sequence: 1, TSType: 'string', IsPrimaryKey: false },
                { Name: 'LastName', IsNameField: true, Sequence: 2, TSType: 'string', IsPrimaryKey: false },
                { Name: 'Email', IsNameField: false, Sequence: 3, TSType: 'string', IsPrimaryKey: false },
            ]
        },
        {
            Name: 'Companies',
            ID: 'entity-companies-id',
            Icon: 'fa-solid fa-building',
            NameField: { Name: 'Name', IsNameField: true, Sequence: 1 },
            Fields: [
                { Name: 'ID', IsNameField: false, IsPrimaryKey: true, Sequence: 0, TSType: 'string' },
                { Name: 'Name', IsNameField: true, Sequence: 1, TSType: 'string', IsPrimaryKey: false },
            ]
        },
        {
            Name: 'Events',
            ID: 'entity-events-id',
            Icon: null,
            NameField: null,
            Fields: [
                { Name: 'ID', IsNameField: false, IsPrimaryKey: true, Sequence: 0, TSType: 'string' },
                { Name: 'EventCode', IsNameField: false, Sequence: 1, TSType: 'number', IsPrimaryKey: false },
            ]
        }
    ];

    class MockMetadata {
        Entities = mockEntities;
    }

    return {
        RunView: MockRunView,
        Metadata: MockMetadata,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class {},
        ComputeRRF: vi.fn(),
        ScoredCandidate: class {},
        EntityRecordNameInput: class {},
        CompositeKey: class { LoadFromURLSegment = vi.fn(); },
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJVectorIndexEntity: class {},
    MJVectorDatabaseEntity: class {},
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn(),
            ContentSourceTypes: [],
            ContentSources: [],
        },
    },
}));

vi.mock('@memberjunction/ai', () => ({
    GetAIAPIKey: vi.fn(() => 'mock-key'),
    BaseEmbeddings: class {},
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: class {},
    BaseResponse: class {},
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn(), Models: [] } },
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } },
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));

vi.mock('type-graphql', () => ({
    Resolver: () => (target: unknown) => target,
    Query: () => (target: unknown, key: string, descriptor: PropertyDescriptor) => descriptor,
    Mutation: () => (target: unknown, key: string, descriptor: PropertyDescriptor) => descriptor,
    Arg: () => (target: unknown, key: string, index: number) => {},
    Ctx: () => (target: unknown, key: string, index: number) => {},
    ObjectType: () => (target: unknown) => target,
    Field: () => (target: unknown, key: string) => {},
    Float: Number,
    Int: Number,
    InputType: () => (target: unknown) => target,
}));

vi.mock('../generic/ResolverBase.js', () => ({
    ResolverBase: class {
        GetUserFromPayload() { return {}; }
    },
}));

vi.mock('../types.js', () => ({
    AppContext: class {},
}));

// ── Import under test (after mocks) ──────────────────────────────────

import { SearchKnowledgeResolver } from '../resolvers/SearchKnowledgeResolver.js';

// Helper to access private methods
function getPrivateMethod<T>(instance: T, method: string): (...args: unknown[]) => unknown {
    return (instance as Record<string, unknown>)[method] as (...args: unknown[]) => unknown;
}

describe('SearchKnowledgeResolver', () => {
    let resolver: SearchKnowledgeResolver;

    beforeEach(() => {
        resolver = new SearchKnowledgeResolver();
        mockRunViewResults.clear();
    });

    // ─── extractDisplayTitle ──────────────────────────────────────────

    describe('extractDisplayTitle', () => {
        const extractDisplayTitle = (meta: Record<string, unknown>, fallback: string) =>
            getPrivateMethod(resolver, 'extractDisplayTitle')(meta, fallback) as string;

        it('should combine multiple IsNameField values for a multi-name entity', () => {
            const meta = { Entity: 'Contacts', FirstName: 'Sarah', LastName: 'Chen' };
            const title = extractDisplayTitle(meta, 'Contacts');
            expect(title).toBe('Sarah Chen');
        });

        it('should use single NameField when IsNameField fields are not populated', () => {
            const meta = { Entity: 'Companies', Name: 'Acme Corp' };
            const title = extractDisplayTitle(meta, 'Companies');
            // Companies has Name as IsNameField, so it should use it
            expect(title).toBe('Acme Corp');
        });

        it('should fall back to heuristic fields when no entity metadata matches', () => {
            const meta = { Entity: 'UnknownEntity', Title: 'My Document' };
            const title = extractDisplayTitle(meta, 'UnknownEntity');
            expect(title).toBe('My Document');
        });

        it('should try Name heuristic field', () => {
            const meta = { Entity: 'UnknownEntity', Name: 'Widget A' };
            const title = extractDisplayTitle(meta, 'UnknownEntity');
            expect(title).toBe('Widget A');
        });

        it('should try Subject heuristic field', () => {
            const meta = { Entity: 'NonExistent', Subject: 'RE: Meeting' };
            const title = extractDisplayTitle(meta, 'NonExistent');
            expect(title).toBe('RE: Meeting');
        });

        it('should return fallback when no fields match', () => {
            const meta = { Entity: 'Events', NumericCode: 42 };
            const title = extractDisplayTitle(meta, 'Events');
            expect(title).toBe('Events Record');
        });

        it('should skip empty/whitespace name field values', () => {
            const meta = { Entity: 'Contacts', FirstName: '', LastName: 'Rodriguez' };
            const title = extractDisplayTitle(meta, 'Contacts');
            expect(title).toBe('Rodriguez');
        });

        it('should handle metadata with no Entity key by using heuristics', () => {
            const meta = { Name: 'Fallback Name' };
            const title = extractDisplayTitle(meta, 'SomeEntity');
            expect(title).toBe('Fallback Name');
        });

        it('should return fallback entity record string when all heuristic fields are non-string', () => {
            const meta = { Entity: 'NonExistent', Count: 42, Active: true };
            const title = extractDisplayTitle(meta, 'MyEntity');
            expect(title).toBe('MyEntity Record');
        });
    });

    // ─── extractDisplaySnippet ────────────────────────────────────────

    describe('extractDisplaySnippet', () => {
        const extractDisplaySnippet = (meta: Record<string, unknown>, indexName: string, score?: number) =>
            getPrivateMethod(resolver, 'extractDisplaySnippet')(meta, indexName, score) as string;

        it('should return Description field when present', () => {
            const meta = { Description: 'A detailed description of the record' };
            expect(extractDisplaySnippet(meta, 'idx-1', 0.95)).toBe('A detailed description of the record');
        });

        it('should truncate long descriptions to 200 chars', () => {
            const longDesc = 'A'.repeat(250);
            const meta = { Description: longDesc };
            const snippet = extractDisplaySnippet(meta, 'idx-1');
            expect(snippet.length).toBe(203); // 200 + '...'
            expect(snippet.endsWith('...')).toBe(true);
        });

        it('should build snippet from metadata fields when no description fields exist', () => {
            const meta = { Status: 'Active', Type: 'Premium' };
            const snippet = extractDisplaySnippet(meta, 'idx-1');
            expect(snippet).toContain('Status: Active');
            expect(snippet).toContain('Type: Premium');
        });

        it('should return index fallback when no usable metadata', () => {
            const meta = { RecordID: 'abc-123', Entity: 'Contacts' };
            const snippet = extractDisplaySnippet(meta, 'my-index', 0.85);
            expect(snippet).toContain('my-index');
            expect(snippet).toContain('0.8500');
        });
    });

    // ─── Tag extraction from vector metadata (inline logic) ────────

    describe('tag extraction from vector metadata', () => {
        it('should extract Tags array when present and is an array', () => {
            const meta: Record<string, unknown> = { Tags: ['AI', 'Machine Learning'] };
            const tags = Array.isArray(meta['Tags']) ? (meta['Tags'] as string[]) : [];
            expect(tags).toEqual(['AI', 'Machine Learning']);
        });

        it('should return empty array when Tags is not in metadata', () => {
            const meta: Record<string, unknown> = { Entity: 'Companies', RecordID: 'r2' };
            const tags = Array.isArray(meta['Tags']) ? (meta['Tags'] as string[]) : [];
            expect(tags).toEqual([]);
        });

        it('should return empty array when Tags is not an array', () => {
            const meta: Record<string, unknown> = { Tags: 'not-an-array' };
            const tags = Array.isArray(meta['Tags']) ? (meta['Tags'] as string[]) : [];
            expect(tags).toEqual([]);
        });

        it('should return empty array when metadata is empty', () => {
            const meta: Record<string, unknown> = {};
            const tags = Array.isArray(meta['Tags']) ? (meta['Tags'] as string[]) : [];
            expect(tags).toEqual([]);
        });
    });

    // ─── enrichResultsWithTags ────────────────────────────────────────

    describe('enrichResultsWithTags', () => {
        const enrichResultsWithTags = (
            results: Array<{ EntityName: string; RecordID: string; Tags: string[] }>,
            md: { Entities: Array<{ Name: string; ID: string }> },
            contextUser: unknown
        ) => getPrivateMethod(resolver, 'enrichResultsWithTags')(results, md, contextUser) as Promise<void>;

        it('should not modify results when results array is empty', async () => {
            const results: Array<{ EntityName: string; RecordID: string; Tags: string[] }> = [];
            const md = { Entities: [{ Name: 'Contacts', ID: 'eid-1' }] };
            await enrichResultsWithTags(results, md, {});
            expect(results).toEqual([]);
        });

        it('should not modify results when entity is not found in metadata', async () => {
            const results = [{ EntityName: 'NonExistent', RecordID: 'r1', Tags: [] as string[] }];
            const md = { Entities: [{ Name: 'Contacts', ID: 'eid-1' }] };
            await enrichResultsWithTags(results, md, {});
            expect(results[0].Tags).toEqual([]);
        });

        it('should enrich results with tags from RunView response', async () => {
            const results = [
                { EntityName: 'Contacts', RecordID: 'rec-1', Tags: [] as string[] },
                { EntityName: 'Contacts', RecordID: 'rec-2', Tags: [] as string[] },
            ];

            // Set up mock RunView to return tagged items
            // loadTaggedItemTags queries 'MJ: Tagged Items' with EntityID+RecordID filter
            mockRunViewResults.set('MJ: Tagged Items', {
                Success: true,
                Results: [
                    { EntityID: 'entity-contacts-id', RecordID: 'rec-1', Tag: 'VIP' },
                    { EntityID: 'entity-contacts-id', RecordID: 'rec-1', Tag: 'Partner' },
                    { EntityID: 'entity-contacts-id', RecordID: 'rec-2', Tag: 'Prospect' },
                ]
            });

            // Test loadTaggedItemTags directly since enrichResultsWithTags wraps it in try/catch
            const loadTaggedItemTags = getPrivateMethod(resolver, 'loadTaggedItemTags');
            const { Metadata: MetadataCtor } = await import('@memberjunction/core');
            const md = new MetadataCtor();
            await loadTaggedItemTags(results, md, {});
            expect(results[0].Tags).toEqual(['VIP', 'Partner']);
            expect(results[1].Tags).toEqual(['Prospect']);
        });

        it('should leave existing tags unchanged when RunView fails', async () => {
            const results = [
                { EntityName: 'Contacts', RecordID: 'rec-1', Tags: ['Existing'] },
            ];
            const md = { Entities: [{ Name: 'Contacts', ID: 'eid-contacts' }] };

            mockRunViewResults.set('MJ: Tagged Items', {
                Success: false,
                Results: []
            });

            // enrichResultsWithTags replaces Tags; on RunView failure it returns early
            await enrichResultsWithTags(results, md, {});
            // Tags should remain unchanged since RunView failed before tag assignment
            expect(results[0].Tags).toEqual(['Existing']);
        });
    });

    // ─── deduplicateResults ───────────────────────────────────────────

    describe('deduplicateResults', () => {
        const deduplicateResults = (results: Array<{ EntityName: string; RecordID: string; Score: number }>) =>
            getPrivateMethod(resolver, 'deduplicateResults')(results) as Array<{ EntityName: string; RecordID: string; Score: number }>;

        it('should keep the highest-scored entry for duplicate entity+recordID', () => {
            const results = [
                { EntityName: 'Contacts', RecordID: 'r1', Score: 0.8 },
                { EntityName: 'Contacts', RecordID: 'r1', Score: 0.95 },
                { EntityName: 'Contacts', RecordID: 'r1', Score: 0.7 },
            ];
            const deduped = deduplicateResults(results);
            expect(deduped).toHaveLength(1);
            expect(deduped[0].Score).toBe(0.95);
        });

        it('should keep distinct records from different entities', () => {
            const results = [
                { EntityName: 'Contacts', RecordID: 'r1', Score: 0.8 },
                { EntityName: 'Companies', RecordID: 'r1', Score: 0.7 },
            ];
            const deduped = deduplicateResults(results);
            expect(deduped).toHaveLength(2);
        });

        it('should sort results by score descending', () => {
            const results = [
                { EntityName: 'A', RecordID: 'r1', Score: 0.3 },
                { EntityName: 'B', RecordID: 'r2', Score: 0.9 },
                { EntityName: 'C', RecordID: 'r3', Score: 0.6 },
            ];
            const deduped = deduplicateResults(results);
            expect(deduped[0].Score).toBe(0.9);
            expect(deduped[1].Score).toBe(0.6);
            expect(deduped[2].Score).toBe(0.3);
        });

        it('should return empty array for empty input', () => {
            expect(deduplicateResults([])).toEqual([]);
        });
    });

    // ─── buildPineconeFilter ──────────────────────────────────────────

    describe('buildPineconeFilter', () => {
        const buildPineconeFilter = (filters?: { EntityNames?: string[]; SourceTypes?: string[]; Tags?: string[] }) =>
            getPrivateMethod(resolver, 'buildPineconeFilter')(filters) as object | undefined;

        it('should return undefined for no filters', () => {
            expect(buildPineconeFilter(undefined)).toBeUndefined();
        });

        it('should return undefined for empty filters', () => {
            expect(buildPineconeFilter({})).toBeUndefined();
        });

        it('should return single condition without $and wrapper', () => {
            const result = buildPineconeFilter({ EntityNames: ['Contacts'] });
            expect(result).toEqual({ Entity: { $in: ['Contacts'] } });
        });

        it('should combine multiple filters with $and', () => {
            const result = buildPineconeFilter({
                EntityNames: ['Contacts'],
                Tags: ['VIP']
            }) as Record<string, unknown>;
            expect(result).toHaveProperty('$and');
            const conditions = result['$and'] as object[];
            expect(conditions).toHaveLength(2);
        });
    });
});
